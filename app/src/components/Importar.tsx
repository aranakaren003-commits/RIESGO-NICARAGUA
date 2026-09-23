import { useState } from 'react'
import { sb } from '../lib/supabase'
import { leerBitacora, type ResultadoLectura } from '../lib/bitacora'

const LOTE = 500

export default function Importar() {
  const [soloFormalizados, setSoloFormalizados] = useState(true)
  const [texto, setTexto] = useState<string | null>(null)
  const [archivo, setArchivo] = useState('')
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState('')
  const [error, setError] = useState('')

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setResultado('')
    setArchivo(f.name)
    const t = await f.text()
    setTexto(t)
    setLectura(leerBitacora(t, soloFormalizados))
  }

  function cambiaFiltro(v: boolean) {
    setSoloFormalizados(v)
    if (texto) setLectura(leerBitacora(texto, v))
  }

  async function importar() {
    if (!lectura) return
    setTrabajando(true)
    setError('')
    setResultado('')
    let nuevos = 0
    for (let i = 0; i < lectura.elegibles.length; i += LOTE) {
      const lote = lectura.elegibles.slice(i, i + LOTE)
      // ignoreDuplicates: los registros que ya existen no se tocan (se conservan las ediciones del usuario)
      const { data, error } = await sb
        .from('llamadas_bienvenida')
        .upsert(lote, { onConflict: 'numero_solicitud', ignoreDuplicates: true })
        .select('id')
      if (error) {
        setError(`Falló el lote que empieza en la fila ${i + 1}: ${error.message}. Nuevos insertados hasta aquí: ${nuevos}.`)
        setTrabajando(false)
        return
      }
      nuevos += data?.length ?? 0
    }
    setResultado(`Importación terminada: ${nuevos} registros nuevos, ${lectura.elegibles.length - nuevos} ya existían y no se modificaron.`)
    setTrabajando(false)
  }

  return (
    <div className="tarjeta grupo" style={{ maxWidth: 720 }}>
      <h3>Importar «Bitácora de Atención»</h3>
      <p style={{ marginTop: 0 }}>
        Carga el CSV de la bitácora (separador «;»). Se llenan los campos de información del cliente y del crédito (CLIENTE, ESTADO, INFORMA, NUMERO DE SOLICITUD, CEDULA, TELEFONO,
        LUGAR DONDE TRABAJA, FECHA DE FORMALIZADO, TIPO DE CRÉDITO, PROMOTOR, CATEGORIZACIÓN, MODALIDAD). Los demás campos los ingresa el usuario. El archivo
        se procesa en tu navegador y solo se guardan esos campos.
      </p>
      <div className="barra">
        <input type="file" accept=".csv,text/csv" onChange={elegir} />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input type="checkbox" checked={soloFormalizados} onChange={(e) => cambiaFiltro(e.target.checked)} />
        Solo créditos con FECHA DE FORMALIZADO (recomendado)
      </label>

      {lectura && (
        <div className="aviso info" style={{ marginBottom: 12 }}>
          <strong>{archivo}</strong>: {lectura.totalFilas.toLocaleString('es-NI')} filas leídas · {lectura.elegibles.length.toLocaleString('es-NI')} a importar ·{' '}
          {lectura.sinFormalizar.toLocaleString('es-NI')} sin formalizar (omitidas) · {lectura.duplicadosEnArchivo} duplicadas en el archivo · {lectura.sinDatos} sin número de solicitud o cliente.
        </div>
      )}
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {resultado && <div className="aviso ok" style={{ marginBottom: 12 }}>{resultado}</div>}

      <button className="btn" disabled={!lectura || lectura.elegibles.length === 0 || trabajando} onClick={importar}>
        {trabajando ? 'Importando…' : 'Importar'}
      </button>
    </div>
  )
}
