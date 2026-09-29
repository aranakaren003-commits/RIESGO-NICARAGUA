import Papa from 'papaparse'

// Fila lista para enviar a importar_cit_lote()
export interface FilaCit {
  llave_credito: string // tipo_doc + '_' + numero_doc, para calzar con la llave de crédito de la bitácora
  f_ultima_formalizacion: string // aaaa-mm-dd
}

export interface ResultadoLecturaCit {
  totalFilas: number
  elegibles: FilaCit[]
  sinDatos: number
}

const limpia = (v: string | undefined): string => (v ?? '').trim()

// Acepta dd/mm/aaaa o aaaa-mm-dd
function parseFecha(v: string | undefined): string | null {
  const t = limpia(v)
  if (!t) return null
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

// El archivo CIT trae, entre otras, las columnas tipo_doc, numero_doc y f_ultima_formalizacion.
export function leerCit(texto: string): ResultadoLecturaCit {
  const delimitador = texto.slice(0, texto.indexOf('\n')).includes(';') ? ';' : ','
  const parsed = Papa.parse<Record<string, string>>(texto, { header: true, delimiter: delimitador, skipEmptyLines: true })
  const res: ResultadoLecturaCit = { totalFilas: parsed.data.length, elegibles: [], sinDatos: 0 }

  for (const r of parsed.data) {
    const tipoDoc = limpia(r['tipo_doc'] ?? r['TIPO_DOC'] ?? r['Tipo_Doc'])
    const numeroDoc = limpia(r['numero_doc'] ?? r['NUMERO_DOC'] ?? r['Numero_Doc'])
    const fecha = parseFecha(r['f_ultima_formalizacion'] ?? r['F_ULTIMA_FORMALIZACION'] ?? r['Fecha_Ultima_Formalizacion'])
    if (!tipoDoc || !numeroDoc || !fecha) {
      res.sinDatos++
      continue
    }
    res.elegibles.push({ llave_credito: `${tipoDoc}_${numeroDoc}`, f_ultima_formalizacion: fecha })
  }
  return res
}
