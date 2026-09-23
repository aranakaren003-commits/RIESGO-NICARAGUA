import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/supabase'
import { ALL_FIELDS, type FieldKey } from '../lib/fields'
import type { Llamada } from '../types/database.types'
import { listaPeriodos } from './Registros'

const CAMPOS_GRAFICA: { key: FieldKey; top?: number }[] = [
  { key: 'estatus_llamada' },
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

const COLUMNAS = ['periodo', ...CAMPOS_GRAFICA.map((c) => c.key)].join(',')

function contar(filas: Llamada[], key: FieldKey, top?: number) {
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

export default function Graficas() {
  const periodos = useMemo(listaPeriodos, [])
  const [periodo, setPeriodo] = useState(periodos[0])
  const [filas, setFilas] = useState<Llamada[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    ;(async () => {
      setCargando(true)
      setError('')
      const acum: Llamada[] = []
      for (let desde = 0; ; desde += 1000) {
        let q = sb.from('llamadas_bienvenida').select(COLUMNAS).range(desde, desde + 999)
        if (periodo) q = q.eq('periodo', periodo)
        const { data, error } = await q.returns<Llamada[]>()
        if (error) {
          if (activo) setError(error.message)
          break
        }
        acum.push(...(data ?? []))
        if (!data || data.length < 1000) break
      }
      if (activo) {
        setFilas(acum)
        setCargando(false)
      }
    })()
    return () => {
      activo = false
    }
  }, [periodo])

  const conEstatus = filas.filter((r) => r.estatus_llamada).length

  return (
    <>
      <div className="barra">
        <label>
          Período
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="">Todos</option>
            {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {cargando ? (
        <div className="vacio">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="vacio">No hay registros en este período.</div>
      ) : (
        <>
          <div className="kpis">
            <div className="tarjeta kpi"><div className="valor">{filas.length.toLocaleString('es-NI')}</div><div className="titulo">Registros</div></div>
            <div className="tarjeta kpi"><div className="valor">{conEstatus.toLocaleString('es-NI')}</div><div className="titulo">Con ESTATUS DE LLAMADA</div></div>
            <div className="tarjeta kpi"><div className="valor">{(filas.length - conEstatus).toLocaleString('es-NI')}</div><div className="titulo">Sin ESTATUS DE LLAMADA</div></div>
          </div>
          <div className="graficas">
            {CAMPOS_GRAFICA.map(({ key, top }) => {
              const def = ALL_FIELDS.find((f) => f.key === key)!
              const datos = contar(filas, key, top)
              const total = datos.reduce((s, [, n]) => s + n, 0)
              const max = datos[0]?.[1] ?? 1
              return (
                <section key={key} className="tarjeta grafica">
                  <h3>{def.caption ?? def.label}</h3>
                  <div className="sub">Columna {def.col} · {def.label}{top ? ` · top ${top}` : ''} · {total.toLocaleString('es-NI')} respuestas</div>
                  {datos.length === 0 && <div className="sub">Sin datos capturados.</div>}
                  {datos.map(([nombre, n]) => (
                    <div key={nombre} className="barra-fila">
                      <span className="nombre" title={nombre}>{nombre}</span>
                      <span className="pista"><span className="relleno" style={{ width: `${(n / max) * 100}%`, display: 'block' }} /></span>
                      <span className="num">{n} · {Math.round((n / total) * 100)}%</span>
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
