import { useState } from 'react'
import { sb } from '../lib/supabase'
import { usePais } from '../lib/pais'
import { fmtFechaHora, MESES } from '../lib/fechas'
import { aplicarCit, ESTADOS_IMPORTABLES, leerBitacora, type ResultadoLectura } from '../lib/bitacora'
import { leerCit, type ResultadoLecturaCit } from '../lib/cit'
import type { Json } from '../types/database.types'

const LOTE = 500

// Una sola pantalla para cargar la bitácora y el CIT: se unen por la llave de crédito y cada crédito queda en el período
// (año-mes) de su f_ultima_formalizacion del CIT; lo que no calza con el CIT conserva el período de su propia fecha.
export default function Importar() {
  const { pais } = usePais()
  const [archivo, setArchivo] = useState('')
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null)
  const [archivoCit, setArchivoCit] = useState('')
  const [lecturaCit, setLecturaCit] = useState<ResultadoLecturaCit | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState('')
  const [error, setError] = useState('')

  async function elegirBitacora(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setResultado('')
    setArchivo(f.name)
    setLectura(leerBitacora(await f.text(), pais.zona_horaria))
  }

  async function elegirCit(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) {
      setArchivoCit('')
      setLecturaCit(null)
      return
    }
    setError('')
    setResultado('')
    setArchivoCit(f.name)
    try {
      setLecturaCit(await leerCit(f))
    } catch (err) {
      setLecturaCit(null)
      setError(`No se pudo leer el CIT: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function importar() {
    if (!lectura) return
    setTrabajando(true)
    setError('')
    setResultado('')

    // Unión por llave: define el período de cada crédito antes de importar
    const calzaron = lecturaCit ? aplicarCit(lectura.elegibles, lecturaCit.elegibles) : 0

    const { data: cargaId, error: e1 } = await sb.rpc('crear_carga', { p_pais: pais.id, p_archivo: archivo, p_total: lectura.totalFilas })
    if (e1 || !cargaId) {
      setError(e1?.message ?? 'No se pudo crear la carga.')
      setTrabajando(false)
      return
    }

    let nuevos = 0
    for (let i = 0; i < lectura.elegibles.length; i += LOTE) {
      const lote = lectura.elegibles.slice(i, i + LOTE)
      const { data, error } = await sb.rpc('importar_lote', { p_carga: cargaId, p_filas: lote as unknown as Json })
      if (error) {
        setError(`Falló el lote que empieza en la fila ${i + 1}: ${error.message}. Nuevos insertados hasta aquí: ${nuevos}. La carga quedó registrada de forma parcial.`)
        setTrabajando(false)
        return
      }
      nuevos += data ?? 0
    }

    // Los créditos que ya existían de cargas anteriores también se reubican de período según el CIT
    let reubicados = 0
    if (lecturaCit && lecturaCit.elegibles.length > 0) {
      const { data: cargaCit, error: e2 } = await sb.rpc('crear_carga_cit', { p_pais: pais.id, p_archivo: archivoCit, p_total: lecturaCit.totalFilas })
      if (e2 || !cargaCit) {
        setError(`La bitácora se importó (${nuevos} nuevos), pero no se pudo registrar el CIT: ${e2?.message ?? 'error desconocido'}.`)
        setTrabajando(false)
        return
      }
      for (let i = 0; i < lecturaCit.elegibles.length; i += LOTE) {
        const lote = lecturaCit.elegibles.slice(i, i + LOTE)
        const { data, error } = await sb.rpc('importar_cit_lote', { p_carga: cargaCit, p_filas: lote as unknown as Json })
        if (error) {
          setError(`La bitácora se importó (${nuevos} nuevos), pero falló el CIT en la fila ${i + 1}: ${error.message}.`)
          setTrabajando(false)
          return
        }
        reubicados += data ?? 0
      }
    }

    const { data: carga } = await sb.from('cargas_bitacora').select('*').eq('id', cargaId).maybeSingle()
    const etiqueta = carga ? `Carga ${carga.numero} de ${MESES[Number(carga.periodo.slice(5, 7)) - 1]} ${carga.periodo.slice(0, 4)} (${fmtFechaHora(carga.fecha_carga, pais.zona_horaria)})` : 'Carga nueva'
    setResultado(
      `${etiqueta} · ${pais.nombre}: ${lectura.elegibles.length.toLocaleString('es-NI')} registros en la carga, ${nuevos.toLocaleString('es-NI')} nuevos y ${(lectura.elegibles.length - nuevos).toLocaleString('es-NI')} que ya existían.` +
        (lecturaCit
          ? ` CIT: ${calzaron.toLocaleString('es-NI')} créditos de esta bitácora calzaron con el CIT y quedaron en su período; ${reubicados.toLocaleString('es-NI')} créditos de cargas anteriores cambiaron de período.`
          : ' Sin CIT: cada crédito quedó en el período de su propia fecha.') +
        ' Las cargas anteriores se conservan.',
    )
    setLectura(null)
    setLecturaCit(null)
    setTrabajando(false)
  }

  return (
    <div className="tarjeta grupo" style={{ maxWidth: 800 }}>
      <h3>Importar bitácora y CIT · {pais.nombre}</h3>
      <p style={{ marginTop: 0 }}>
        1) Elige el CSV de la <strong>Bitácora de Atención</strong> (separador «;»). 2) Elige el archivo <strong>CIT</strong> (.xlsx o .csv, con las columnas <code>Llave</code> o <code>tipo_doc</code> + <code>numero_doc</code>, y <code>f_ultima_formalizacion</code>).
        Se unen por la llave de crédito y cada crédito queda en el <strong>mes de su f_ultima_formalizacion</strong> (lo de septiembre queda en septiembre). Hasta <strong>5 cargas por día</strong>; las cargas anteriores no se eliminan y se consultan desde el filtro de período.
        El archivo se procesa en tu navegador y solo se guardan los campos de cliente y crédito.
      </p>
      <div className="barra">
        <label>
          Bitácora de Atención (.csv)
          <input type="file" accept=".csv,text/csv" onChange={elegirBitacora} />
        </label>
        <label>
          CIT (.xlsx o .csv)
          <input type="file" accept=".xlsx,.csv,text/csv" onChange={elegirCit} />
        </label>
      </div>
      <div className="aviso info" style={{ marginBottom: 12 }}>
        Solo se importan los créditos con ESTADO: {ESTADOS_IMPORTABLES.map((e) => e.toLowerCase()).join(', ')}. El resto se omite, igual que el tipo de crédito Convenio. Si dos filas del mismo
        período comparten cédula, solo se importa la primera (duplicidad de cliente). Un crédito con ESTADO «Aprobado Informa» se marca como «Aprobado sin formalizar» y no entra a la cola
        de llamadas. Los registros que ya existen en {pais.nombre} no se modifican (se conservan las ediciones), pero quedan ligados a la nueva carga.
      </div>

      {lectura && (
        <div className="aviso info" style={{ marginBottom: 12 }}>
          <strong>{archivo}</strong>: {lectura.totalFilas.toLocaleString('es-NI')} filas leídas · {lectura.elegibles.length.toLocaleString('es-NI')} a importar ·{' '}
          {lectura.fueraDeEstado.toLocaleString('es-NI')} omitidas por ESTADO · {lectura.fueraDeTipo.toLocaleString('es-NI')} Convenio · {lectura.duplicadosEnArchivo} duplicadas en el archivo ·{' '}
          {lectura.sinDatos} sin número de solicitud o cliente.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {Object.entries(lectura.porEstado).map(([e, n]) => <li key={e}>{e}: {n.toLocaleString('es-NI')}</li>)}
          </ul>
        </div>
      )}
      {lecturaCit && (
        <div className="aviso info" style={{ marginBottom: 12 }}>
          <strong>{archivoCit}</strong>: {lecturaCit.totalFilas.toLocaleString('es-NI')} filas · {lecturaCit.elegibles.length.toLocaleString('es-NI')} créditos con llave y fecha · {lecturaCit.sinDatos} sin datos válidos.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {Object.entries(lecturaCit.porPeriodo).sort().map(([p, n]) => <li key={p}>Período {p}: {n.toLocaleString('es-NI')}</li>)}
          </ul>
        </div>
      )}
      {archivoCit && lecturaCit && lecturaCit.elegibles.length === 0 && (
        <div className="aviso error" style={{ marginBottom: 12 }}>El CIT no trae filas válidas: revisa que tenga las columnas Llave (o tipo_doc y numero_doc) y f_ultima_formalizacion.</div>
      )}
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {resultado && <div className="aviso ok" style={{ marginBottom: 12 }}>{resultado}</div>}

      <button className="btn" disabled={!lectura || lectura.elegibles.length === 0 || trabajando} onClick={importar}>
        {trabajando ? 'Importando…' : `Importar como carga nueva en ${pais.nombre}`}
      </button>
    </div>
  )
}
