import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/browser'

// Fila lista para enviar a importar_cit_lote()
export interface FilaCit {
  llave_credito: string // p. ej. PZU_3958 (tipo_doc + '_' + numero_doc), igual a la llave de crédito de la bitácora
  f_ultima_formalizacion: string // aaaa-mm-dd
}

export interface ResultadoLecturaCit {
  totalFilas: number
  elegibles: FilaCit[]
  sinDatos: number
  porPeriodo: Record<string, number>
}

const limpia = (v: unknown): string => String(v ?? '').trim()
const claveCol = (v: unknown): string => limpia(v).toLowerCase().replace(/\s+/g, '_')

// Acepta Date (celda de Excel), dd/mm/aaaa o aaaa-mm-dd
function parseFecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  }
  const t = limpia(v)
  if (!t) return null
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

async function leerFilas(archivo: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(archivo.name)) return (await readSheet(archivo)) as unknown[][]
  const texto = await archivo.text()
  const delimitador = texto.slice(0, texto.indexOf('\n')).includes(';') ? ';' : ','
  return Papa.parse<string[]>(texto, { delimiter: delimitador, skipEmptyLines: true }).data
}

// El CIT (.xlsx o .csv) puede traer más columnas; solo se usan Llave (o tipo_doc + numero_doc) y f_ultima_formalizacion.
export async function leerCit(archivo: File): Promise<ResultadoLecturaCit> {
  const filas = await leerFilas(archivo)
  const cab = (filas[0] ?? []).map(claveCol)
  const iLlave = cab.indexOf('llave')
  const iTipo = cab.indexOf('tipo_doc')
  const iNumero = cab.indexOf('numero_doc')
  const iFecha = cab.indexOf('f_ultima_formalizacion')
  const datos = filas.slice(1)
  const res: ResultadoLecturaCit = { totalFilas: datos.length, elegibles: [], sinDatos: 0, porPeriodo: {} }
  if (iFecha < 0 || (iLlave < 0 && (iTipo < 0 || iNumero < 0))) {
    res.sinDatos = datos.length
    return res
  }

  const vistas = new Set<string>()
  for (const r of datos) {
    const llave = iLlave >= 0 && limpia(r[iLlave]) ? limpia(r[iLlave]) : `${limpia(r[iTipo])}_${limpia(r[iNumero])}`
    const fecha = parseFecha(r[iFecha])
    if (!fecha || llave === '_' || llave.startsWith('_') || llave.endsWith('_')) {
      res.sinDatos++
      continue
    }
    if (vistas.has(llave)) continue
    vistas.add(llave)
    res.elegibles.push({ llave_credito: llave, f_ultima_formalizacion: fecha })
    const periodo = fecha.slice(0, 7)
    res.porPeriodo[periodo] = (res.porPeriodo[periodo] ?? 0) + 1
  }
  return res
}
