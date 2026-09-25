import { useState } from 'react'
import { sb } from '../lib/supabase'
import CampoClave from './CampoClave'

export default function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: clave })
    if (error) setError('Correo o contraseña incorrectos.')
    setCargando(false)
  }

  return (
    <div className="login-fondo">
      <form className="tarjeta login" onSubmit={enviar}>
        <h1>Llamada de Bienvenida</h1>
        <p>Riesgo Nicaragua · Instacredit</p>
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="usuario@instacredit.com" />
        </label>
        <label>
          Contraseña
          <CampoClave id="clave" value={clave} onChange={setClave} required minLength={6} autoComplete="current-password" />
        </label>
        {error && <div className="aviso error">{error}</div>}
        <button className="btn" disabled={cargando}>Entrar</button>
        <p style={{ fontSize: 12 }}>¿No tienes usuario? Pídelo a un administrador.</p>
      </form>
    </div>
  )
}
