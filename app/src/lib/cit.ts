import Papa from 'papaparse'

// Fila lista para enviar a importar_cit_lote()
export interface FilaCit {
  llave_credito: string // tipo_doc + '_' + numero_doc (o la columna Llave), para calzar con la llave de crédito de la bitácora
  f_ultima_formalizacion: string // aaaa-mm-dd
}

export interface ResultadoLecturaCit {
  totalFilas: number
  elegibles: FilaCit[]
  sinDatos: number
}

const limpia = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim()

// Acepta una fecha de Excel (Date), d/m/aaaa o aaaa-mm-dd
function parseFecha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const t = limpia(v)
  if (!t) return null
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

// Busca una columna sin importar mayúsculas
function columna(r: Record<string, unknown>, nombre: string): unknown {
  const clave = Object.keys(r).find((k) => k.trim().toLowerCase() === nombre)
  return clave === undefined ? undefined : r[clave]
}

function leerFilas(filas: Record<string, unknown>[]): ResultadoLecturaCit {
  const res: ResultadoLecturaCit = { totalFilas: 0, elegibles: [], sinDatos: 0 }
  for (const r of filas) {
    const tipoDoc = limpia(columna(r, 'tipo_doc'))
    const numeroDoc = limpia(columna(r, 'numero_doc'))
    const llave = limpia(columna(r, 'llave')) || (tipoDoc && numeroDoc ? `${tipoDoc}_${numeroDoc}` : '')
    if (!llave && !limpia(columna(r, 'f_ultima_formalizacion'))) continue // fila vacía al final de la hoja
    res.totalFilas++
    const fecha = parseFecha(columna(r, 'f_ultima_formalizacion'))
    if (!llave || !fecha) {
      res.sinDatos++
      continue
    }
    res.elegibles.push({ llave_credito: llave, f_ultima_formalizacion: fecha })
  }
  return res
}

// El archivo CIT (Excel .xlsx o CSV) trae, entre otras, las columnas Llave, tipo_doc, numero_doc y f_ultima_formalizacion.
export async function leerCit(archivo: File): Promise<ResultadoLecturaCit> {
  if (/\.xlsx$/i.test(archivo.name)) {
    const { default: readXlsxFile } = await import('read-excel-file') // se descarga solo cuando hace falta
    const [cab, ...resto] = await readXlsxFile(archivo)
    const nombres = (cab ?? []).map((c) => limpia(c))
    return leerFilas(resto.map((fila) => Object.fromEntries(nombres.map((n, i) => [n, fila[i]]))))
  }
  const texto = await archivo.text()
  const delimitador = texto.slice(0, texto.indexOf('\n')).includes(';') ? ';' : ','
  const parsed = Papa.parse<Record<string, string>>(texto, { header: true, delimiter: delimitador, skipEmptyLines: true })
  return leerFilas(parsed.data)
}
