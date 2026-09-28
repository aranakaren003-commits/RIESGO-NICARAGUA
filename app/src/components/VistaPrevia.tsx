import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import type { Rol } from '../types/database.types'

export default function VistaPrevia({ onActivar }: { onActivar: (rol: Rol) => void }) {
  const [roles, setRoles] = useState<Rol[]>([])
  const [rolId, setRolId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    sb.from('roles')
      .select('*')
      .neq('nombre', 'Sin acceso')
      .order('nombre', { ascending: true })
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        setRoles(data ?? [])
        setRolId(data?.[0]?.id ?? '')
      })
  }, [])

  return (
    <div className="tarjeta grupo" style={{ maxWidth: 620 }}>
      <h3>Vista de prueba</h3>
      <p style={{ marginTop: 0 }}>
        Muestra el menú tal como lo vería un puesto elegido, para revisar que sus accesos estén bien configurados. Es solo una simulación del menú: los
        datos que verás siguen leyéndose con tus propios permisos reales de administrador, no con los del puesto elegido.
      </p>
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="barra" style={{ marginBottom: 0 }}>
        <label>
          Puesto
          <select value={rolId} onChange={(e) => setRolId(e.target.value)} style={{ minWidth: 220 }}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
        <button className="btn" disabled={!rolId} onClick={() => { const r = roles.find((x) => x.id === rolId); if (r) onActivar(r) }}>
          Entrar en modo de prueba
        </button>
      </div>
    </div>
  )
}
