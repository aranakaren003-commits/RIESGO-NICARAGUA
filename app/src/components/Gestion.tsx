import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/supabase'
import { fmtFechaHora, hoyEn } from '../lib/fechas'
import { usePais } from '../lib/pais'
import type { Llamada, ResumenEstatusPeriodo, VCola } from '../types/database.types'
import RegistroForm from './RegistroForm'

const TAM = 50

interface Abierto {
  registro: Llamada | null // null = registro nuevo
  intentoId: string | null
}

// Segmentación por estatus de llamada ('' = todos, 'sin' = sin asignar)
const SEGMENTOS: { valor: string; titulo: string }[] = [
  { valor: '', titulo: 'Todos' },
  { valor: 'sin', titulo: 'Sin asignar' },
  { valor: 'NO CONTESTA', titulo: 'No contesta' },
  { valor: 'BUZON', titulo: 'Buzón' },
  { valor: 'DEVOLVER LLAMADA', titulo: 'Devolver llamada' },
  { valor: 'CONTESTA', titulo: 'Contesta (en gestión)' },
]

// Una devolución de llamada vigente (dentro de los 10 minutos previos a la hora acordada) aparece en cualquier filtro
const DEVOLVER_VIGENTE = 'and(estatus_llamada.eq.DEVOLVER LLAMADA,orden_estatus.eq.0)'

const REFRESCO_MS = 60_000 // las devoluciones de llamada suben en la cola conforme se acerca su hora

