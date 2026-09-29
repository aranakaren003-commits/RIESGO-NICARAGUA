import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { fmtFechaHora } from '../lib/fechas'
import { usePais } from '../lib/pais'
import type { Llamada } from '../types/database.types'
import RegistroForm from './RegistroForm'

const TAM = 50

interface Abierto {
  registro: Llamada
  intentoId: string | null
}

// Pestaña del Digitador: números equivocados pendientes de gestionar. Marcar «Gestionado» cuenta como un intento
// y abre la lista para definir el resultado (no contesta, buzón, devolver llamada o contesta).
export default function GestionNumeroEquivocado() {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<Llamada[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState<Abierto | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const { data, count, error } = await sb
      .from('llamadas_bienvenida')
      .select('*', { count: 'exact' })
      .eq('id_pais', pais.id)
      .eq('estatus_llamada', 'NUMERO EQUIVOCADO')
      .order('numero_equivocado_gestionado', { ascending: true })
      .order('fecha_formalizado', { ascending: true, nullsFirst: false })
      .range(pagina * TAM, pagina * TAM + TAM - 1)
    if (error) setError(error.message)
    setFilas(data ?? [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [pais.id, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function marcarGestionado(fila: Llamada) {
    setError('')
    setOcupado(fila.id)
    const { error } = await sb.rpc('marcar_numero_equivocado_gestionado', { p_id: fila.id })
    setOcupado(null)
    if (error) return setError(error.message)
    await cargar()
  }

  async function definirResultado(fila: Llamada, resultado: 'NO CONTESTA' | 'BUZON' | 'CONTESTA') {
    setError('')
    setOcupado(fila.id)
    const { data, error } = await sb.rpc('registrar_intento', { p_id: fila.id, p_resultado: resultado })
    if (error) {
      setOcupado(null)
      return setError(error.message)
    }
    if (resultado === 'CONTESTA') {
      const { data: reg, error: e2 } = await sb.from('llamadas_bienvenida').select('*').eq('id', fila.id).maybeSingle()
      setOcupado(null)
      if (e2 || !reg) return setError(e2?.message ?? 'No se pudo abrir el registro.')
      const r = data as { id_intento: string } | null
      setAbierto({ registro: reg, intentoId: r?.id_intento ?? null })
      return
    }
    setOcupado(null)
    await cargar()
  }

  const paginas = Math.max(1, Math.ceil(total / TAM))

  return (
    <>
      <div className="aviso info" style={{ marginBottom: 12 }}>
        Marca «Gestionado» cuando ya corregiste el número del cliente; eso cuenta como un intento. Luego elige cómo salió la llamada al número correcto.
      </div>
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table className="sin-clic tabla-gestion">
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>TELEFONO</th>
                <th>COMENTARIO</th>
                <th>FECHA DE FORMALIZADO</th>
                <th>GESTIONADO</th>
                <th>RESULTADO</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td title={f.cliente}>{f.cliente}</td>
                  <td>{f.telefono}</td>
                  <td title={f.numero_pertenece_a ?? ''}>{f.numero_pertenece_a}</td>
                  <td>{fmtFechaHora(f.fecha_formalizado, tz)}</td>
                  <td>
                    <label className="interruptor">
                      <input
                        type="checkbox"
                        checked={f.numero_equivocado_gestionado}
                        disabled={f.numero_equivocado_gestionado || ocupado === f.id}
                        onChange={() => marcarGestionado(f)}
                      />
                      {f.numero_equivocado_gestionado ? 'Sí' : 'No'}
                    </label>
                  </td>
                  <td>
                    {f.numero_equivocado_gestionado ? (
                      <select
                        className="estatus-select"
                        value=""
                        disabled={ocupado === f.id}
                        aria-label={`Resultado de ${f.cliente}`}
                        onChange={(e) => definirResultado(f, e.target.value as 'NO CONTESTA' | 'BUZON' | 'CONTESTA')}
                      >
                        <option value="" disabled>Elegir…</option>
                        <option value="NO CONTESTA">NO CONTESTA</option>
                        <option value="BUZON">BUZON</option>
                        <option value="CONTESTA">CONTESTA (incluye devolver llamada)</option>
                      </select>
                    ) : (
                      <span className="chip">Pendiente de gestionar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cargando && filas.length === 0 && <div className="vacio">No hay números equivocados pendientes.</div>}
        </div>
        <div className="pie">
          <span>{cargando ? 'Cargando…' : `${total.toLocaleString('es-NI')} registros`}</span>
          <div className="espacio" />
          <button className="btn secundario" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina + 1} de {paginas}</span>
          <button className="btn secundario" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      </div>

      {abierto && (
        <RegistroForm
          registro={abierto.registro}
          idCarga={null}
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
