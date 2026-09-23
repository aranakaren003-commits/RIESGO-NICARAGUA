import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './lib/supabase'
import { P, type Permisos } from './lib/permisos'
import type { PerfilUsuario } from './types/database.types'
import Login from './components/Login'
import Registros from './components/Registros'
import Graficas from './components/Graficas'
import Importar from './components/Importar'
import Administracion from './components/Administracion'

type Vista = 'registros' | 'graficas' | 'importar' | 'admin'

const VISTAS: { id: Vista; titulo: string; permiso: string; extra?: string }[] = [
  { id: 'registros', titulo: 'Registros', permiso: P.registrosVer },
  { id: 'graficas', titulo: 'Gráficas', permiso: P.graficasVer },
  { id: 'importar', titulo: 'Importar bitácora', permiso: P.bitacoraImportar },
  { id: 'admin', titulo: 'Administración', permiso: P.adminUsuarios },
]

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [listo, setListo] = useState(false)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [permisos, setPermisos] = useState<Permisos>(new Set())
  const [cargandoPerfil, setCargandoPerfil] = useState(false)
  const [vista, setVista] = useState<Vista | null>(null)

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
      setPermisos(new Set())
      return
    }
    setCargandoPerfil(true)
    Promise.all([sb.from('perfiles_usuario').select('*').eq('user_id', userId).maybeSingle(), sb.rpc('mis_permisos')]).then(([p, perm]) => {
      setPerfil(p.data)
      setPermisos(new Set(perm.data ?? []))
      setCargandoPerfil(false)
    })
  }, [userId])

  if (!listo) return <div className="vacio">Cargando…</div>
  if (!sesion) return <Login />
  if (cargandoPerfil) return <div className="vacio">Cargando…</div>

  const visibles = VISTAS.filter((v) => permisos.has(v.permiso))

  if (!perfil?.activo || visibles.length === 0) {
    return (
      <div className="login-fondo">
        <div className="tarjeta login">
          <h1>{perfil?.activo ? 'Sin accesos asignados' : 'Acceso pendiente'}</h1>
          <p>
            {perfil?.activo
              ? `Tu usuario (${sesion.user.email}) está activo pero su rol no tiene accesos. Pide a un administrador que revise tu rol.`
              : `Tu usuario (${sesion.user.email}) aún no está activado. Pide a un administrador que lo active.`}
          </p>
          <button className="btn secundario" onClick={() => sb.auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>
    )
  }

  const actual = visibles.find((v) => v.id === vista) ?? visibles[0]

  return (
    <>
      <header className="header">
        <div className="marca">
          Llamada de Bienvenida <span>· Riesgo Nicaragua</span>
        </div>
        <nav>
          {visibles.map((v) => (
            <button key={v.id} className={actual.id === v.id ? 'activo' : ''} onClick={() => setVista(v.id)}>{v.titulo}</button>
          ))}
        </nav>
        <div className="usuario">
          <span>{sesion.user.email}</span>
          <button className="btn claro" onClick={() => sb.auth.signOut()}>Salir</button>
        </div>
      </header>
      <main className="contenedor">
        {actual.id === 'registros' && <Registros permisos={permisos} />}
        {actual.id === 'graficas' && <Graficas />}
        {actual.id === 'importar' && <Importar />}
        {actual.id === 'admin' && <Administracion miId={sesion.user.id} />}
      </main>
    </>
  )
}
