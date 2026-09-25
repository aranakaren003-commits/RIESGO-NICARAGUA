import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './lib/supabase'
import { P, type Permisos } from './lib/permisos'
import { PaisContext, guardarPais, leerPaisGuardado } from './lib/pais'
import type { Pais, PerfilUsuario } from './types/database.types'
import Login from './components/Login'
import Registros from './components/Registros'
import Graficas from './components/Graficas'
import Importar from './components/Importar'
import Intentos from './components/Intentos'
import Administracion from './components/Administracion'
import SeleccionPais from './components/SeleccionPais'
import CambiarClave from './components/CambiarClave'

type Vista = 'registros' | 'graficas' | 'intentos' | 'importar' | 'admin'

const VISTAS: { id: Vista; titulo: string; permiso: string }[] = [
  { id: 'registros', titulo: 'Registros', permiso: P.registrosVer },
  { id: 'graficas', titulo: 'Gráficas', permiso: P.graficasVer },
  { id: 'intentos', titulo: 'Bitácora de intentos', permiso: P.intentosVer },
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
  const [paises, setPaises] = useState<Pais[]>([])
  const [paisId, setPaisId] = useState<string | null>(leerPaisGuardado())

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setListo(true)
    })
    const { data } = sb.auth.onAuthStateChange((_evento, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const cargarPaises = useCallback(async () => {
    const { data } = await sb.from('paises').select('*').eq('activo', true).order('nombre', { ascending: true })
    setPaises(data ?? [])
  }, [])

  const userId = sesion?.user.id
  useEffect(() => {
    if (!userId) {
      setPerfil(null)
      setPermisos(new Set())
      return
    }
    setCargandoPerfil(true)
    Promise.all([sb.from('perfiles_usuario').select('*').eq('user_id', userId).maybeSingle(), sb.rpc('mis_permisos'), cargarPaises()]).then(([p, perm]) => {
      setPerfil(p.data)
      setPermisos(new Set(perm.data ?? []))
      setCargandoPerfil(false)
    })
  }, [userId, cargarPaises])

  if (!listo) return <div className="vacio">Cargando…</div>
  if (!sesion) return <Login />
  if (cargandoPerfil) return <div className="vacio">Cargando…</div>

  if (perfil?.debe_cambiar_clave) {
    return <CambiarClave email={sesion.user.email} onListo={() => setPerfil({ ...perfil, debe_cambiar_clave: false })} onSalir={() => sb.auth.signOut()} />
  }

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

  const pais = paises.find((p) => p.id === paisId)
  if (!pais) {
    return (
      <SeleccionPais
        paises={paises}
        email={sesion.user.email}
        onElegir={(p) => {
          guardarPais(p.id)
          setPaisId(p.id)
          setVista(null)
        }}
        onSalir={() => sb.auth.signOut()}
      />
    )
  }

  const actual = visibles.find((v) => v.id === vista) ?? visibles[0]

  return (
    <PaisContext.Provider
      value={{
        pais,
        cambiarPais: () => {
          guardarPais(null)
          setPaisId(null)
        },
      }}
    >
      <header className="header">
        <div className="marca">
          Llamada de Bienvenida <span>· {pais.nombre}</span>
        </div>
        <nav>
          {visibles.map((v) => (
            <button key={v.id} className={actual.id === v.id ? 'activo' : ''} onClick={() => setVista(v.id)}>{v.titulo}</button>
          ))}
        </nav>
        <div className="usuario">
          <span>{sesion.user.email}</span>
          <button
            className="btn claro"
            onClick={() => {
              guardarPais(null)
              setPaisId(null)
            }}
          >
            Cambiar país
          </button>
          <button className="btn claro" onClick={() => sb.auth.signOut()}>Salir</button>
        </div>
      </header>
      <main className="contenedor">
        {/* key = país: al cambiar de país se reinician filtros y datos */}
        {actual.id === 'registros' && <Registros key={pais.id} permisos={permisos} />}
        {actual.id === 'graficas' && <Graficas key={pais.id} />}
        {actual.id === 'intentos' && <Intentos key={pais.id} />}
        {actual.id === 'importar' && <Importar key={pais.id} />}
        {actual.id === 'admin' && <Administracion miId={sesion.user.id} onPaisesCambiaron={cargarPaises} />}
      </main>
    </PaisContext.Provider>
  )
}
