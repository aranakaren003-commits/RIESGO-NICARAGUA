import { useCallback, useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { sb } from '../lib/supabase'
import { ALL_FIELDS, ESTATUS_LLAMADA, encuestaProgreso, fmtFecha } from '../lib/fields'
import { P, type Permisos } from '../lib/permisos'
import type { Llamada } from '../types/database.types'
import RegistroForm from './RegistroForm'

const TAM = 50

export function listaPeriodos(): string[] {
  const out: string[] = []
  const hoy = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

interface Filtros {
  periodo: string
  estatus: string
  texto: string
}

function aplicarFiltros<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T; or: (f: string) => T }>(q: T, f: Filtros): T {
  let r = q
  if (f.periodo) r = r.eq('periodo', f.periodo)
  if (f.estatus === '__sin__') r = r.is('estatus_llamada', null)
  else if (f.estatus) r = r.eq('estatus_llamada', f.estatus)
  const t = f.texto.trim().replace(/[,()%*]/g, ' ')
  if (t) {
    const partes = [`cliente.ilike.%${t}%`, `cedula.ilike.%${t}%`, `telefono.ilike.%${t}%`, `informa.ilike.%${t}%`]
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
  const puedeCrear = permisos.has(P.registrosCrear)
  const puedeEditar = permisos.has(P.registrosEditar)
  const puedeExportar = permisos.has(P.registrosExportar)
  const periodos = useMemo(listaPeriodos, [])
  const [filtros, setFiltros] = useState<Filtros>({ periodo: periodos[0], estatus: '', texto: '' })
  const [textoInput, setTextoInput] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<Llamada[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<Llamada | null | undefined>(undefined) // undefined = cerrado, null = nuevo
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((f) => (f.texto === textoInput ? f : { ...f, texto: textoInput }))
      setPagina(0)
    }, 350)
    return () => clearTimeout(t)
  }, [textoInput])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const q = aplicarFiltros(sb.from('llamadas_bienvenida').select('*', { count: 'exact' }), filtros)
      .order('num', { ascending: true })
      .range(pagina * TAM, pagina * TAM + TAM - 1)
    const { data, count, error } = await q
    if (error) setError(error.message)
    setFilas(data ?? [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [filtros, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function exportar() {
    setExportando(true)
    const todas: Llamada[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await aplicarFiltros(sb.from('llamadas_bienvenida').select('*'), filtros)
        .order('num', { ascending: true })
        .range(desde, desde + 999)
      if (error) {
        setError(error.message)
        break
      }
      todas.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    const filasCsv = todas.map((r) => ALL_FIELDS.map((f) => (f.type === 'datetime' ? fmtFecha(r[f.key] as string | null) : (r[f.key] ?? ''))))
    const csv = Papa.unparse({ fields: ALL_FIELDS.map((f) => f.label), data: filasCsv }, { delimiter: ';' })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `llamadas_bienvenida_${filtros.periodo || 'todos'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setExportando(false)
  }

  const paginas = Math.max(1, Math.ceil(total / TAM))

  return (
    <>
      <div className="barra">
        <label>
          Período
          <select value={filtros.periodo} onChange={(e) => { setFiltros({ ...filtros, periodo: e.target.value }); setPagina(0) }}>
            <option value="">Todos</option>
            {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          ESTATUS DE LLAMADA
          <select value={filtros.estatus} onChange={(e) => { setFiltros({ ...filtros, estatus: e.target.value }); setPagina(0) }}>
            <option value="">Todos</option>
            <option value="__sin__">Sin estatus</option>
            {ESTATUS_LLAMADA.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label>
          Buscar
          <input placeholder="Cliente, cédula, teléfono, solicitud…" value={textoInput} onChange={(e) => setTextoInput(e.target.value)} style={{ width: 280 }} />
        </label>
        <div className="espacio" />
        {puedeExportar && <button className="btn secundario" onClick={exportar} disabled={exportando || total === 0}>{exportando ? 'Exportando…' : 'Exportar CSV'}</button>}
        {puedeCrear && <button className="btn" onClick={() => setEditando(null)}>Nuevo registro</button>}
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
                  <tr key={r.id} onClick={() => setEditando(r)}>
                    <td>{r.num}</td>
                    <td title={r.cliente}>{r.cliente}</td>
                    <td>{r.estado}</td>
                    <td>{r.numero_solicitud}</td>
                    <td>{r.cedula}</td>
                    <td>{r.telefono}</td>
                    <td>{fmtFecha(r.fecha_formalizado)}</td>
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
          {!cargando && filas.length === 0 && (
            <div className="vacio">No hay registros con estos filtros. Usa «Importar bitácora» para cargar la data o «Nuevo registro».</div>
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