function periodosRecientes(tz: string, cuantos = 12): string[] {
  const hoy = hoyEn(tz)
  const [anio, mes] = hoy.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < cuantos; i++) {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// Cola de trabajo del Digitador: solo líneas sin gestionar. Cada selección de la lista es un intento.
export default function Gestion() {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const periodos = useMemo(() => periodosRecientes(tz), [tz])
  const [periodo, setPeriodo] = useState(periodos[0])
  const [texto, setTexto] = useState('')
  const [textoInput, setTextoInput] = useState('')
  const [segmento, setSegmento] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<VCola[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState<Abierto | null>(null)
  const [idCarga, setIdCarga] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenEstatusPeriodo | null>(null)

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

  useEffect(() => {
    if (!periodo) {
      setResumen(null)
      return
    }
    let activo = true
    sb.rpc('resumen_estatus_periodo', { p_pais: pais.id, p_periodo: periodo }).then(({ data }) => {
      if (activo) setResumen((data as unknown as ResumenEstatusPeriodo[] | null)?.[0] ?? null)
    })
    return () => {
      activo = false
    }
  }, [pais.id, periodo])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    let q = sb.from('v_cola_llamadas').select('*', { count: 'exact' }).eq('id_pais', pais.id)
    if (periodo) q = q.eq('periodo', periodo)
    const t = texto.trim().replace(/[,()%*]/g, ' ').trim()
    if (t) {
      const partes = [`cedula.ilike.%${t}%`, `cliente.ilike.%${t}%`]
      if (/^\d+$/.test(t)) partes.push(`numero_solicitud.eq.${t}`)
      q = q.or(partes.join(','))
    }
    if (segmento === 'sin') q = q.or(`estatus_llamada.is.null,${DEVOLVER_VIGENTE}`)
    else if (segmento === 'DEVOLVER LLAMADA') q = q.eq('estatus_llamada', segmento)
    else if (segmento) q = q.or(`estatus_llamada.eq.${segmento},${DEVOLVER_VIGENTE}`)
    const { data, count, error } = await q
      .order('orden_estatus', { ascending: true })
      .order('devolver_llamada_en', { ascending: true, nullsFirst: false })
      .order('fecha_formalizado', { ascending: true, nullsFirst: false })
      .order('intentos', { ascending: true })
      .range(pagina * TAM, pagina * TAM + TAM - 1)
    if (error) setError(error.message)
    setFilas(data ?? [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [pais.id, periodo, texto, segmento, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (abierto) return // no se recarga la cola mientras se llena un formulario
    const id = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar, abierto])

  async function registrar(fila: VCola, resultado: 'NO CONTESTA' | 'BUZON' | 'CONTESTA') {
    setError('')
    setOcupado(fila.id)
    const { data, error } = await sb.rpc('registrar_intento', { p_id: fila.id, p_resultado: resultado })
    if (error) {
      setOcupado(null)
      return setError(error.message)
    }
    const r = data as { id_intento: string } | null

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

  // Reabre una solicitud guardada sin terminar (CONTESTA) sin registrar un intento nuevo
  async function continuar(fila: VCola) {
    setError('')
    setOcupado(fila.id)
    const [{ data: reg, error: e1 }, { data: idIntento }] = await Promise.all([
      sb.from('llamadas_bienvenida').select('*').eq('id', fila.id).maybeSingle(),
      sb.rpc('intento_contesta_abierto', { p_id: fila.id }),
    ])
    setOcupado(null)
    if (e1 || !reg) return setError(e1?.message ?? 'No se pudo abrir el registro.')
    setAbierto({ registro: reg, intentoId: idIntento ?? null })
  }

  const paginas = Math.max(1, Math.ceil(total / TAM))

  return (
    <>
      <div className="barra">
        <label>
          Período de carga
          <select value={periodo} onChange={(e) => { setPeriodo(e.target.value); setPagina(0) }}>
            <option value="">Todos</option>
            {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Buscar
          <input placeholder="Cédula, cliente o solicitud…" value={textoInput} onChange={(e) => setTextoInput(e.target.value)} style={{ width: 240 }} />
        </label>
        <div className="segmentos" role="group" aria-label="Estatus de llamada">
          {SEGMENTOS.map((s) => (
            <button
              key={s.valor || 'todos'}
              className={segmento === s.valor ? 'activo' : ''}
              aria-pressed={segmento === s.valor}
              onClick={() => {
                setSegmento(s.valor)
                setPagina(0)
              }}
            >
              {s.titulo}
            </button>
          ))}
        </div>
        <div className="espacio" />
        <button className="btn" onClick={() => setAbierto({ registro: null, intentoId: null })} disabled={!idCarga} title={!idCarga ? 'No hay cargas de la bitácora en este país' : undefined}>
          Nuevo registro
        </button>
      </div>

      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}

      {resumen && (
        <div className="resumen-periodo">
          <span className="resumen-titulo">% de estatus de llamada · {periodo} (cierre día 4, base: {resumen.total_base.toLocaleString('es-NI')})</span>
          <div className="resumen-chips">
            {(
              [
                ['% Contestación', resumen.aceptacion + resumen.no_aceptacion],
                ['Buzón', resumen.buzon],
                ['No contesta', resumen.no_contesta],
                ['Devolver llamada', resumen.devolver_llamada],
                ['Número equivocado', resumen.numero_equivocado],
                ['Sin estatus', resumen.sin_estatus],
              ] as [string, number][]
            ).map(([nombre, n]) => (
              <span key={nombre} className="chip neutro">
                {nombre}: {resumen.total_base ? Math.round((n / resumen.total_base) * 100) : 0}% ({n})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="leyenda-cola">
        <span className="muestra devolver" /> Devolver llamada vigente (desde 10 minutos antes de la hora acordada) y solicitudes CONTESTA guardadas sin terminar
      </div>

      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table className="sin-clic tabla-gestion">
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>TIPO DE CRÉDITO</th>
                <th>LLAVE DE CRÉDITO</th>
                <th>TELEFONO</th>
                <th>FECHA DE FORMALIZADO</th>
                <th>ESTATUS DE LLAMADA</th>
                <th>INTENTOS</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={f.orden_estatus === 0 ? 'fila-devolver' : ''}>
                  <td title={f.cliente}>{f.cliente}</td>
                  <td title={f.tipo_credito ?? ''}>{f.tipo_credito}</td>
                  <td>{f.llave_credito}</td>
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
                        <option value="" disabled>Sin asignar</option>
                        <option value="NO CONTESTA">NO CONTESTA</option>
                        <option value="BUZON">BUZON</option>
                        <option value="CONTESTA">CONTESTA</option>
                        {f.estatus_llamada === 'DEVOLVER LLAMADA' && <option value="DEVOLVER LLAMADA" disabled>DEVOLVER LLAMADA</option>}
                        {f.estatus_llamada === 'CONTESTA' && <option value="CONTESTA" disabled>CONTESTA (en gestión)</option>}
                      </select>
                      {f.estatus_llamada === 'CONTESTA' && (
                        <button className="btn secundario mini" disabled={ocupado === f.id} onClick={() => continuar(f)} title="Seguir editando la solicitud guardada sin terminar">
                          Continuar
                        </button>
                      )}
                      {f.estatus_llamada === 'DEVOLVER LLAMADA' && f.devolver_llamada_en && (
                        <span className={`devolver-hora${f.orden_estatus === 0 ? ' ya' : ''}`} title="Hora acordada para devolver la llamada">
                          ⏰ {fmtFechaHora(f.devolver_llamada_en, tz)}
                        </span>
                      )}
                      {(f.estatus_llamada === 'NO CONTESTA' || f.estatus_llamada === 'BUZON') && (
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
