import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'registrar'>('entrar')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
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
          <div className="clave-envoltorio">
            <input type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} required minLength={6} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
            <button type="button" className="ojo" onClick={() => setVerClave(!verClave)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {verClave ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
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
