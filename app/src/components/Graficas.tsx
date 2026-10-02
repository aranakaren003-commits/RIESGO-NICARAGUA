import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { origenLlamadas } from '../lib/consultas'
import { sb } from '../lib/supabase'
import { ALL_FIELDS, SIN_QUEJA, type FieldKey } from '../lib/fields'
import { fmtFechaHora, hoyEn } from '../lib/fechas'
import { P, type Permisos } from '../lib/permisos'
import type { Llamada, Pais, ResumenEstatusPeriodo } from '../types/database.types'
import Bandera from './Bandera'

type Fila = Llamada
type Filtros = Partial<Record<FieldKey, string>>

// Preguntas de la encuesta (nivel local/cargador: detalle)
const CAMPOS_ENCUESTA: { key: FieldKey; top?: number }[] = [
  { key: 'atencion_tramite' },
  { key: 'atencion_ejecutivo' },
  { key: 'calificacion_gestion' },
  { key: 'tipo_desembolso' },
  { key: 'atencion_analista' },
  { key: 'atencion_formalizador' },
  { key: 'conoce_asistencias' },
  { key: 'ofrecieron_asistencia' },
  { key: 'adquirio_asistencia' },
  { key: 'entregaron_documentacion' },
  { key: 'claro_informacion' },
  { key: 'conforme_fechas_pago' },
  { key: 'medio_notificacion' },
]

const etiqueta = (key: FieldKey) => ALL_FIELDS.find((f) => f.key === key)?.caption ?? ALL_FIELDS.find((f) => f.key === key)?.label ?? key

