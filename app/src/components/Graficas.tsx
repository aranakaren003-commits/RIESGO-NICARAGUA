import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { origenLlamadas } from '../lib/consultas'
import { ALL_FIELDS, type FieldKey } from '../lib/fields'
import { fmtFechaHora } from '../lib/fechas'
import { usePais } from '../lib/pais'
import { P, type Permisos } from '../lib/permisos'
import type { VLlamadaCarga } from '../types/database.types'
import { useFiltroCarga } from './FiltroCarga'

type Fila = VLlamadaCarga
type Filtros = Partial<Record<FieldKey, string>>

const CAMPOS_GRAFICA: { key: FieldKey; top?: number }[] = [
  { key: 'estatus_llamada' },
  { key: 'tipo_credito' },
  { key: 'atencion_tramite' },
  { key: 'atencion_ejecutivo' },
  { key: 'calificacion_gestion' },
  { key: 'tipo_desembolso' },
  { key: 'atencion_analista' },
  { key: 'atencion_formalizador' },
  { key: 'conoce_asistencias' },
  { key: 'ofrecieron_asistencia' },
  { key: 'entregaron_documentacion' },
  { key: 'claro_informacion' },
  { key: 'conforme_fechas_pago' },
  { key: 'medio_notificacion' },
  { key: 'sucursal', top: 10 },
  { key: 'origen', top: 10 },
]

// Filtros «por lista» (además de hacer clic en las barras)
const LISTAS: FieldKey[] = ['tipo_credito', 'estatus_llamada', 'sucursal']

const etiqueta = (key: FieldKey) => ALL_FIELDS.find((f) => f.key === key)?.caption ?? ALL_FIELDS.find((f) => f.key === key)?.label ?? key

function pasa(r: Fila, filtros: Filtros, salvo?: FieldKey): boolean {
  for (const [k, v] of Object.entries(filtros) as [FieldKey, string][]) {
    if (k === salvo) continue
    if (String(r[k] ?? '') !== v) return false
  }
  return true
}

