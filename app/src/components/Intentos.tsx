import { useCallback, useEffect, useState } from 'react'
import Papa from 'papaparse'
import { sb } from '../lib/supabase'
import { fmtFechaHora, hoyEn, inicioDelDia, sumarDias } from '../lib/fechas'
import { usePais } from '../lib/pais'
import type { VIntento } from '../types/database.types'

const TAM = 50

const usuarioCorto = (email: string | null) => (email ? email.split('@')[0] : '')

export default function Intentos() {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const hoy = hoyEn(tz)
  const [desde, setDesde] = useState(sumarDias(hoy, -7))
  const [hasta, setHasta] = useState(hoy)
  const [texto, setTexto] = useState('')
  const [textoInput, setTextoInput] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<VIntento[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setTexto(textoInput)
      setPagina(0)
    }, 350)
    return () => clearTimeout(t)
  }, [textoInput])

  const consulta = useCallback(
    <T extends { eq: (c: string, v: string) => T; gte: (c: string, v: string) => T; lt: (c: string, v: string) => T; or: (f: string) => T }>(q: T): T => {
      let r = q.eq('id_pais', pais.id)
      if (desde) r = r.gte('hora_intento', inicioDelDia(desde, tz))
      if (hasta) r = r.lt('hora_intento', inicioDelDia(sumarDias(hasta, 1), tz))
      const t = texto.trim().replace(/[,()%*]/g, ' ')
      if (t) {
        const partes = [`cliente.ilike.%${t}%`, `cedula.ilike.%${t}%`, `telefono.ilike.%${t}%`, `usuario.ilike.%${t}%`]
        if (/^\d+$/.test(t)) partes.push(`numero_solicitud.eq.${t}`)
        r = r.or(partes.join(','))
      }
      return r
    },
    [pais.id, desde, hasta, texto, tz],
  )

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const { data, count, error } = await consulta(sb.from('v_intentos_llamada').select('*', { count: 'exact' }))
      .order('num', { ascending: true })
      .order('hora_intento', { ascending: true })
      .range(pagina * TAM, pagina * TAM + TAM - 1)
    if (error) setError(error.message)
    setFilas(data ?? [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [consulta, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function exportar() {
    setExportando(true)
    const todas: VIntento[] = []
    for (let d = 0; ; d += 1000) {
      const { data, error } = await consulta(sb.from('v_intentos_llamada').select('*'))
        .order('num', { ascending: true })
        .order('hora_intento', { ascending: true })
        .range(d, d + 999)
      if (error) {
        setError(error.message)
        break
      }
      todas.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    const cab = ['NÚM', 'CLIENTE', 'ESTADO', 'NUMERO DE SOLICITUD', 'TIPO DE CRÉDITO', 'CEDULA', 'TELEFONO', 'FECHA DE FORMALIZADO', 'ESTATUS DE LLAMADA', 'PROMOTOR', 'Hora Intento', 'Usuario']
    const datos = todas.map((r) => [
      r.num, r.cliente, r.estado ?? '', r.numero_solicitud, r.tipo_credito ?? '', r.cedula ?? '', r.telefono ?? '', fmtFechaHora(r.fecha_formalizado, tz),
      r.estatus_intento || 'Sin estatus', r.promotor ?? '', fmtFechaHora(r.hora_intento, tz), usuarioCorto(r.usuario),
    ])
    const csv = Papa.unparse({ fields: cab, data: datos }, { delimiter: ';' })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bitacora_intentos_${pais.codigo}_${desde || 'inicio'}_${hasta || 'hoy'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setExportando(false)
  }

  const paginas = Math.max(1, Math.ceil(total / TAM))

  return (
    <>
      <div className="barra">
        <label>
          Desde
          <input type="date" value={desde} max={hasta || undefined} onChange={(e) => { setDesde(e.target.value); setPagina(0) }} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} min={desde || undefined} onChange={(e) => { setHasta(e.target.value); setPagina(0) }} />
        </label>
        <label>
          Buscar
          <input placeholder="Cliente, cédula, teléfono, solicitud, usuario…" value={textoInput} onChange={(e) => setTextoInput(e.target.value)} style={{ width: 280 }} />
        </label>
        <div className="espacio" />
        <button className="btn secundario" onClick={exportar} disabled={exportando || total === 0}>{exportando ? 'Exportando…' : 'Exportar CSV'}</button>
      </div>

      <div className="aviso info" style={{ marginBottom: 12 }}>
        Cada vez que un usuario abre un registro para gestionarlo queda un intento. Las horas se muestran en la zona horaria de {pais.nombre} ({tz}).
      </div>
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table className="sin-clic">
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
                <th>Hora Intento</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id}>
                  <td>{r.num}</td>
                  <td title={r.cliente}>{r.cliente}</td>
                  <td>{r.estado}</td>
                  <td>{r.numero_solicitud}</td>
                  <td>{r.tipo_credito}</td>
                  <td>{r.cedula}</td>
                  <td>{r.telefono}</td>
                  <td>{fmtFechaHora(r.fecha_formalizado, tz)}</td>
                  <td>{r.estatus_intento ? r.estatus_intento : <span className="chip">Sin estatus</span>}</td>
                  <td title={r.promotor ?? ''}>{r.promotor}</td>
                  <td>{fmtFechaHora(r.hora_intento, tz)}</td>
                  <td>{usuarioCorto(r.usuario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cargando && filas.length === 0 && <div className="vacio">No hay intentos de llamada en este rango de fechas.</div>}
        </div>
        <div className="pie">
          <span>{cargando ? 'Cargando…' : `${total.toLocaleString('es-NI')} intentos`}</span>
          <div className="espacio" />
          <button className="btn secundario" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina + 1} de {paginas}</span>
          <button className="btn secundario" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      </div>
    </>
  )
}
