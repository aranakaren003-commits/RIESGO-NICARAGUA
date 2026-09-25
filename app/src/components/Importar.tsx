import { useState } from 'react'
import { sb } from '../lib/supabase'
import { usePais } from '../lib/pais'
import { fmtFechaHora, MESES } from '../lib/fechas'
import { ESTADOS_IMPORTABLES, leerBitacora, type ResultadoLectura } from '../lib/bitacora'
import type { Json } from '../types/database.types'

const LOTE = 500

export default function Importar() {
  const { pais } = usePais()
  const [archivo, setArchivo] = useState('')
  const [texto, setTexto] = useState<string | null>(null)
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
    setLectura(leerBitacora(t, pais.zona_horaria))
  }

  async function importar() {
    if (!lectura || texto === null) return
    setTrabajando(true)
    setError('')
    setResultado('')

    const { data: cargaId, error: e1 } = await sb.rpc('crear_carga', { p_pais: pais.id, p_archivo: archivo, p_total: lectura.totalFilas })
    if (e1 || !cargaId) {
      setError(e1?.message ?? 'No se pudo crear la carga.')
      setTrabajando(false)
      return
    }

    let nuevos = 0
    for (let i = 0; i < lectura.elegibles.length; i += LOTE) {
      const lote = lectura.elegibles.slice(i, i + LOTE)
      const { data, error } = await sb.rpc('importar_lote', { p_carga: cargaId, p_filas: lote as unknown as Json })
      if (error) {
        setError(`Falló el lote que empieza en la fila ${i + 1}: ${error.message}. Nuevos insertados hasta aquí: ${nuevos}. La carga quedó registrada de forma parcial.`)
        setTrabajando(false)
        return
      }
      nuevos += data ?? 0
    }

    const { data: carga } = await sb.from('cargas_bitacora').select('*').eq('id', cargaId).maybeSingle()
    const etiqueta = carga ? `Carga ${carga.numero} de ${MESES[Number(carga.periodo.slice(5, 7)) - 1]} ${carga.periodo.slice(0, 4)} (${fmtFechaHora(carga.fecha_carga, pais.zona_horaria)})` : 'Carga nueva'
    setResultado(
      `${etiqueta} · ${pais.nombre}: ${lectura.elegibles.length.toLocaleString('es-NI')} registros en la carga, ${nuevos.toLocaleString('es-NI')} nuevos y ${(lectura.elegibles.length - nuevos).toLocaleString('es-NI')} que ya existían (no se modificaron). Las cargas anteriores se conservan.`,
    )
    setTexto(null)
    setLectura(null)
    setTrabajando(false)
  }

  return (
    <div className="tarjeta grupo" style={{ maxWidth: 760 }}>
      <h3>Importar «Bitácora de Atención» · {pais.nombre}</h3>
      <p style={{ marginTop: 0 }}>
        Carga el CSV de la bitácora (separador «;»). Cada importación se guarda como una <strong>carga nueva</strong> dentro del período (año y mes) de hoy en {pais.nombre}; las cargas
        anteriores <strong>no se eliminan</strong> y se pueden consultar desde el filtro Año → Mes → Día → Carga. Se llenan los campos de información del cliente y del crédito
        (CLIENTE, ESTADO, INFORMA, NUMERO DE SOLICITUD, TIPO DE CRÉDITO, CEDULA, TELEFONO, LUGAR DONDE TRABAJA, FECHA DE FORMALIZADO, PROMOTOR, CATEGORIZACIÓN, MODALIDAD). Los demás campos los
        ingresa el usuario. El archivo se procesa en tu navegador y solo se guardan esos campos.
      </p>
      <div className="barra">
        <input type="file" accept=".csv,text/csv" onChange={elegir} />
      </div>
      <div className="aviso info" style={{ marginBottom: 12 }}>
        Solo se importan los créditos con ESTADO: {ESTADOS_IMPORTABLES.map((e) => e.toLowerCase()).join(', ')}. El resto se omite. Los registros que ya existen en {pais.nombre} no se modifican
        (se conservan las ediciones), pero quedan ligados a la nueva carga.
      </div>

      {lectura && (
        <div className="aviso info" style={{ marginBottom: 12 }}>
          <strong>{archivo}</strong>: {lectura.totalFilas.toLocaleString('es-NI')} filas leídas · {lectura.elegibles.length.toLocaleString('es-NI')} a importar ·{' '}
          {lectura.fueraDeEstado.toLocaleString('es-NI')} omitidas por ESTADO · {lectura.duplicadosEnArchivo} duplicadas en el archivo · {lectura.sinDatos} sin número de solicitud o cliente.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {Object.entries(lectura.porEstado).map(([e, n]) => <li key={e}>{e}: {n.toLocaleString('es-NI')}</li>)}
          </ul>
        </div>
      )}
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {resultado && <div className="aviso ok" style={{ marginBottom: 12 }}>{resultado}</div>}

      <button className="btn" disabled={!lectura || lectura.elegibles.length === 0 || trabajando} onClick={importar}>
        {trabajando ? 'Importando…' : `Importar como carga nueva en ${pais.nombre}`}
      </button>
    </div>
  )
}
