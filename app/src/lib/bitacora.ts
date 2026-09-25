import Papa from 'papaparse'
import { paredAIso } from './fechas'

// Fila lista para enviar a importar_lote(); las claves coinciden con las columnas de la función.
export interface FilaImportar {
  periodo: string
  cliente: string
  estado: string | null
  informa: string | null
  numero_solicitud: number
  cedula: string | null
  telefono: string | null
  lugar_trabajo: string | null
  fecha_formalizado: string | null
  tipo_credito: string | null
  promotor: string | null
  categorizacion: string | null
  modalidad: string | null
  email: string | null // Correo_MK
  sucursal: string | null // Suc Origen
  origen: string | null // Medio Captacion
}

// Solo se importan los créditos en estos ESTADOS de la bitácora (comparación sin acentos ni mayúsculas).
export const ESTADOS_IMPORTABLES = [
  'FORMALIZADO',
  'AUDITADO',
  'EXPEDIENTE COMPLETO',
  'EXPEDIENTE INCOMPLETO',
  'EXPEDIENTE CORREGIDO ASESOR',
  'EXPEDIENTE INSCRIPCION PRENDARIA',
]

const normaliza = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()

export interface ResultadoLectura {
  totalFilas: number
  elegibles: FilaImportar[]
  porEstado: Record<string, number> // elegibles por ESTADO
  fueraDeEstado: number
  duplicadosEnArchivo: number
  sinDatos: number
}

const limpia = (v: string | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

// "DD/MM/YYYY HH:mm:ss" (hora del país) -> instante ISO + período aaaa-mm
function parseFecha(v: string | undefined, tz: string): { iso: string; periodo: string } | null {
  const t = limpia(v)
  if (!t) return null
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m
  return { iso: paredAIso(+yyyy, +mm, +dd, +hh, +mi, +ss, tz), periodo: `${yyyy}-${mm}` }
}

export function leerBitacora(texto: string, tz: string): ResultadoLectura {
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
    if (vistos.has(solicitud)) {
      res.duplicadosEnArchivo++
      continue
    }
    vistos.add(solicitud)
    res.porEstado[estadoNorm] = (res.porEstado[estadoNorm] ?? 0) + 1

    const formalizado = parseFecha(r['Fecha Formalizado'], tz)
    const creacion = parseFecha(r['Fecha Creacion'], tz)
    const comprobante = limpia(r['Comprobante'])
    const consecutivo = limpia(r['Consecutivo'])
    const informa = comprobante && consecutivo && consecutivo !== '0' ? `${comprobante}${consecutivo}` : null

    res.elegibles.push({
      periodo: (formalizado ?? creacion)?.periodo ?? new Date().toISOString().slice(0, 7),
      cliente,
      estado: limpia(r['Estado']),
      informa,
      numero_solicitud: solicitud,
      cedula: limpia(r['Cedula']),
      telefono: limpia(r['Tel. Contacto']),
      lugar_trabajo: limpia(r['Lugar de Trabajo']),
      fecha_formalizado: formalizado?.iso ?? null,
      tipo_credito: limpia(r['Tipo Credito']),
      promotor: limpia(r['Promotor']),
      categorizacion: limpia(r['Categorizacion']),
      modalidad: limpia(r['Modalidad']),
      email: limpia(r['Correo_MK']),
      sucursal: limpia(r['Suc Origen']),
      origen: limpia(r['Medio Captacion']),
    })
  }
  return res
}
