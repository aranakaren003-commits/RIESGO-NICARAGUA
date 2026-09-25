import { useCallback, useEffect, useState } from 'react'
import Papa from 'papaparse'
import { origenLlamadas as origen } from '../lib/consultas'
import { ALL_FIELDS, ESTATUS_LLAMADA, encuestaProgreso } from '../lib/fields'
import { fmtFechaHora } from '../lib/fechas'
import { usePais } from '../lib/pais'
import { P, type Permisos } from '../lib/permisos'
import type { Llamada, VLlamadaCarga } from '../types/database.types'
import RegistroForm from './RegistroForm'
import { useFiltroCarga } from './FiltroCarga'

const TAM = 50

interface Filtros {
  idCarga: string | null // null = todas las cargas del país
  idPais: string
  estatus: string
  texto: string
}

function aplicarFiltros<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T; or: (f: string) => T }>(q: T, f: Filtros): T {
  let r = f.idCarga ? q.eq('id_carga', f.idCarga) : q.eq('id_pais', f.idPais)
  if (f.estatus === '__sin__') r = r.is('estatus_llamada', null)
  else if (f.estatus) r = r.eq('estatus_llamada', f.estatus)
  const t = f.texto.trim().replace(/[,()%*]/g, ' ')
  if (t) {
    const partes = [`cliente.ilike.%${t}%`, `cedula.ilike.%${t}%`, `telefono.ilike.%${t}%`, `informa.ilike.%${t}%`, `tipo_credito.ilike.%${t}%`]
    if (/^\d+$/.test(t)) partes.push(`numero_solicitud.eq.${t}`)
    r = r.or(partes.join(','))
  }
  return r
}

function claseEstatus(e: string | null): string {
  if (!e) return 'chip'
  if (e === 'ACEPTACION') return 'chip ok'
  if (['NO ACEPTACION', 'NO FORMALIZA', 'ANULADO', 'CANCELACION'].includes(e)) return 'chip mal'
  return 'chip neutro'
}

