import { useMemo, useState } from 'react'
import { sb } from '../lib/supabase'
import { usePais } from '../lib/pais'
import { fmtFechaHora, MESES } from '../lib/fechas'
import { ESTADOS_IMPORTABLES, leerBitacora, type FilaImportar, type ResultadoLectura } from '../lib/bitacora'
import { leerCit, type ResultadoLecturaCit } from '../lib/cit'
import { P, type Permisos } from '../lib/permisos'
import type { Json } from '../types/database.types'

const LOTE = 500

const nombrePeriodo = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`

// Importación única: la bitácora trae los créditos y el CIT decide el período (año-mes) de cada uno, cruzando por la llave
// de crédito (Comprobante_Consecutivo = tipo_doc_numero_doc). Un crédito que está en el CIT queda en el mes de su
// f_ultima_formalizacion; uno que no está, en el mes de su Fecha Formalizado de la bitácora.
export default function Importar({ permisos }: { permisos: Permisos }) {
  const { pais } = usePais()
  const puedeCit = permisos.has(P.citImportar)
  const [archivoBitacora, setArchivoBitacora] = useState('')
  const [archivoCit, setArchivoCit] = useState('')
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null)
  const [cit, setCit] = useState<ResultadoLecturaCit | null>(null)
  const [elegidos, setElegidos] = useState<Set<string> | null>(null) // null = selección por defecto
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState('')
  const [error, setError] = useState('')

  async function elegirBitacora(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setResultado('')
    setArchivoBitacora(f.name)
    setLectura(leerBitacora(await f.text(), pais.zona_horaria))
    setElegidos(null)
  }

  async function elegirCit(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setResultado('')
    setArchivoCit(f.name)
    try {
      setCit(await leerCit(f))
    } catch (err) {
      setCit(null)
      setError(`No se pudo leer el CIT: ${err instanceof Error ? err.message : String(err)}`)
    }
    setElegidos(null)
  }

  // Unión de llaves: el CIT reasigna el período de cada crédito de la bitácora
  const union = useMemo(() => {
    if (!lectura) return null
    const periodoCit = new Map<string, string>()
    for (const c of cit?.elegibles ?? []) periodoCit.set(c.llave_credito, c.f_ultima_formalizacion.slice(0, 7))
    let enCit = 0
    const filas: FilaImportar[] = lectura.elegibles.map((r) => {
      const p = r.llave ? periodoCit.get(r.llave) : undefined
      if (!p) return r
      enCit++
      return { ...r, periodo: p }
    })
    const llavesBitacora = new Set(lectura.elegibles.map((r) => r.llave))
    const citSinBitacora = (cit?.elegibles ?? []).filter((c) => !llavesBitacora.has(c.llave_credito)).length
    const porPeriodo = new Map<string, number>()
    for (const r of filas) porPeriodo.set(r.periodo, (porPeriodo.get(r.periodo) ?? 0) + 1)
    const periodos = [...porPeriodo.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    return { filas, enCit, citSinBitacora, periodos, periodosCit: new Set(periodoCit.values()) }
  }, [lectura, cit])

  // Por defecto se importan los períodos que trae el CIT (sin CIT, todos)
  const seleccion = useMemo(() => {
    if (elegidos) return elegidos
    if (!union) return new Set<string>()
    const conCit = union.periodos.map(([p]) => p).filter((p) => union.periodosCit.has(p))
    return new Set(conCit.length ? conCit : union.periodos.map(([p]) => p))
  }, [elegidos, union])

  const aImportar = useMemo(() => (union ? union.filas.filter((r) => seleccion.has(r.periodo)) : []), [union, seleccion])

  function alternarPeriodo(p: string) {
    const n = new Set(seleccion)
    if (n.has(p)) n.delete(p)
    else n.add(p)
    setElegidos(n)
  }

  async function importar() {
    if (!lectura || aImportar.length === 0) return
    setTrabajando(true)
    setError('')
    setResultado('')

    const { data: cargaId, error: e1 } = await sb.rpc('crear_carga', { p_pais: pais.id, p_archivo: archivoBitacora, p_total: lectura.totalFilas })
    if (e1 || !cargaId) {
      setError(e1?.message ?? 'No se pudo crear la carga.')
      setTrabajando(false)
      return
    }

    let nuevos = 0
    for (let i = 0; i < aImportar.length; i += LOTE) {
      const lote = aImportar.slice(i, i + LOTE)
      const { data, error } = await sb.rpc('importar_lote', { p_carga: cargaId, p_filas: lote as unknown as Json })
      if (error) {
        setError(`Falló el lote que empieza en la fila ${i + 1}: ${error.message}. Nuevos insertados hasta aquí: ${nuevos}. La carga quedó registrada de forma parcial.`)
        setTrabajando(false)
        return
      }
      nuevos += data ?? 0
    }

    // El CIT también queda registrado y reubica los créditos que ya existían de cargas anteriores
    let reasignados = 0
    if (cit && cit.elegibles.length > 0 && puedeCit) {
      const { data: cargaCit, error: e2 } = await sb.rpc('crear_carga_cit', { p_pais: pais.id, p_archivo: archivoCit, p_total: cit.totalFilas })
      if (e2 || !cargaCit) {
        setError(`La bitácora se importó (${nuevos} nuevos), pero no se pudo registrar el CIT: ${e2?.message ?? 'error desconocido'}.`)
        setTrabajando(false)
        return
      }
      for (let i = 0; i < cit.elegibles.length; i += LOTE) {
        const { data, error } = await sb.rpc('importar_cit_lote', { p_carga: cargaCit, p_filas: cit.elegibles.slice(i, i + LOTE) as unknown as Json })
        if (error) {
          setError(`La bitácora se importó (${nuevos} nuevos), pero falló el CIT en la fila ${i + 1}: ${error.message}.`)
          setTrabajando(false)
          return
        }
        reasignados = data ?? reasignados
      }
    }

    const { data: carga } = await sb.from('cargas_bitacora').select('*').eq('id', cargaId).maybeSingle()
    const etiqueta = carga ? `Carga ${carga.numero} de ${nombrePeriodo(carga.periodo)} (${fmtFechaHora(carga.fecha_carga, pais.zona_horaria)})` : 'Carga nueva'
    setResultado(
      `${etiqueta} · ${pais.nombre}: ${aImportar.length.toLocaleString('es-NI')} registros en la carga, ${nuevos.toLocaleString('es-NI')} nuevos y ${(aImportar.length - nuevos).toLocaleString('es-NI')} que ya existían (no se modificaron).` +
        (cit && puedeCit ? ` CIT aplicado: ${reasignados.toLocaleString('es-NI')} créditos que ya existían cambiaron de período.` : ''),
    )
    setLectura(null)
    setCit(null)
    setElegidos(null)
    setTrabajando(false)
  }

  return (
    <div className="tarjeta grupo" style={{ maxWidth: 820 }}>
      <h3>Importar bitácora y CIT · {pais.nombre}</h3>
      <p style={{ marginTop: 0 }}>
        Carga la <strong>Bitácora de Atención</strong> (CSV con separador «;») y el <strong>CIT</strong> (Excel .xlsx o CSV) en el mismo formato en que los recibe el Digitador. La app une ambos
        archivos por la <strong>llave de crédito</strong> (columna Llave = Comprobante_Consecutivo de la bitácora y tipo_doc_numero_doc del CIT): cada crédito que aparece en el CIT queda en el
        mes de su <code>f_ultima_formalizacion</code>; el resto, en el mes de su Fecha Formalizado. Hasta <strong>5 cargas por día</strong>; las cargas anteriores no se eliminan.
      </p>
      <div className="rejilla" style={{ marginBottom: 12 }}>
        <label className="campo">
          1. Bitácora de Atención (.csv)
          <input type="file" accept=".csv,text/csv" onChange={elegirBitacora} />
        </label>
        <label className="campo">
          2. CIT (.xlsx o .csv)
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={elegirCit} disabled={!puedeCit} />
          {!puedeCit && <span className="pregunta">Tu puesto no tiene el permiso «Importar CIT».</span>}
        </label>
      </div>
      <div className="aviso info" style={{ marginBottom: 12 }}>
        Solo se importan los créditos con ESTADO: {ESTADOS_IMPORTABLES.map((e) => e.toLowerCase()).join(', ')}. Si dos filas del mismo período comparten cédula, solo se importa la primera. Los
        créditos «Aprobado Informa» entran a la cola con su ESTADO visible; el Digitador los marca como «Aprobado sin formalizar». Los registros que ya existen en {pais.nombre} no se modifican.
      </div>

      {lectura && (
        <div className="aviso info" style={{ marginBottom: 12 }}>
          <strong>{archivoBitacora}</strong>: {lectura.totalFilas.toLocaleString('es-NI')} filas leídas · {lectura.elegibles.length.toLocaleString('es-NI')} con ESTADO válido ·{' '}
          {lectura.fueraDeEstado.toLocaleString('es-NI')} omitidas por ESTADO · {lectura.duplicadosEnArchivo} duplicadas en el archivo · {lectura.sinDatos} sin número de solicitud o cliente.
        </div>
      )}
      {cit && (
        <div className="aviso info" style={{ marginBottom: 12 }}>
          <strong>{archivoCit}</strong>: {cit.totalFilas.toLocaleString('es-NI')} filas · {cit.elegibles.length.toLocaleString('es-NI')} con llave y fecha
          {cit.sinDatos > 0 && ` · ${cit.sinDatos} sin llave o fecha válida`}
          {union && ` · ${union.enCit.toLocaleString('es-NI')} cruzan con la bitácora · ${union.citSinBitacora.toLocaleString('es-NI')} no están en la bitácora (o tienen un ESTADO que no se importa)`}.
        </div>
      )}

      {union && (
        <div style={{ marginBottom: 12 }}>
          <strong>Períodos a importar</strong>
          <div className="sino" style={{ marginTop: 6, flexWrap: 'wrap' }}>
            {union.periodos.map(([p, n]) => (
              <label key={p} className="sino-op">
                <input type="checkbox" checked={seleccion.has(p)} onChange={() => alternarPeriodo(p)} />
                {nombrePeriodo(p)} ({n.toLocaleString('es-NI')}){union.periodosCit.has(p) ? ' · CIT' : ''}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {resultado && <div className="aviso ok" style={{ marginBottom: 12 }}>{resultado}</div>}

      <button className="btn" disabled={aImportar.length === 0 || trabajando} onClick={importar}>
        {trabajando ? 'Importando…' : `Importar ${aImportar.length.toLocaleString('es-NI')} registros en ${pais.nombre}`}
      </button>
    </div>
  )
}
