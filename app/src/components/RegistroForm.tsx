import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { FIELD_GROUPS, esProducto, type FieldDef } from '../lib/fields'
import { isoToLocalInput, localInputToIso, periodoDe } from '../lib/fechas'
import { usePais } from '../lib/pais'
import type { Database, Llamada } from '../types/database.types'

type Update = Database['public']['Tables']['llamadas_bienvenida']['Update']
type Insert = Database['public']['Tables']['llamadas_bienvenida']['Insert']

const ESTATUS_FINAL = ['ACEPTACION', 'NO ACEPTACION']

interface Props {
  registro: Llamada | null // null = registro nuevo
  idCarga: string | null // carga a la que se liga un registro nuevo
  soloLectura: boolean
  modoDigitador?: boolean // el estatus final solo puede ser ACEPTACION o NO ACEPTACION y es obligatorio
  intentoId?: string | null // intento (CONTESTA) que originó esta apertura
  onClose: () => void
  onSaved: () => void
}

function valorInicial(r: Llamada | null, f: FieldDef, tz: string, modoDigitador: boolean): string {
  if (!r) return ''
  const v = r[f.key]
  if (v === null || v === undefined) return ''
  if (f.type === 'datetime') return isoToLocalInput(String(v), tz)
  if (modoDigitador && f.key === 'estatus_llamada' && !ESTATUS_FINAL.includes(String(v))) return ''
  return String(v)
}

export default function RegistroForm({ registro, idCarga, soloLectura, modoDigitador = false, intentoId = null, onClose, onSaved }: Props) {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const ini: Record<string, string> = {}
    for (const g of FIELD_GROUPS) for (const f of g.fields) ini[f.key] = valorInicial(registro, f, tz, modoDigitador)
    return ini
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [obligatorios, setObligatorios] = useState<Set<string>>(new Set())

  // Campos obligatorios definidos por el administrador para el país del registro
  useEffect(() => {
    sb.from('campos_formulario_config')
      .select('campo, obligatorio')
      .eq('id_pais', registro?.id_pais ?? pais.id)
      .eq('obligatorio', true)
      .then(({ data }) => setObligatorios(new Set((data ?? []).map((c) => c.campo))))
  }, [registro?.id_pais, pais.id])

  const cambia = (k: string, v: string) => setValores((p) => ({ ...p, [k]: v }))

  const esObligatorio = (f: FieldDef, grupoPide: boolean) =>
    !f.readOnly && (grupoPide || obligatorios.has(f.key) || (modoDigitador && f.key === 'estatus_llamada'))

  async function guardar() {
    setError('')
    const cliente = valores.cliente.trim()
    const solicitud = Number(valores.numero_solicitud)
    if (!cliente) return setError('CLIENTE es obligatorio.')
    if (!Number.isInteger(solicitud) || solicitud <= 0) return setError('NUMERO DE SOLICITUD debe ser un número entero positivo.')

    const faltan: string[] = []
    for (const g of FIELD_GROUPS) {
      const aplica = !g.aplicaA || esProducto(valores.tipo_credito, g.aplicaA)
      if (!aplica) continue
      const grupoPide = !!g.obligatorioEn && esProducto(valores.tipo_credito, g.obligatorioEn)
      for (const f of g.fields) if (esObligatorio(f, grupoPide) && !valores[f.key].trim()) faltan.push(f.caption ?? f.label)
    }
    if (faltan.length) return setError(`Campos obligatorios sin completar: ${faltan.join(' · ')}.`)

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
    const estatusFinal = (payload.estatus_llamada as string | null) ?? ''

    setGuardando(true)
    if (registro) {
      const res = await sb.from('llamadas_bienvenida').update(payload as Update).eq('id', registro.id)
      if (res.error) {
        setGuardando(false)
        return setError(res.error.message)
      }
      // el intento de esta llamada queda con el resultado final (ACEPTACION / NO ACEPTACION)
      if (intentoId && estatusFinal) await sb.rpc('actualizar_intento', { p_id: intentoId, p_estatus: estatusFinal })
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
      // un registro nuevo nace de una llamada contestada: primer intento y FECHA Y HORA
      const intento = await sb.rpc('registrar_intento', { p_id: res.data.id, p_resultado: 'CONTESTA' })
      const idNuevo = (intento.data as { id_intento?: string } | null)?.id_intento
      if (idNuevo && estatusFinal) await sb.rpc('actualizar_intento', { p_id: idNuevo, p_estatus: estatusFinal })
    }
    setGuardando(false)
    onSaved()
  }

  function campo(f: FieldDef, obligatorio: boolean) {
    const id = `f-${f.key}`
    const v = valores[f.key]
    const bloqueado = f.readOnly || (f.key === 'numero_solicitud' && !!registro)
    let control
    if (f.type === 'select') {
      const opciones = modoDigitador && f.key === 'estatus_llamada' ? ESTATUS_FINAL : f.options
      control = (
        <select id={id} value={v} onChange={(e) => cambia(f.key, e.target.value)}>
          <option value="">—</option>
          {opciones?.map((o) => <option key={o} value={o}>{o}</option>)}
          {v && !opciones?.includes(v) && <option value={v}>{v}</option>}
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
        <input
          id={id}
          type={tipo}
          value={f.key === 'num' && !registro ? '' : v}
          placeholder={f.key === 'num' ? 'Automático' : f.key === 'fecha_hora_llamada' ? 'Se registra con el primer intento' : ''}
          disabled={bloqueado}
          onChange={(e) => cambia(f.key, e.target.value)}
        />
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
            const grupoPide = !!g.obligatorioEn && esProducto(valores.tipo_credito, g.obligatorioEn)
            return (
              <section key={g.title} className={`tarjeta grupo${aplica ? '' : ' inactivo'}`}>
                <h3>
                  {g.title}
                  {origen === 'bitacora' && <span className="etiqueta-origen bitacora">Desde bitácora · editable</span>}
                  {origen === 'manual' && <span className="etiqueta-origen manual">Ingreso del usuario</span>}
                  {g.aplicaA && !aplica && <span className="etiqueta-origen bitacora">Solo aplica a créditos de tipo {g.aplicaA.toUpperCase()}</span>}
                  {grupoPide && <span className="etiqueta-origen obligatorio">Obligatorio para {g.obligatorioEn?.toUpperCase()}</span>}
                </h3>
                <fieldset className="sin-borde" disabled={!aplica}>
                  <div className="rejilla">{g.fields.map((f) => campo(f, aplica && esObligatorio(f, grupoPide)))}</div>
                </fieldset>
              </section>
            )
          })}
        </fieldset>
        <div className="panel-pie">
          {error && <div className="aviso error">{error}</div>}
          {soloLectura && <div className="aviso info">Solo lectura: tu puesto no permite modificar registros.</div>}
          <div className="espacio" />
          <button className="btn secundario" onClick={onClose}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>}
        </div>
      </div>
    </div>
  )
}