export default function Registros({ permisos }: { permisos: Permisos }) {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const puedeCrear = permisos.has(P.registrosCrear)
  const puedeEditar = permisos.has(P.registrosEditar)
  const puedeExportar = permisos.has(P.registrosExportar)

  const { carga, todas, cargando: cargandoCargas, sinCargas, controles } = useFiltroCarga(pais.id, tz, true)
  const [estatus, setEstatus] = useState('')
  const [texto, setTexto] = useState('')
  const [textoInput, setTextoInput] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<VLlamadaCarga[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<Llamada | null | undefined>(undefined) // undefined = cerrado, null = nuevo
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setTexto(textoInput)
      setPagina(0)
    }, 350)
    return () => clearTimeout(t)
  }, [textoInput])

  useEffect(() => {
    setPagina(0)
  }, [carga?.id])

  const cargar = useCallback(async () => {
    if (!carga && !todas) {
      setFilas([])
      setTotal(0)
      return
    }
    setCargando(true)
    setError('')
    const { data, count, error } = await aplicarFiltros(origen(todas).select('*', { count: 'exact' }), { idCarga: carga?.id ?? null, idPais: pais.id, estatus, texto })
      .order('num', { ascending: true })
      .range(pagina * TAM, pagina * TAM + TAM - 1)
    if (error) setError(error.message)
    setFilas(data ?? [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [carga, todas, pais.id, estatus, texto, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function exportar() {
    if (!carga && !todas) return
    setExportando(true)
    const acumuladas: VLlamadaCarga[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await aplicarFiltros(origen(todas).select('*'), { idCarga: carga?.id ?? null, idPais: pais.id, estatus, texto })
        .order('num', { ascending: true })
        .range(desde, desde + 999)
      if (error) {
        setError(error.message)
        break
      }
      acumuladas.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    const filasCsv = acumuladas.map((r) => ALL_FIELDS.map((f) => (f.type === 'datetime' ? fmtFechaHora(r[f.key] as string | null, tz) : (r[f.key] ?? ''))))
    const csv = Papa.unparse({ fields: ALL_FIELDS.map((f) => f.label), data: filasCsv }, { delimiter: ';' })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = carga ? `llamadas_bienvenida_${pais.codigo}_${carga.periodo}_carga${carga.numero}.csv` : `llamadas_bienvenida_${pais.codigo}_todas.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setExportando(false)
  }

  const paginas = Math.max(1, Math.ceil(total / TAM))

  return (
    <>
      <div className="barra">
        {controles}
        <label>
          ESTATUS DE LLAMADA
          <select value={estatus} onChange={(e) => { setEstatus(e.target.value); setPagina(0) }}>
            <option value="">Todos</option>
            <option value="__sin__">Sin estatus</option>
            {ESTATUS_LLAMADA.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label>
          Buscar
          <input placeholder="Cliente, cédula, teléfono, solicitud…" value={textoInput} onChange={(e) => setTextoInput(e.target.value)} style={{ width: 240 }} />
        </label>
        <div className="espacio" />
        {puedeExportar && <button className="btn secundario" onClick={exportar} disabled={exportando || total === 0}>{exportando ? 'Exportando…' : 'Exportar CSV'}</button>}
        {puedeCrear && <button className="btn" onClick={() => setEditando(null)} disabled={!carga}>Nuevo registro</button>}
      </div>

      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table>
            <thead>
              <tr>
                <th>NÚM</th>
                <th>CLIENTE</th>
                <th>ESTADO</th>
                <th>NUMERO DE SOLICITUD</th>
                <th>TIPO DE CRÉDITO</th>
                <th>CEDULA</th>
                <th>TELEFONO</th>
                <th>FECHA DE FORMALIZADO</th>
                <th>ESTATUS DE LLAMADA</th>
                <th>PROMOTOR</th>
                <th>Encuesta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => {
                const p = encuestaProgreso(r)
                return (
                  <tr key={r.id} className={r.caso_sospecha === 'SI' ? 'fila-sospecha' : ''} onClick={() => setEditando(r)}>
                    <td>{r.num}</td>
                    <td title={r.cliente}>
                      {r.cliente}
                      {r.caso_sospecha === 'SI' && <span className="chip mal" style={{ marginLeft: 8 }}>Sospecha</span>}
                    </td>
                    <td>{r.estado}</td>
                    <td>{r.numero_solicitud}</td>
                    <td>{r.tipo_credito}</td>
                    <td>{r.cedula}</td>
                    <td>{r.telefono}</td>
                    <td>{fmtFechaHora(r.fecha_formalizado, tz)}</td>
                    <td>{r.estatus_llamada ? <span className={claseEstatus(r.estatus_llamada)}>{r.estatus_llamada}</span> : <span className="chip">Sin estatus</span>}</td>
                    <td title={r.promotor ?? ''}>{r.promotor}</td>
                    <td>
                      <span className="progreso" title={`${p.llenos} de ${p.total} campos`}>
                        <span className="pista"><span className="relleno" style={{ width: `${(p.llenos / p.total) * 100}%`, display: 'block' }} /></span>
                        {p.llenos}/{p.total}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!cargando && !cargandoCargas && filas.length === 0 && (
            <div className="vacio">
              {sinCargas
                ? `No hay cargas de la bitácora en ${pais.nombre}. Un analista de carga debe importar la bitácora.`
                : !carga && !todas
                  ? 'No hay cargas en la fecha seleccionada.'
                  : 'No hay registros con estos filtros.'}
            </div>
          )}
        </div>
        <div className="pie">
          <span>{cargando ? 'Cargando…' : `${total.toLocaleString('es-NI')} registros`}</span>
          <div className="espacio" />
          <button className="btn secundario" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina + 1} de {paginas}</span>
          <button className="btn secundario" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      </div>

      {editando !== undefined && (
        <RegistroForm
          key={editando?.id ?? 'nuevo'}
          registro={editando}
          idCarga={carga?.id ?? null}
          soloLectura={editando ? !puedeEditar : !puedeCrear}
          onClose={() => setEditando(undefined)}
          onSaved={() => {
            setEditando(undefined)
            cargar()
          }}
        />
      )}
    </>
  )
}
