import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { FIELD_GROUPS } from '../lib/fields'
import type { Pais, PerfilUsuario } from '../types/database.types'
import Bandera from './Bandera'

// El administrador define, por país, qué campos del formulario son obligatorios para el Digitador.
export default function AdminFormulario({ paises, miPerfil, onError }: { paises: Pais[]; miPerfil: PerfilUsuario; onError: (m: string) => void }) {
  const disponibles = miPerfil.id_pais ? paises.filter((p) => p.id === miPerfil.id_pais) : paises
  const [paisId, setPaisId] = useState(disponibles[0]?.id ?? '')
  const [obligatorios, setObligatorios] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    if (!paisId) return
    setCargando(true)
    const { data, error } = await sb.from('campos_formulario_config').select('campo, obligatorio').eq('id_pais', paisId)
    if (error) onError(error.message)
    setObligatorios(new Set((data ?? []).filter((c) => c.obligatorio).map((c) => c.campo)))
    setCargando(false)
  }, [paisId, onError])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function alternar(campo: string) {
    onError('')
    const nuevo = !obligatorios.has(campo)
    setObligatorios((prev) => {
      const n = new Set(prev)
      if (nuevo) n.add(campo)
      else n.delete(campo)
      return n
    })
    const { error } = await sb
      .from('campos_formulario_config')
      .upsert({ id_pais: paisId, campo, obligatorio: nuevo, actualizado_en: new Date().toISOString() }, { onConflict: 'id_pais,campo' })
    if (error) {
      onError(error.message)
      cargar()
    }
  }

  const pais = disponibles.find((p) => p.id === paisId)

  return (
    <>
      <div className="aviso info" style={{ marginBottom: 12 }}>
        Marca los campos que el Digitador debe completar para guardar el formulario. Los cambios se guardan al instante y aplican solo al país elegido. Las reglas propias del producto
        (Motocicleta solo para MOTO, Verificación obligatoria para PYMES) se mantienen. El ESTATUS DE LLAMADA final siempre es obligatorio para el Digitador.
      </div>
      <div className="barra">
        <label>
          País
          <select value={paisId} onChange={(e) => setPaisId(e.target.value)} disabled={disponibles.length <= 1}>
            {disponibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        {pais && <div style={{ alignSelf: 'end', paddingBottom: 8 }}><Bandera codigo={pais.codigo} alto={20} /></div>}
      </div>
      {cargando ? (
        <div className="vacio">Cargando…</div>
      ) : (
        FIELD_GROUPS.map((g) => {
          const editables = g.fields.filter((f) => !f.readOnly && !f.visibleSi && f.key !== 'estatus_llamada')
          if (editables.length === 0) return null
          return (
            <fieldset key={g.title} className="modulo-permisos tarjeta" style={{ padding: '8px 16px 12px', background: '#fff' }}>
              <legend>{g.title}</legend>
              {editables.map((f) => (
                <label key={f.key} className="permiso">
                  <input type="checkbox" checked={obligatorios.has(f.key)} onChange={() => alternar(f.key)} />
                  <span>{f.label}{f.caption && <small>{f.caption}</small>}</span>
                </label>
              ))}
            </fieldset>
          )
        })
      )}
    </>
  )
}
