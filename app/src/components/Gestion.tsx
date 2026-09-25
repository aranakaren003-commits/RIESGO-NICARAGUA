import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { fmtFechaHora } from '../lib/fechas'
import { usePais } from '../lib/pais'
import type { Llamada, VCola } from '../types/database.types'
import RegistroForm from './RegistroForm'

const TAM = 50

interface Abierto {
  registro: Llamada | null // null = registro nuevo
  intentoId: string | null
}

// Cola de trabajo del Digitador: solo líneas sin gestionar. Cada selección de la lista es un intento.
export default function Gestion() {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const [texto, setTexto] = useState('')
  const [textoInput, setTextoInput] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<VCola[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState<Abierto | null>(null)
  const [idCarga, setIdCarga] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setTexto(textoInput)
      setPagina(0)
    }, 350)
    return () => clearTimeout(t)
  }, [textoInput])

  useEffect(() => {
    sb.from('cargas_bitacora')
      .select('id')
      .eq('id_pais', pais.id)
      .order('fecha_carga', { ascending: false })
      .limit(1)
      .then(({ data }) => setIdCarga(data?.[0]?.id ?? null))
  }, [pais.id])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    let q = sb.from('v_cola_llamadas').select('*', { count: 'exact' }).eq('id_pais', pais.id)
    const t = texto.trim()
    if (t) q = q.ilike('cedula', `%${t}%`)
    const { data, count, error } = await q
      .order('orden_estatus', { ascending: true })
      .order('fecha_formalizado', { ascending: true, nullsFirst: false })
      .order('intentos', { ascending: true })
      .range(pagina * TAM, pagina * TAM + TAM - 1)
    if (error) setError(error.message)
    setFilas(data ?? [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [pais.id, texto, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function registrar(fila: VCola, resultado: 'NO CONTESTA' | 'BUZON' | 'CONTESTA') {
    setError('')
    setOcupado(fila.id)
    const { data, error } = await sb.rpc('registrar_intento', { p_id: fila.id, p_resultado: resultado })
    if (error) {
      setOcupado(null)
      return setError(error.message)
    }
    const r = data as { fecha_hora_llamada: string | null; id_intento: string } | null

    if (resultado === 'CONTESTA') {
      const { data: reg, error: e2 } = await sb.from('llamadas_bienvenida').select('*').eq('id', fila.id).maybeSingle()
      setOcupado(null)
      if (e2 || !reg) return setError(e2?.message ?? 'No se pudo abrir el registro.')
      setAbierto({ registro: reg, intentoId: r?.id_intento ?? null })
      return
    }
    setOcupado(null)
    await cargar()
  }

  const paginas = Math.max(1, Math.ceil(total / TAM))

  return (
    <>
      <div className="barra">
        <label>
          Buscar cédula
          <input placeholder="Cédula…" value={textoInput} onChange={(e) => setTextoInput(e.target.value)} style={{ width: 260 }} />
        </label>
        <div className="espacio" />
        <button className="btn" onClick={() => setAbierto({ registro: null, intentoId: null })} disabled={!idCarga} title={!idCarga ? 'No hay cargas de la bitácora en este país' : undefined}>
          Nuevo registro
        </button>
      </div>

      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table className="sin-clic">
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>TIPO DE CRÉDITO</th>
                <th>TELEFONO</th>
                <th>FECHA DE FORMALIZADO</th>
                <th>ESTATUS DE LLAMADA</th>
                <th>INTENTOS</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td title={f.cliente}>{f.cliente}</td>
                  <td>{f.tipo_credito}</td>
                  <td>{f.telefono}</td>
                  <td>{fmtFechaHora(f.fecha_formalizado, tz)}</td>
                  <td>
                    <div className="estatus-celda">
                      <select
                        className={`estatus-select${f.estatus_llamada ? ' con-estatus' : ''}`}
                        value={f.estatus_llamada ?? ''}
                        disabled={ocupado === f.id}
                        aria-label={`Estatus de llamada de ${f.cliente}`}
                        onChange={(e) => registrar(f, e.target.value as 'NO CONTESTA' | 'BUZON' | 'CONTESTA')}
                      >
                        <option value="" disabled>Sin estatus</option>
                        <option value="NO CONTESTA">NO CONTESTA</option>
                        <option value="BUZON">BUZON</option>
                        <option value="CONTESTA">CONTESTA</option>
                      </select>
                      {f.estatus_llamada && (
                        <button
                          className="btn secundario mini"
                          disabled={ocupado === f.id}
                          onClick={() => registrar(f, f.estatus_llamada as 'NO CONTESTA' | 'BUZON')}
                          title={`Registrar otro intento: ${f.estatus_llamada}`}
                          aria-label={`Registrar otro intento: ${f.estatus_llamada}`}
                        >
                          +1
                        </button>
                      )}
                    </div>
                  </td>
                  <td>{f.intentos}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cargando && filas.length === 0 && (
            <div className="vacio">{texto.trim() ? 'No hay líneas pendientes con esa cédula.' : 'No hay llamadas pendientes. Cuando se cargue la bitácora aparecerán aquí.'}</div>
          )}
        </div>
        <div className="pie">
          <span>{cargando ? 'Cargando…' : `${total.toLocaleString('es-NI')} pendientes`}</span>
          <div className="espacio" />
          <button className="btn secundario" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina + 1} de {paginas}</span>
          <button className="btn secundario" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      </div>

      {abierto && (
        <RegistroForm
          key={abierto.registro?.id ?? 'nuevo'}
          registro={abierto.registro}
          idCarga={idCarga}
          soloLectura={false}
          modoDigitador
          intentoId={abierto.intentoId}
          onClose={() => {
            setAbierto(null)
            cargar()
          }}
          onSaved={() => {
            setAbierto(null)
            cargar()
          }}
        />
      )}
    </>
  )
}