function contar(filas: Fila[], key: FieldKey, top?: number) {
  const m = new Map<string, number>()
  for (const r of filas) {
    const v = r[key]
    if (v === null || v === '') continue
    const k = String(v)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  const orden = [...m.entries()].sort((a, b) => b[1] - a[1])
  return top ? orden.slice(0, top) : orden
}

// Dashboard dinámico: cada gráfica es a la vez un filtro de las demás (segmentación cruzada).
export default function Dashboard({ permisos }: { permisos: Permisos }) {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const puedeDescargar = permisos.has(P.dashboardDescargar)
  const { carga, todas, cargando: cargandoCargas, controles } = useFiltroCarga(pais.id, tz, true)
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState<Filtros>({})
  const cargaId = carga?.id

  useEffect(() => {
    if (!cargaId && !todas) {
      setFilas([])
      return
    }
    let activo = true
    ;(async () => {
      setCargando(true)
      setError('')
      const acum: Fila[] = []
      for (let desde = 0; ; desde += 1000) {
        const base = origenLlamadas(todas).select('*')
        const { data, error } = await (cargaId ? base.eq('id_carga', cargaId) : base.eq('id_pais', pais.id)).order('num', { ascending: true }).range(desde, desde + 999)
        if (error) {
          if (activo) setError(error.message)
          break
        }
        acum.push(...(data ?? []))
        if (!data || data.length < 1000) break
      }
      if (activo) {
        setFilas(acum)
        setFiltros({})
        setCargando(false)
      }
    })()
    return () => {
      activo = false
    }
  }, [cargaId, todas, pais.id])

  const filtradas = useMemo(() => filas.filter((r) => pasa(r, filtros)), [filas, filtros])
  const conEstatus = filtradas.filter((r) => r.estatus_llamada).length
  const activos = Object.entries(filtros) as [FieldKey, string][]

  const alternar = (key: FieldKey, valor: string) =>
    setFiltros((f) => {
      const n = { ...f }
      if (n[key] === valor) delete n[key]
      else n[key] = valor
      return n
    })
  const fijar = (key: FieldKey, valor: string) =>
    setFiltros((f) => {
      const n = { ...f }
      if (valor) n[key] = valor
      else delete n[key]
      return n
    })

  function descargar() {
    const filasCsv = filtradas.map((r) => ALL_FIELDS.map((f) => (f.type === 'datetime' ? fmtFechaHora(r[f.key] as string | null, tz) : (r[f.key] ?? ''))))
    const csv = Papa.unparse({ fields: ALL_FIELDS.map((f) => f.label), data: filasCsv }, { delimiter: ';' })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dashboard_${pais.codigo}_${carga ? `${carga.periodo}_carga${carga.numero}` : 'todas'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="barra">
        {controles}
        {LISTAS.map((key) => {
          const opciones = contar(filas.filter((r) => pasa(r, filtros, key)), key)
          return (
            <label key={key}>
              {ALL_FIELDS.find((f) => f.key === key)?.label}
              <select value={filtros[key] ?? ''} onChange={(e) => fijar(key, e.target.value)}>
                <option value="">Todos</option>
                {opciones.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
              </select>
            </label>
          )
        })}
        <div className="espacio" />
        {puedeDescargar && <button className="btn secundario" onClick={descargar} disabled={filtradas.length === 0}>Descargar CSV</button>}
      </div>

      {activos.length > 0 && (
        <div className="chips-filtro">
          <span>Filtros activos:</span>
          {activos.map(([k, v]) => (
            <button key={k} className="chip-filtro" onClick={() => alternar(k, v)} title="Quitar filtro">
              {ALL_FIELDS.find((f) => f.key === k)?.label}: <strong>{v}</strong> ✕
            </button>
          ))}
          <button className="btn secundario mini" onClick={() => setFiltros({})}>Limpiar filtros</button>
        </div>
      )}

      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {cargando || cargandoCargas ? (
        <div className="vacio">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="vacio">No hay registros en la selección de {pais.nombre}.</div>
      ) : (
        <>
          <div className="kpis">
            <div className="tarjeta kpi"><div className="valor">{filtradas.length.toLocaleString('es-NI')}</div><div className="titulo">Registros{activos.length ? ` (de ${filas.length.toLocaleString('es-NI')})` : ''}</div></div>
            <div className="tarjeta kpi"><div className="valor">{conEstatus.toLocaleString('es-NI')}</div><div className="titulo">Con ESTATUS DE LLAMADA</div></div>
            <div className="tarjeta kpi"><div className="valor">{(filtradas.length - conEstatus).toLocaleString('es-NI')}</div><div className="titulo">Sin ESTATUS DE LLAMADA</div></div>
          </div>
          <div className="graficas">
            {CAMPOS_GRAFICA.map(({ key, top }) => {
              const datos = contar(filas.filter((r) => pasa(r, filtros, key)), key, top)
              const total = datos.reduce((s, [, n]) => s + n, 0)
              const max = datos[0]?.[1] ?? 1
              const def = ALL_FIELDS.find((f) => f.key === key)!
              return (
                <section key={key} className="tarjeta grafica">
                  <h3>{def.caption ?? def.label}</h3>
                  <div className="sub">{def.label}{top ? ` · top ${top}` : ''} · {total.toLocaleString('es-NI')} respuestas · clic en una barra para filtrar</div>
                  {datos.length === 0 && <div className="sub">Sin datos para esta selección.</div>}
                  {datos.map(([nombre, n]) => {
                    const elegido = filtros[key] === nombre
                    return (
                      <button
                        key={nombre}
                        className={`barra-fila clicable${elegido ? ' elegida' : ''}${filtros[key] && !elegido ? ' atenuada' : ''}`}
                        onClick={() => alternar(key, nombre)}
                        aria-pressed={elegido}
                        title={`Filtrar por ${etiqueta(key)}: ${nombre}`}
                      >
                        <span className="nombre">{nombre}</span>
                        <span className="pista"><span className="relleno" style={{ width: `${(n / max) * 100}%`, display: 'block' }} /></span>
                        <span className="num">{n} · {Math.round((n / total) * 100)}%</span>
                      </button>
                    )
                  })}
                </section>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
