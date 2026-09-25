import { useState } from 'react'
import { sb } from '../lib/supabase'
import CampoClave from './CampoClave'

// Pantalla obligatoria en el primer ingreso de un usuario creado por un administrador
export default function CambiarClave({ email, onListo, onSalir }: { email: string | undefined; onListo: () => void; onSalir: () => void }) {
  const [nueva, setNueva] = useState('')
  const [confirma, setConfirma] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (nueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (nueva !== confirma) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    const { error: e1 } = await sb.auth.updateUser({ password: nueva })
    if (e1) {
      setGuardando(false)
      return setError(e1.message)
    }
    await sb.rpc('clave_cambiada')
    setGuardando(false)
    onListo()
  }

  return (
    <div className="login-fondo">
      <form className="tarjeta login" onSubmit={enviar}>
        <h1>Cambia tu contraseña</h1>
        <p>{email ? `${email}: ` : ''}Es tu primer ingreso. Elige una contraseña personal para continuar.</p>
        <label>
          Nueva contraseña
          <CampoClave id="clave-nueva" value={nueva} onChange={setNueva} autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          Confirmar contraseña
          <CampoClave id="clave-confirma" value={confirma} onChange={setConfirma} autoComplete="new-password" minLength={8} required />
        </label>
        {error && <div className="aviso error">{error}</div>}
        <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar contraseña'}</button>
        <button type="button" className="btn secundario" onClick={onSalir}>Cerrar sesión</button>
      </form>
    </div>
  )
}
