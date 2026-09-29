import { useState } from 'react'
import { sb } from '../lib/supabase'
import { usePais } from '../lib/pais'
import { leerCit, type ResultadoLecturaCit } from '../lib/cit'
import type { Json } from '../types/database.types'

const LOTE = 500

// El CIT reasigna, fila por fila, el período (año-mes) de un crédito de la bitácora según su f_ultima_formalizacion,
// cruzando por la llave de crédito (tipo_doc_numero_doc). No crea registros nuevos: solo reubica los que ya existen.
export default function ImportarCit() {
  const { pais } = usePais()
  const [archivo, setArchivo] = useState('')
  const [lectura, setLectura] = useState<ResultadoLecturaCit | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState('')
  const [error, setError] = useState('')

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setResultado('')
    setArchivo(f.name)
    setLectura(leerCit(await f.text()))
  }

  async function importar() {
    if (!lectura) return
    setTrabajando(true)
    setError('')
    setResultado('')

    const { data: cargaId, error: e1 } = await sb.rpc('crear_carga_cit', { p_pais: pais.id, p_archivo: archivo, p_total: lectura.totalFilas })
    if (e1 || !cargaId) {
      setError(e1?.message ?? 'No se pudo crear la carga.')
      setTrabajando(false)
      return
    }

    let actualizados = 0
    for (let i = 0; i < lectura.elegibles.length; i += LOTE) {
      const lote = lectura.elegibles.slice(i, i + LOTE)
      const { data, error } = await sb.rpc('importar_cit_lote', { p_carga: cargaId, p_filas: lote as unknown as Json })
      if (error) {
        setError(`Falló el lote que empieza en la fila ${i + 1}: ${error.message}. Actualizados hasta aquí: ${actualizados}.`)
        setTrabajando(false)
        return
      }
      actualizados += data ?? 0
    }

    setResultado(
      `CIT procesado en ${pais.nombre}: ${lectura.elegibles.length.toLocaleString('es-NI')} filas leídas, ${actualizados.toLocaleString('es-NI')} créditos de la bitácora reasignados de período. Las filas del CIT sin coincidencia en la bitácora quedan registradas sin efecto.`,
    )
    setLectura(null)
    setTrabajando(false)
  }

  return (
    <div className="tarjeta grupo" style={{ maxWidth: 760 }}>
      <h3>Importar CIT · {pais.nombre}</h3>
      <p style={{ marginTop: 0 }}>
        Carga el archivo CIT (columnas <code>tipo_doc</code>, <code>numero_doc</code> y <code>f_ultima_formalizacion</code>; separador «;» o «,»). Cada fila reasigna el período del crédito de
        la bitácora que tenga esa misma llave de crédito, según el mes de su <code>f_ultima_formalizacion</code>. No crea registros nuevos.
      </p>
      <div className="barra">
        <input type="file" accept=".csv,text/csv" onChange={elegir} />
      </div>

      {lectura && (
        <div className="aviso info" style={{ marginBottom: 12 }}>
          <strong>{archivo}</strong>: {lectura.totalFilas.toLocaleString('es-NI')} filas leídas · {lectura.elegibles.length.toLocaleString('es-NI')} con datos completos · {lectura.sinDatos} sin
          tipo_doc, numero_doc o fecha válida.
        </div>
      )}
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {resultado && <div className="aviso ok" style={{ marginBottom: 12 }}>{resultado}</div>}

      <button className="btn" disabled={!lectura || lectura.elegibles.length === 0 || trabajando} onClick={importar}>
        {trabajando ? 'Procesando…' : `Importar CIT en ${pais.nombre}`}
      </button>
    </div>
  )
}
