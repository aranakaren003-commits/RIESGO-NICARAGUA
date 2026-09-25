import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './lib/supabase'
import { P, type Permisos } from './lib/permisos'
import { PaisContext, guardarPaisRegional, leerPaisRegional } from './lib/pais'
import type { Pais, PerfilUsuario } from './types/database.types'
import Login from './components/Login'
import Gestion from './components/Gestion'
import Registros from './components/Registros'
import Dashboard from './components/Graficas'
import Importar from './components/Importar'
import Intentos from './components/Intentos'
import Administracion from './components/Administracion'
import CambiarClave from './components/CambiarClave'
import Bandera from './components/Bandera'

type Vista = 'gestion' | 'registros' | 'dashboard' | 'intentos' | 'importar' | 'admin'

const VISTAS: { id: Vista; titulo: string; permiso: string }[] = [
  { id: 'gestion', titulo: 'Llamadas', permiso: P.gestionLlamadas },
  { id: 'registros', titulo: 'Registros', permiso: P.registrosVer },
  { id: 'dashboard', titulo: 'Dashboard', permiso: P.graficasVer },
  { id: 'intentos', titulo: 'Bitácora de intentos', permiso: P.intentosVer },
  { id: 'importar', titulo: 'Importar bitácora', permiso: P.bitacoraImportar },
  { id: 'admin', titulo: 'Administración', permiso: P.adminUsuarios },
]

function Bloqueo({ titulo, texto, onSalir }: { titulo: string; texto: string; onSalir: () => void }) {
  return (
    <div className="login-fondo">
      <div className="tarjeta login">
        <h1>{titulo}</h1>
        <p>{texto}</p>
        <button className="btn secundario" onClick={onSalir}>Cerrar sesión</button>
      </div>
    </div>
  )
}

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [listo, setListo] = useState(false)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [permisos, setPermisos] = useState<Permisos>(new Set())
  const [paises, setPaises] = useState<Pais[]>([])
  const [cargandoPerfil, setCargandoPerfil] = useState(false)
  const [vista, setVista] = useState<Vista | null>(null)
  const [paisRegionalId, setPaisRegionalId] = useState<string | null>(leerPaisRegional())

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

  const salir = () => sb.auth.signOut()

  if (!listo) return <div className="vacio">Cargando…</div>
  if (!sesion) return <Login />
  if (cargandoPerfil) return <div className="vacio">Cargando…</div>

  if (perfil?.debe_cambiar_clave) {
    return <CambiarClave email={sesion.user.email} onListo={() => setPerfil({ ...perfil, debe_cambiar_clave: false })} onSalir={salir} />
  }

  const visibles = VISTAS.filter((v) => permisos.has(v.permiso))
  if (!perfil?.activo || visibles.length === 0) {
    return (
      <Bloqueo
        titulo={perfil?.activo ? 'Sin accesos asignados' : 'Acceso pendiente'}
        texto={
          perfil?.activo
            ? `Tu usuario (${sesion.user.email}) está activo pero su puesto no tiene accesos. Pide a un administrador que lo revise.`
            : `Tu usuario (${sesion.user.email}) no está activo. Pide a un administrador que lo active.`
        }
        onSalir={salir}
      />
    )
  }

  // País: un perfil de país queda fijo en el suyo; un perfil regional elige entre las pestañas de país.
  const esRegional = perfil.id_pais === null
  const pais = esRegional ? (paises.find((p) => p.id === paisRegionalId) ?? paises[0]) : paises.find((p) => p.id === perfil.id_pais)
  if (!pais) {
    return <Bloqueo titulo="Sin país disponible" texto="El país asignado a tu usuario no está disponible. Pide a un administrador que lo revise." onSalir={salir} />
  }

  const actual = visibles.find((v) => v.id === vista) ?? visibles[0]
  const mostrarPestanasPais = esRegional && actual.id !== 'admin' && paises.length > 0

  return (
    <PaisContext.Provider
      value={{
        pais,
        paises: esRegional ? paises : [pais],
        esRegional,
        elegirPais: (id) => {
          guardarPaisRegional(id)
          setPaisRegionalId(id)
        },
      }}
    >
      <header className="header">
        <div className="marca">
          <span className="marca-pais">
            {!esRegional && <Bandera codigo={pais.codigo} alto={20} />}
            <span>Llamada de Bienvenida <span className="suave">· {esRegional ? 'Regional' : pais.nombre}</span></span>
          </span>
        </div>
        <nav>
          {visibles.map((v) => (
            <button key={v.id} className={actual.id === v.id ? 'activo' : ''} onClick={() => setVista(v.id)}>{v.titulo}</button>
          ))}
        </nav>
        <div className="usuario">
          <span>{sesion.user.email}</span>
          <button className="btn claro" onClick={salir}>Salir</button>
        </div>
      </header>
      {mostrarPestanasPais && (
        <div className="pestanas-pais" role="tablist" aria-label="País">
          {paises.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === pais.id}
              className={p.id === pais.id ? 'activo' : ''}
              onClick={() => {
                guardarPaisRegional(p.id)
                setPaisRegionalId(p.id)
              }}
            >
              <Bandera codigo={p.codigo} alto={16} /> {p.nombre}
            </button>
          ))}
        </div>
      )}
      <main className="contenedor">
        {/* key = país: al cambiar de país se reinician filtros y datos */}
        {actual.id === 'gestion' && <Gestion key={pais.id} />}
        {actual.id === 'registros' && <Registros key={pais.id} permisos={permisos} />}
        {actual.id === 'dashboard' && <Dashboard key={pais.id} permisos={permisos} />}
        {actual.id === 'intentos' && <Intentos key={pais.id} />}
        {actual.id === 'importar' && <Importar key={pais.id} />}
        {actual.id === 'admin' && <Administracion miId={sesion.user.id} miPerfil={perfil} permisos={permisos} onPaisesCambiaron={cargarPaises} />}
      </main>
    </PaisContext.Provider>
  )
}