function periodosRecientes(tz: string, cuantos = 12): string[] {
  const hoy = hoyEn(tz)
  const [anio, mes] = hoy.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < cuantos; i++) {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

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

const COLORES_PASTEL = ['#4c9c2e', '#002554', '#ee212e', '#677c98', '#f2c200', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#2980b9']

function Dona({ datos }: { datos: [string, number][] }) {
  const total = datos.reduce((s, [, n]) => s + n, 0)
  if (total === 0) return null
  let acumulado = 0
  const segmentos = datos.map(([, n], i) => {
    const desde = (acumulado / total) * 360
    acumulado += n
    const hasta = (acumulado / total) * 360
    return `${COLORES_PASTEL[i % COLORES_PASTEL.length]} ${desde}deg ${hasta}deg`
  })
  return (
    <div className="pastel-envoltorio">
      <div className="pastel dona" style={{ background: `conic-gradient(${segmentos.join(', ')})` }} />
      <div className="pastel-leyenda">
        {datos.map(([nombre, n], i) => (
          <span key={nombre}>
            <i style={{ background: COLORES_PASTEL[i % COLORES_PASTEL.length] }} />
            {nombre} · {n} ({Math.round((n / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  )
}

async function contarGestiones(idsLlamada: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  for (let i = 0; i < idsLlamada.length; i += 300) {
    const trozo = idsLlamada.slice(i, i + 300)
    const { data } = await sb.from('intentos_llamada').select('id_llamada').in('id_llamada', trozo)
    for (const fila of data ?? []) mapa.set(fila.id_llamada, (mapa.get(fila.id_llamada) ?? 0) + 1)
  }
  return mapa
}

interface Props {
  permisos: Permisos
  esRegional: boolean
  paises: Pais[]
  pais: Pais
}

// Dashboard dinámico: cada gráfica es a la vez un filtro de las demás (segmentación cruzada). Nivel «regional» = macro;
// nivel «local»/«cargador» = igual que regional más detalle (encuesta, promotor vs sospecha).
export default function Dashboard({ permisos, esRegional, pais }: Props) {
  const tz = pais.zona_horaria
  const puedeDescargar = permisos.has(P.dashboardDescargar)
  const periodos = useMemo(() => periodosRecientes(tz), [tz])
  const [periodo, setPeriodo] = useState(periodos[0])
  const [filas, setFilas] = useState<Fila[]>([])
  const [gestiones, setGestiones] = useState<Map<string, number>>(new Map())
  const [resumenPeriodo, setResumenPeriodo] = useState<ResumenEstatusPeriodo | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState<Filtros>({})

  useEffect(() => {
    let activo = true
    ;(async () => {
      setCargando(true)
      setError('')
      const acum: Fila[] = []
      for (let desde = 0; ; desde += 1000) {
        let q = origenLlamadas(true).select('*').eq('id_pais', pais.id)
        if (periodo) q = q.eq('periodo', periodo)
        const { data, error } = await q.range(desde, desde + 999)
        if (error) {
          if (activo) setError(error.message)
          break
        }
        acum.push(...(data ?? []))
        if (!data || data.length < 1000) break
      }
      if (!activo) return
      setFilas(acum)
      setFiltros({})
      const mapa = await contarGestiones(acum.map((r) => r.id))
      if (activo) setGestiones(mapa)

      if (periodo) {
        const { data } = await sb.rpc('resumen_estatus_periodo', { p_pais: pais.id, p_periodo: periodo })
        if (activo) setResumenPeriodo((data as unknown as ResumenEstatusPeriodo[] | null)?.[0] ?? null)
      } else {
        setResumenPeriodo(null)
      }
      setCargando(false)
    })()
    return () => {
      activo = false
    }
  }, [pais.id, periodo])

  const filtradas = useMemo(() => filas.filter((r) => pasa(r, filtros)), [filas, filtros])
  const validas = useMemo(() => filtradas.filter((r) => r.estatus_llamada !== 'APROBADO SIN FORMALIZAR'), [filtradas])
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

  // KPIs
  const aceptacion = validas.filter((r) => r.estatus_llamada === 'ACEPTACION').length
  const noAceptacion = validas.filter((r) => r.estatus_llamada === 'NO ACEPTACION').length
  const totalGestiones = validas.reduce((s, r) => s + (gestiones.get(r.id) ?? 0), 0)
  const gestionesAceptacion = validas.filter((r) => r.estatus_llamada === 'ACEPTACION')
  const promedioGestionesAceptacion = gestionesAceptacion.length
    ? gestionesAceptacion.reduce((s, r) => s + (gestiones.get(r.id) ?? 0), 0) / gestionesAceptacion.length
    : 0
  const tasaContacto = validas.length ? ((aceptacion + noAceptacion) / validas.length) * 100 : 0
  const efectividadBase = validas.length ? (aceptacion / validas.length) * 100 : 0
  const sospechososMes = filtradas.filter((r) => r.caso_sospecha === 'SI').length

  function descargar() {
    const filasCsv = filtradas.map((r) => ALL_FIELDS.map((f) => (f.type === 'datetime' ? fmtFechaHora(r[f.key] as string | null, tz) : (r[f.key] ?? ''))))
    const csv = Papa.unparse({ fields: ALL_FIELDS.map((f) => f.label), data: filasCsv }, { delimiter: ';' })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dashboard_${pais.codigo}_${periodo || 'todos'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Queja: las barras muestran solo la categoría; al elegir una categoría se abre la dona con su detalle
  const datosQuejaCategoria = contar(filas.filter((r) => pasa(r, filtros, 'queja_categoria')), 'queja_categoria')
  const totalQuejaCategoria = datosQuejaCategoria.reduce((s, [, n]) => s + n, 0)
  const categoriaElegida = filtros.queja_categoria
  const datosQuejaDetalle = categoriaElegida && categoriaElegida !== SIN_QUEJA ? contar(filtradas, 'queja') : []
  const datosPromotorSospecha = contar(
    filtradas.filter((r) => r.caso_sospecha === 'SI'),
    'promotor',
    10,
  )

  return (
    <>
      <div className="barra">
        <label>
          Período
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="">Todos (en vivo)</option>
            {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Tipo de crédito
          <select value={filtros.tipo_credito ?? ''} onChange={(e) => fijar('tipo_credito', e.target.value)}>
            <option value="">Todos</option>
            {contar(filas.filter((r) => pasa(r, filtros, 'tipo_credito')), 'tipo_credito').map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
          </select>
        </label>
        <label>
          Estatus de llamada
          <select value={filtros.estatus_llamada ?? ''} onChange={(e) => fijar('estatus_llamada', e.target.value)}>
            <option value="">Todos</option>
            {contar(filas.filter((r) => pasa(r, filtros, 'estatus_llamada')), 'estatus_llamada').map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
          </select>
        </label>
        {esRegional && (
          <span className="chip-pais" title="Para cambiar de país usa las pestañas de arriba">
            <Bandera codigo={pais.codigo} alto={16} /> {pais.nombre}
          </span>
        )}
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
      {cargando ? (
        <div className="vacio">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="vacio">No hay registros en la selección de {pais.nombre}.</div>
      ) : (
        <>
          <div className="kpis">
            <div className="tarjeta kpi"><div className="valor">{validas.length.toLocaleString('es-NI')}</div><div className="titulo">Llamadas (base válida)</div></div>
            <div className="tarjeta kpi"><div className="valor">{totalGestiones.toLocaleString('es-NI')}</div><div className="titulo">Gestiones (intentos)</div></div>
            <div className="tarjeta kpi"><div className="valor">{tasaContacto.toFixed(1)}%</div><div className="titulo">Tasa de contacto</div></div>
            <div className="tarjeta kpi"><div className="valor">{efectividadBase.toFixed(1)}%</div><div className="titulo">Efectividad de la base</div></div>
            <div className="tarjeta kpi"><div className="valor">{promedioGestionesAceptacion.toFixed(1)}</div><div className="titulo">Gestiones promedio para aceptación</div></div>
            <div className="tarjeta kpi"><div className="valor">{sospechososMes.toLocaleString('es-NI')}</div><div className="titulo">Casos sospechosos {periodo ? `(${periodo})` : ''}</div></div>
          </div>

          {resumenPeriodo && (
            <section className="tarjeta grafica" style={{ marginBottom: 14 }}>
              <h3>% de estatus de llamada</h3>
              <div className="sub">Congelado al cierre del día 4 del mes siguiente ({periodo}) · base: {resumenPeriodo.total_base.toLocaleString('es-NI')} registros válidos</div>
              {(
                [
                  ['Contestación', resumenPeriodo.contestacion],
                  ['Buzón', resumenPeriodo.buzon],
                  ['No contesta', resumenPeriodo.no_contesta],
                  ['Devolver llamada', resumenPeriodo.devolver_llamada],
                  ['Número equivocado', resumenPeriodo.numero_equivocado],
                  ['Sin estatus', resumenPeriodo.sin_estatus],
                ] as [string, number][]
              ).map(([nombre, n]) => (
                <div key={nombre} className="barra-fila">
                  <span className="nombre">{nombre}</span>
                  <span className="pista"><span className="relleno" style={{ width: `${resumenPeriodo.total_base ? (n / resumenPeriodo.total_base) * 100 : 0}%`, display: 'block' }} /></span>
                  <span className="num">{n} · {resumenPeriodo.total_base ? Math.round((n / resumenPeriodo.total_base) * 100) : 0}%</span>
                </div>
              ))}
            </section>
          )}

          <div className="graficas">
            <section className="tarjeta grafica">
              <h3>Categorización de la queja</h3>
              <div className="sub">{totalQuejaCategoria.toLocaleString('es-NI')} respuestas · clic en una categoría para ver su detalle</div>
              {datosQuejaCategoria.length === 0 && <div className="sub">Sin datos para esta selección.</div>}
              {datosQuejaCategoria.map(([nombre, n]) => {
                const max = datosQuejaCategoria[0]?.[1] ?? 1
                const elegido = categoriaElegida === nombre
                return (
                  <button
                    key={nombre}
                    className={`barra-fila clicable${elegido ? ' elegida' : ''}${categoriaElegida && !elegido ? ' atenuada' : ''}`}
                    onClick={() => alternar('queja_categoria', nombre)}
                    aria-pressed={elegido}
                    title={`Ver el detalle de ${nombre}`}
                  >
                    <span className="nombre">{nombre}</span>
                    <span className="pista"><span className="relleno" style={{ width: `${(n / max) * 100}%`, display: 'block' }} /></span>
                    <span className="num">{n} · {Math.round((n / totalQuejaCategoria) * 100)}%</span>
                  </button>
                )
              })}
              {categoriaElegida && categoriaElegida !== SIN_QUEJA && (
                <>
                  <div className="sub" style={{ marginTop: 12 }}>Detalle de {categoriaElegida}</div>
                  {datosQuejaDetalle.length === 0 ? <div className="sub">Sin detalle registrado.</div> : <Dona datos={datosQuejaDetalle} />}
                </>
              )}
            </section>

            {!esRegional && (
              <section className="tarjeta grafica">
                <h3>Promotor vs casos con sospecha</h3>
                <div className="sub">Top 10 promotores por casos marcados con sospecha</div>
                {datosPromotorSospecha.length === 0 && <div className="sub">Sin casos con sospecha en esta selección.</div>}
                {datosPromotorSospecha.map(([nombre, n]) => {
                  const max = datosPromotorSospecha[0]?.[1] ?? 1
                  return (
                    <div key={nombre} className="barra-fila">
                      <span className="nombre" title={nombre}>{nombre}</span>
                      <span className="pista"><span className="relleno" style={{ width: `${(n / max) * 100}%`, display: 'block' }} /></span>
                      <span className="num">{n}</span>
                    </div>
                  )
                })}
              </section>
            )}

            {!esRegional &&
              CAMPOS_ENCUESTA.map(({ key, top }) => {
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
