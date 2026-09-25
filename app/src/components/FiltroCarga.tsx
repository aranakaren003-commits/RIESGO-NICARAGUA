import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/supabase'
import { MESES, fmtFechaHora } from '../lib/fechas'
import type { CargaBitacora } from '../types/database.types'

interface Resultado {
  carga: CargaBitacora | null
  cargando: boolean
  sinCargas: boolean
  controles: React.ReactNode
}

// Filtro Año → Mes → Día → Carga. Cada carga de la bitácora se conserva como histórico dentro de su período.
export function useFiltroCarga(paisId: string, tz: string): Resultado {
  const [cargas, setCargas] = useState<CargaBitacora[]>([])
  const [cargando, setCargando] = useState(true)
  const [anio, setAnio] = useState('')
  const [mes, setMes] = useState('')
  const [dia, setDia] = useState('')
  const [cargaId, setCargaId] = useState('')

  useEffect(() => {
    let activo = true
    setCargando(true)
    sb.from('cargas_bitacora')
      .select('*')
      .eq('id_pais', paisId)
      .order('fecha_carga', { ascending: false })
      .then(({ data }) => {
        if (!activo) return
        const lista = data ?? []
        setCargas(lista)
        const ultima = lista[0]
        setAnio(ultima ? ultima.fecha_local.slice(0, 4) : '')
        setMes(ultima ? String(Number(ultima.fecha_local.slice(5, 7))) : '')
        setDia('')
        setCargaId(ultima?.id ?? '')
        setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [paisId])

  const anios = useMemo(() => {
    const s = new Set(cargas.map((c) => c.fecha_local.slice(0, 4)))
    s.add(String(new Date().getFullYear()))
    return [...s].sort().reverse()
  }, [cargas])

  const delMes = useMemo(
    () => cargas.filter((c) => c.fecha_local.slice(0, 4) === anio && String(Number(c.fecha_local.slice(5, 7))) === mes),
    [cargas, anio, mes],
  )
  const candidatas = useMemo(
    () => (dia ? delMes.filter((c) => String(Number(c.fecha_local.slice(8, 10))) === dia) : delMes).slice().sort((a, b) => a.numero - b.numero || a.fecha_carga.localeCompare(b.fecha_carga)),
    [delMes, dia],
  )

  useEffect(() => {
    if (candidatas.length === 0) {
      if (cargaId) setCargaId('')
    } else if (!candidatas.some((c) => c.id === cargaId)) {
      setCargaId(candidatas[candidatas.length - 1].id)
    }
  }, [candidatas, cargaId])

  const cuentaMes = (m: number) => cargas.filter((c) => c.fecha_local.slice(0, 4) === anio && Number(c.fecha_local.slice(5, 7)) === m).length
  const cuentaDia = (d: number) => delMes.filter((c) => Number(c.fecha_local.slice(8, 10)) === d).length

  const controles = (
    <>
      <label>
        Año
        <select value={anio} onChange={(e) => setAnio(e.target.value)}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      <label>
        Mes
        <select value={mes} onChange={(e) => { setMes(e.target.value); setDia('') }}>
          {MESES.map((n, i) => <option key={n} value={String(i + 1)}>{n}{cuentaMes(i + 1) ? ` (${cuentaMes(i + 1)})` : ''}</option>)}
        </select>
      </label>
      <label>
        Día
        <select value={dia} onChange={(e) => setDia(e.target.value)}>
          <option value="">Todos</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{d}{cuentaDia(d) ? ` (${cuentaDia(d)})` : ''}</option>)}
        </select>
      </label>
      <label>
        Carga
        <select value={cargaId} onChange={(e) => setCargaId(e.target.value)} disabled={candidatas.length === 0} style={{ minWidth: 250 }}>
          {candidatas.length === 0 && <option value="">Sin cargas en esta fecha</option>}
          {candidatas.map((c) => (
            <option key={c.id} value={c.id}>
              Carga {c.numero} · {fmtFechaHora(c.fecha_carga, tz)} · {c.total_importadas.toLocaleString('es-NI')} registros
            </option>
          ))}
        </select>
      </label>
    </>
  )

  return { carga: cargas.find((c) => c.id === cargaId) ?? null, cargando, sinCargas: !cargando && cargas.length === 0, controles }
}
