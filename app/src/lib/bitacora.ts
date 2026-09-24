import Papa from 'papaparse'
import type { Database } from '../types/database.types'

type Insert = Database['public']['Tables']['llamadas_bienvenida']['Insert']

// Solo se importan los créditos en estos ESTADOS de la bitácora (comparación sin acentos ni mayúsculas).
export const ESTADOS_IMPORTABLES = [
  'FORMALIZADO',
  'AUDITADO',
  'EXPEDIENTE COMPLETO',
  'EXPEDIENTE INCOMPLETO',
  'EXPEDIENTE CORREGIDO ASESOR',
  'EXPEDIENTE INSCRIPCION PRENDARIA',
]

const normaliza = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()

export interface ResultadoLectura {
  totalFilas: number
  elegibles: Insert[]
  porEstado: Record<string, number> // elegibles por ESTADO
  fueraDeEstado: number
  duplicadosEnArchivo: number
  sinDatos: number
}

const limpia = (v: string | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

// "DD/MM/YYYY HH:mm:ss" (hora de Nicaragua, UTC-6) -> ISO con offset
function fechaAIso(v: string | undefined): string | null {
  const t = limpia(v)
  if (!t) return null
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-06:00`
}

export function leerBitacora(texto: string): ResultadoLectura {
  const parsed = Papa.parse<Record<string, string>>(texto, { header: true, delimiter: ';', skipEmptyLines: true })
  const vistos = new Set<number>()
  const res: ResultadoLectura = { totalFilas: parsed.data.length, elegibles: [], porEstado: {}, fueraDeEstado: 0, duplicadosEnArchivo: 0, sinDatos: 0 }

  for (const r of parsed.data) {
    const solicitud = Number((r['Num Solicitud'] ?? '').trim())
    const cliente = limpia(r['Cliente'])
    if (!Number.isFinite(solicitud) || solicitud <= 0 || !cliente) {
      res.sinDatos++
      continue
    }
    const estadoNorm = normaliza(r['Estado'] ?? '')
    if (!ESTADOS_IMPORTABLES.includes(estadoNorm)) {
      res.fueraDeEstado++
      continue
    }
    const fecha = fechaAIso(r['Fecha Formalizado'])
    if (vistos.has(solicitud)) {
      res.duplicadosEnArchivo++
      continue
    }
    vistos.add(solicitud)
    res.porEstado[estadoNorm] = (res.porEstado[estadoNorm] ?? 0) + 1

    const comprobante = limpia(r['Comprobante'])
    const consecutivo = limpia(r['Consecutivo'])
    const informa = comprobante && consecutivo && consecutivo !== '0' ? `${comprobante}${consecutivo}` : null
    const base = fecha ?? fechaAIso(r['Fecha Creacion']) ?? new Date().toISOString()
    const periodo = base.slice(0, 7)

    res.elegibles.push({
      periodo,
      cliente,
      estado: limpia(r['Estado']),
      informa,
      numero_solicitud: solicitud,
      cedula: limpia(r['Cedula']),
      telefono: limpia(r['Tel. Contacto']),
      lugar_trabajo: limpia(r['Lugar de Trabajo']),
      fecha_formalizado: fecha,
      tipo_credito: limpia(r['Tipo Credito']),
      promotor: limpia(r['Promotor']),
      categorizacion: limpia(r['Categorizacion']),
      modalidad: limpia(r['Modalidad']),
    })
  }
  return res
}
