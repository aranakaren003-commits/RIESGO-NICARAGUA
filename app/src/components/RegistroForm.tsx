import { useEffect, useRef, useState } from 'react'
import { sb } from '../lib/supabase'
import { FIELD_GROUPS, esProducto, type FieldDef } from '../lib/fields'
import { isoToLocalInput, localInputToIso, periodoDe } from '../lib/fechas'
import { usePais } from '../lib/pais'
import type { Database, Llamada } from '../types/database.types'

type Update = Database['public']['Tables']['llamadas_bienvenida']['Update']
type Insert = Database['public']['Tables']['llamadas_bienvenida']['Insert']

interface Props {
  registro: Llamada | null // null = registro nuevo
  idCarga: string | null // carga a la que se liga un registro nuevo
  soloLectura: boolean
  onClose: () => void
  onSaved: () => void
}

function valorInicial(r: Llamada | null, f: FieldDef, tz: string): string {
  if (!r) return ''
  const v = r[f.key]
  if (v === null || v === undefined) return ''
  if (f.type === 'datetime') return isoToLocalInput(String(v), tz)
  return String(v)
}

export default function RegistroForm({ registro, idCarga, soloLectura, onClose, onSaved }: Props) {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const ini: Record<string, string> = {}
    for (const g of FIELD_GROUPS) for (const f of g.fields) ini[f.key] = valorInicial(registro, f, tz)
    return ini
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const intentoId = useRef<string | null>(null)
  const abierto = useRef(false)

  // Al abrir un registro existente: se fija (solo la primera vez) FECHA Y HORA y se anota un intento en la bitácora.
  useEffect(() => {
    if (!registro || soloLectura || abierto.current) return
    abierto.current = true
    sb.rpc('abrir_registro', { p_id: registro.id }).then(({ data, error }) => {
      if (error) return setError(`No se pudo registrar el intento: ${error.message}`)
      const r = data as { fecha_hora_llamada: string | null; id_intento: string } | null
      if (!r) return
      intentoId.current = r.id_intento
      setValores((p) => ({ ...p, fecha_hora_llamada: isoToLocalInput(r.fecha_hora_llamada, tz) }))
    })
  }, [registro, soloLectura, tz])

  const cambia = (k: string, v: string) => setValores((p) => ({ ...p, [k]: v }))

  async function guardar() {
    setError('')
    const cliente = valores.cliente.trim()
    const solicitud = Number(valores.numero_solicitud)
    if (!cliente) return setError('CLIENTE es obligatorio.')
    if (!Number.isInteger(solicitud) || solicitud <= 0) return setError('NUMERO DE SOLICITUD debe ser un número entero positivo.')

    const faltan: string[] = []
    for (const g of FIELD_GROUPS) {
      if (g.obligatorioEn && esProducto(valores.tipo_credito, g.obligatorioEn)) {
        for (const f of g.fields) if (!valores[f.key]) faltan.push(f.caption ?? f.label)
      }
    }
    if (faltan.length) return setError(`Obligatorio para este tipo de crédito: ${faltan.join(' · ')}.`)

    const payload: Record<string, string | number | null> = {}
    for (const g of FIELD_GROUPS) {
      const aplica = !g.aplicaA || esProducto(valores.tipo_credito, g.aplicaA)
      for (const f of g.fields) {
        if (f.readOnly) continue
        const v = valores[f.key].trim()
        if (!aplica) payload[f.key] = null // sección que no aplica al producto: se deja vacía
        else if (f.key === 'numero_solicitud') payload[f.key] = solicitud
        else if (f.type === 'datetime') payload[f.key] = localInputToIso(valores[f.key], tz)
        else payload[f.key] = v === '' ? null : v
      }
    }
    const iso = payload.fecha_formalizado
    payload.periodo = typeof iso === 'string' ? periodoDe(iso, tz) : (registro?.periodo ?? periodoDe(new Date().toISOString(), tz))

    setGuardando(true)
    if (registro) {
      const res = await sb.from('llamadas_bienvenida').update(payload as Update).eq('id', registro.id)
      if (res.error) {
        setGuardando(false)
        return setError(res.error.message)
      }
      // el intento de esta apertura queda con el estatus que se dejó al guardar
      if (intentoId.current) await sb.rpc('actualizar_intento', { p_id: intentoId.current, p_estatus: (payload.estatus_llamada as string | null) ?? '' })
    } else {
      const res = await sb
        .from('llamadas_bienvenida')
        .insert({ ...payload, id_pais: pais.id } as unknown as Insert)
        .select('id')
        .single()
      if (res.error || !res.data) {
        setGuardando(false)
        return setError(res.error?.code === '23505' ? 'Ya existe un registro con ese NUMERO DE SOLICITUD en este país.' : (res.error?.message ?? 'No se pudo crear el registro.'))
      }
      if (idCarga) await sb.from('carga_registros').insert({ id_carga: idCarga, id_llamada: res.data.id })
      await sb.rpc('abrir_registro', { p_id: res.data.id })
    }
    setGuardando(false)
    onSaved()
  }

  function campo(f: FieldDef, obligatorio = false) {
    const id = `f-${f.key}`
    const v = valores[f.key]
    const bloqueado = f.readOnly || (f.key === 'numero_solicitud' && !!registro)
    let control
    if (f.type === 'select') {
      control = (
        <select id={id} value={v} onChange={(e) => cambia(f.key, e.target.value)}>
          <option value="">—</option>
          {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          {v && !f.options?.includes(v) && <option value={v}>{v}</option>}
        </select>
      )
    } else if (f.type === 'sino') {
      control = (
        <div className="sino" role="group" aria-labelledby={`${id}-lbl`}>
          {['SI', 'NO'].map((o) => (
            <label key={o} className="sino-op">
              <input type="checkbox" checked={v === o} onChange={() => cambia(f.key, v === o ? '' : o)} />
              {o}
            </label>
          ))}
        </div>
      )
    } else if (f.type === 'textarea') {
      control = <textarea id={id} rows={3} value={v} onChange={(e) => cambia(f.key, e.target.value)} />
    } else {
      const tipo = f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'number' : f.type
      control = (
        <input id={id} type={tipo} value={f.key === 'num' && !registro ? '' : v} placeholder={f.key === 'num' ? 'Automático' : f.key === 'fecha_hora_llamada' ? 'Se registra al abrir' : ''} disabled={bloqueado} onChange={(e) => cambia(f.key, e.target.value)} />
      )
    }
    return (
      <div key={f.key} className={`campo${f.type === 'textarea' || (f.caption && f.caption.length > 60) ? ' ancho' : ''}`}>
        <label id={`${id}-lbl`} htmlFor={f.type === 'sino' ? undefined : id}>
          {f.label}
          {obligatorio && <span className="req" title="Obligatorio"> *</span>}
        </label>
        {f.caption && <div className="pregunta">{f.caption}</div>}
        {control}
      </div>
    )
  }

  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel" role="dialog" aria-modal="true">
        <div className="panel-cab">
          <h2>{registro ? `${registro.cliente}` : 'Nuevo registro'}</h2>
          {registro && <span className="chip neutro">NÚM {registro.num}</span>}
          <div className="espacio" />
          <button className="btn secundario" onClick={onClose}>Cerrar</button>
        </div>
        <fieldset className="panel-cuerpo" disabled={soloLectura}>
          {FIELD_GROUPS.map((g) => {
            const origen = g.fields.every((f) => f.source === 'bitacora') ? 'bitacora' : g.fields.every((f) => f.source === 'manual') ? 'manual' : null
            const aplica = !g.aplicaA || esProducto(valores.tipo_credito, g.aplicaA)
            const obligatorio = !!g.obligatorioEn && esProducto(valores.tipo_credito, g.obligatorioEn)
            return (
              <section key={g.title} className={`tarjeta grupo${aplica ? '' : ' inactivo'}`}>
                <h3>
                  {g.title}
                  {origen === 'bitacora' && <span className="etiqueta-origen bitacora">Desde bitácora · editable</span>}
                  {origen === 'manual' && <span className="etiqueta-origen manual">Ingreso del usuario</span>}
                  {g.aplicaA && !aplica && <span className="etiqueta-origen bitacora">Solo aplica a créditos de tipo {g.aplicaA.toUpperCase()}</span>}
                  {obligatorio && <span className="etiqueta-origen obligatorio">Obligatorio para {g.obligatorioEn?.toUpperCase()}</span>}
                </h3>
                <fieldset className="sin-borde" disabled={!aplica}>
                  <div className="rejilla">{g.fields.map((f) => campo(f, obligatorio))}</div>
                </fieldset>
              </section>
            )
          })}
        </fieldset>
        <div className="panel-pie">
          {error && <div className="aviso error">{error}</div>}
          {soloLectura && <div className="aviso info">Solo lectura: tu rol no permite modificar registros.</div>}
          <div className="espacio" />
          <button className="btn secundario" onClick={onClose}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>}
        </div>
      </div>
    </div>
  )
}
