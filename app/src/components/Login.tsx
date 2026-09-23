import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'registrar'>('entrar')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setCargando(true)
    if (modo === 'entrar') {
      const { error } = await sb.auth.signInWithPassword({ email, password: clave })
      if (error) setError('Correo o contraseña incorrectos.')
    } else {
      const { data, error } = await sb.auth.signUp({ email, password: clave })
      if (error) setError(error.message)
      else if (!data.session) setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
    }
    setCargando(false)
  }

  return (
    <div className="login-fondo">
      <form className="tarjeta login" onSubmit={enviar}>
        <h1>Llamada de Bienvenida</h1>
        <p>Riesgo Nicaragua · Instacredit</p>
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Contraseña
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required minLength={6} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
        </label>
        {error && <div className="aviso error">{error}</div>}
        {info && <div className="aviso ok">{info}</div>}
        <button className="btn" disabled={cargando}>{modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
        <button type="button" className="btn secundario" onClick={() => setModo(modo === 'entrar' ? 'registrar' : 'entrar')}>
          {modo === 'entrar' ? 'Crear cuenta nueva' : 'Ya tengo cuenta'}
        </button>
      </form>
    </div>
  )
}
