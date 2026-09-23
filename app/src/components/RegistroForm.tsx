import { useState } from 'react'
import { sb } from '../lib/supabase'
import { FIELD_GROUPS, isoToLocalInput, localInputToIso, type FieldDef } from '../lib/fields'
import type { Database, Llamada } from '../types/database.types'

type Update = Database['public']['Tables']['llamadas_bienvenida']['Update']

interface Props {
  registro: Llamada | null // null = registro nuevo
  soloLectura: boolean
  onClose: () => void
  onSaved: () => void
}

function valorInicial(r: Llamada | null, f: FieldDef): string {
  if (!r) return ''
  const v = r[f.key]
  if (v === null || v === undefined) return ''
  if (f.type === 'datetime') return isoToLocalInput(String(v))
  return String(v)
}

export default function RegistroForm({ registro, soloLectura, onClose, onSaved }: Props) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const ini: Record<string, string> = {}
    for (const g of FIELD_GROUPS) for (const f of g.fields) ini[f.key] = valorInicial(registro, f)
    return ini
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cambia = (k: string, v: string) => setValores((p) => ({ ...p, [k]: v }))

  async function guardar() {
    setError('')
    const cliente = valores.cliente.trim()
    const solicitud = Number(valores.numero_solicitud)
    if (!cliente) return setError('CLIENTE es obligatorio.')
    if (!Number.isInteger(solicitud) || solicitud <= 0) return setError('NUMERO DE SOLICITUD debe ser un número entero positivo.')

    const payload: Record<string, string | number | null> = {}
    for (const g of FIELD_GROUPS) {
      for (const f of g.fields) {
        if (f.readOnly) continue
        const v = valores[f.key].trim()
        if (f.key === 'numero_solicitud') payload[f.key] = solicitud
        else if (f.type === 'datetime') payload[f.key] = localInputToIso(valores[f.key])
        else payload[f.key] = v === '' ? null : v
      }
    }
    const iso = payload.fecha_formalizado
    payload.periodo =
      typeof iso === 'string' ? isoToLocalInput(iso).slice(0, 7) : (registro?.periodo ?? new Date().toISOString().slice(0, 7))

    setGuardando(true)
    const res = registro
      ? await sb.from('llamadas_bienvenida').update(payload as Update).eq('id', registro.id)
      : await sb.from('llamadas_bienvenida').insert(payload as Database['public']['Tables']['llamadas_bienvenida']['Insert'])
    setGuardando(false)
    if (res.error) {
      setError(res.error.code === '23505' ? 'Ya existe un registro con ese NUMERO DE SOLICITUD.' : res.error.message)
      return
    }
    onSaved()
  }

  function campo(f: FieldDef) {
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
        <input id={id} type={tipo} value={f.key === 'num' && !registro ? '' : v} placeholder={f.key === 'num' ? 'Automático' : ''} disabled={bloqueado} onChange={(e) => cambia(f.key, e.target.value)} />
      )
    }
    return (
      <div key={f.key} className={`campo${f.type === 'textarea' || (f.caption && f.caption.length > 60) ? ' ancho' : ''}`}>
        <label id={`${id}-lbl`} htmlFor={f.type === 'sino' ? undefined : id}>
          {f.label}
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
            return (
              <section key={g.title} className="tarjeta grupo">
                <h3>
                  {g.title}
                  {origen === 'bitacora' && <span className="etiqueta-origen bitacora">Desde bitácora · editable</span>}
                  {origen === 'manual' && <span className="etiqueta-origen manual">Ingreso del usuario</span>}
                </h3>
                <div className="rejilla">{g.fields.map(campo)}</div>
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
