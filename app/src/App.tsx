import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './lib/supabase'
import type { PerfilUsuario } from './types/database.types'
import Login from './components/Login'
import Registros from './components/Registros'
import Graficas from './components/Graficas'
import Importar from './components/Importar'

type Vista = 'registros' | 'graficas' | 'importar'

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [listo, setListo] = useState(false)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cargandoPerfil, setCargandoPerfil] = useState(false)
  const [vista, setVista] = useState<Vista>('registros')

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setListo(true)
    })
    const { data } = sb.auth.onAuthStateChange((_evento, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sesion?.user.id
  useEffect(() => {
    if (!userId) {
      setPerfil(null)
      return
    }
    setCargandoPerfil(true)
    sb.from('perfiles_usuario')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setPerfil(data)
        setCargandoPerfil(false)
      })
  }, [userId])

  if (!listo) return <div className="vacio">Cargando…</div>
  if (!sesion) return <Login />
  if (cargandoPerfil) return <div className="vacio">Cargando…</div>

  if (!perfil?.activo) {
    return (
      <div className="login-fondo">
        <div className="tarjeta login">
          <h1>Acceso pendiente</h1>
          <p>Tu usuario ({sesion.user.email}) aún no está activado. Pide a un administrador que lo active.</p>
          <button className="btn secundario" onClick={() => sb.auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="header">
        <div className="marca">
          Llamada de Bienvenida <span>· Riesgo Nicaragua</span>
        </div>
        <nav>
          <button className={vista === 'registros' ? 'activo' : ''} onClick={() => setVista('registros')}>Registros</button>
          <button className={vista === 'graficas' ? 'activo' : ''} onClick={() => setVista('graficas')}>Gráficas</button>
          <button className={vista === 'importar' ? 'activo' : ''} onClick={() => setVista('importar')}>Importar bitácora</button>
        </nav>
        <div className="usuario">
          <span>{sesion.user.email}</span>
          <button className="btn claro" onClick={() => sb.auth.signOut()}>Salir</button>
        </div>
      </header>
      <main className="contenedor">
        {vista === 'registros' && <Registros />}
        {vista === 'graficas' && <Graficas />}
        {vista === 'importar' && <Importar />}
      </main>
    </>
  )
}
