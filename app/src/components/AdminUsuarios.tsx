import { useState } from 'react'
import { sb } from '../lib/supabase'
import type { Pais, PerfilUsuario, Rol } from '../types/database.types'
import type { DatosAdmin } from './Administracion'
import Bandera from './Bandera'
import CampoClave from './CampoClave'

const DOMINIO = '@instacredit.com'

function generarClave(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(bytes, (b) => letras[b % letras.length]).join('') + '#7'
}

// Llama a la función de administración de usuarios. Devuelve el mensaje de error, o null si salió bien.
async function invocarAdmin(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await sb.functions.invoke('crear-usuario', { body })
  if (error) {
    let detalle = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        detalle = ((await ctx.json()) as { error?: string }).error ?? detalle
      } catch {
        // se deja el mensaje genérico
      }
    }
    return detalle
  }
  return (data as { error?: string } | null)?.error ?? null
}

interface Props {
  datos: DatosAdmin
  miId: string
  miPerfil: PerfilUsuario
  onCambio: () => void
  onError: (m: string) => void
}

// Selector de país según el alcance del puesto elegido. Devuelve el país a guardar y qué mostrar.
function usePaisPorRol(rol: Rol | undefined, esRegionalAdmin: boolean, miPais: string | null) {
  const ambito = rol?.ambito
  const lleva = ambito === 'pais' || ambito === 'ambos'
  const obligatorio = ambito === 'pais'
  const fijo = !esRegionalAdmin ? miPais : null // un administrador de país solo asigna su país
  return { lleva, obligatorio, fijo }
}

export default function AdminUsuarios({ datos, miId, miPerfil, onCambio, onError }: Props) {
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [verEliminados, setVerEliminados] = useState(false)
  const [modal, setModal] = useState<'modificar' | 'restablecer' | null>(null)

  const rolDe = (id: string) => datos.roles.find((r) => r.id === id)
  const paisDe = (id: string | null) => datos.paises.find((p) => p.id === id)
  const perfil = datos.perfiles.find((p) => p.user_id === seleccionado) ?? null
  const soyYo = perfil?.user_id === miId
  const visibles = datos.perfiles.filter((p) => verEliminados || !p.eliminado_en)
  const eliminados = datos.perfiles.filter((p) => p.eliminado_en).length

  async function eliminar() {
    if (!perfil) return
    if (!window.confirm(`¿Eliminar a ${perfil.nombre ?? perfil.email}? Se le quita el acceso, pero puedes revertirlo después.`)) return
    onError('')
    const { error } = await sb.from('perfiles_usuario').update({ activo: false, eliminado_en: new Date().toISOString() }).eq('user_id', perfil.user_id)
    if (error) return onError(error.message)
    onCambio()
  }

  async function revertir() {
    if (!perfil) return
    if (!window.confirm(`¿Revertir el último cambio del perfil de ${perfil.nombre ?? perfil.email}? Volverá a su estado anterior (puesto, país, estado).`)) return
    onError('')
    const { error } = await sb.rpc('revertir_perfil', { p_user: perfil.user_id })
    if (error) return onError(error.message)
    onCambio()
  }

  return (
    <>
      <NuevoUsuario datos={datos} miPerfil={miPerfil} onCreado={onCambio} />

      <div className="tarjeta">
        <div className="barra-acciones">
          <strong>{perfil ? (perfil.nombre ?? perfil.email) : 'Selecciona un usuario con la casilla para actuar sobre su perfil'}</strong>
          <div className="espacio" />
          <button className="btn secundario" disabled={!perfil || soyYo || !!perfil.eliminado_en} onClick={() => setModal('modificar')}>Modificar</button>
          <button className="btn secundario" disabled={!perfil || soyYo || !!perfil.eliminado_en} onClick={() => setModal('restablecer')}>Restablecer contraseña</button>
          <button className="btn secundario" disabled={!perfil || soyYo} onClick={revertir} title="Deshace el último cambio del perfil (incluida una eliminación)">Revertir cambio anterior</button>
          <button className="btn peligro" disabled={!perfil || soyYo || !!perfil.eliminado_en} onClick={eliminar}>Eliminar</button>
        </div>
        <div className="tabla-envoltorio">
          <table className="sin-clic">
            <thead>
              <tr>
                <th></th>
                <th>Nombre</th>
                <th>Puesto</th>
                <th>País</th>
                <th>Correo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const pais = paisDe(p.id_pais)
                return (
                  <tr key={p.user_id} className={p.user_id === seleccionado ? 'fila-elegida' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.user_id === seleccionado}
                        onChange={() => setSeleccionado(p.user_id === seleccionado ? null : p.user_id)}
                        aria-label={`Seleccionar a ${p.nombre ?? p.email}`}
                      />
                    </td>
                    <td>{p.nombre}{p.user_id === miId && <span className="chip neutro" style={{ marginLeft: 8 }}>Tú</span>}</td>
                    <td>{rolDe(p.id_rol)?.nombre}</td>
                    <td>
                      {pais ? (
                        <span className="pais-celda"><Bandera codigo={pais.codigo} alto={14} /> {pais.nombre}</span>
                      ) : (
                        <span className="chip neutro">Regional</span>
                      )}
                    </td>
                    <td>{p.email}</td>
                    <td>
                      {p.eliminado_en ? <span className="chip mal">Eliminado</span> : p.activo ? <span className="chip ok">Activo</span> : <span className="chip">Inactivo</span>}
                      {p.debe_cambiar_clave && !p.eliminado_en && <span className="chip mal" style={{ marginLeft: 6 }} title="Debe cambiar la contraseña en su próximo ingreso">Cambio de clave pendiente</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pie">
          <span>{visibles.length} usuario(s)</span>
          <div className="espacio" />
          {eliminados > 0 && (
            <label className="interruptor">
              <input type="checkbox" checked={verEliminados} onChange={(e) => setVerEliminados(e.target.checked)} />
              Mostrar eliminados ({eliminados})
            </label>
          )}
        </div>
      </div>

      {modal === 'modificar' && perfil && (
        <ModificarUsuario
          perfil={perfil}
          datos={datos}
          miPerfil={miPerfil}
          onCerrar={(cambio) => {
            setModal(null)
            if (cambio) onCambio()
          }}
        />
      )}
      {modal === 'restablecer' && perfil && (
        <RestablecerClave
          perfil={perfil}
          onCerrar={() => {
            setModal(null)
            onCambio()
          }}
        />
      )}
    </>
  )
}

function SelectorPais({ paises, valor, onChange, obligatorio, fijo, id }: { paises: Pais[]; valor: string; onChange: (v: string) => void; obligatorio: boolean; fijo: string | null; id: string }) {
  const opciones = fijo ? paises.filter((p) => p.id === fijo) : paises
  return (
    <select id={id} value={fijo ?? valor} onChange={(e) => onChange(e.target.value)} disabled={!!fijo} required={obligatorio}>
      {!fijo && <option value="">{obligatorio ? 'Selecciona un país' : 'Regional (sin país)'}</option>}
      {opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  )
}

function NuevoUsuario({ datos, miPerfil, onCreado }: { datos: DatosAdmin; miPerfil: PerfilUsuario; onCreado: () => void }) {
  const esRegionalAdmin = miPerfil.id_pais === null
  // Un administrador de país no puede crear perfiles regionales; nadie crea usuarios «Sin acceso»
  const roles = datos.roles.filter((r) => r.nombre !== 'Sin acceso' && (esRegionalAdmin || r.ambito !== 'regional'))
  const paises = datos.paises.filter((p) => p.activo)

  const [nombre, setNombre] = useState('')
  const [idRol, setIdRol] = useState('')
  const [idPais, setIdPais] = useState('')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [creado, setCreado] = useState<{ email: string; clave: string } | null>(null)

  const rol = roles.find((r) => r.id === idRol)
  const { lleva, obligatorio, fijo } = usePaisPorRol(rol, esRegionalAdmin, miPerfil.id_pais)

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreado(null)
    const local = usuario.trim().toLowerCase().replace(/@.*$/, '')
    if (!nombre.trim()) return setError('El nombre es obligatorio.')
    if (!rol) return setError('Selecciona el puesto.')
    if (!/^[a-z0-9._%+-]+$/.test(local)) return setError('El usuario del correo solo puede llevar letras, números y . _ % + -')
    if (clave.length < 8) return setError('La contraseña temporal debe tener al menos 8 caracteres.')
    const paisFinal = lleva ? (fijo ?? idPais) : ''
    if (obligatorio && !paisFinal) return setError(`El puesto «${rol.nombre}» requiere un país.`)
    const email = `${local}${DOMINIO}`

    setGuardando(true)
    const fallo = await invocarAdmin({ accion: 'crear', email, nombre: nombre.trim(), id_rol: idRol, id_pais: paisFinal || null, password: clave })
    setGuardando(false)
    if (fallo) return setError(fallo)
    setCreado({ email, clave })
    setNombre('')
    setUsuario('')
    setClave('')
    onCreado()
  }

  return (
    <form className="tarjeta grupo" style={{ marginBottom: 16 }} onSubmit={crear}>
      <h3>Nuevo usuario <span className="etiqueta-origen manual">Solo correos {DOMINIO}</span></h3>
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="nu-nombre">Nombre</label>
          <input id="nu-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" autoComplete="off" required />
        </div>
        <div className="campo">
          <label htmlFor="nu-rol">Puesto</label>
          <select id="nu-rol" value={idRol} onChange={(e) => setIdRol(e.target.value)} required>
            <option value="">Selecciona un puesto</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </div>
        {lleva && (
          <div className="campo">
            <label htmlFor="nu-pais">País{obligatorio && <span className="req"> *</span>}</label>
            <SelectorPais id="nu-pais" paises={paises} valor={idPais} onChange={setIdPais} obligatorio={obligatorio} fijo={fijo} />
          </div>
        )}
        {rol?.ambito === 'regional' && (
          <div className="campo">
            <label>País</label>
            <div className="chip neutro" style={{ alignSelf: 'flex-start' }}>Puesto regional: ve todos los países</div>
          </div>
        )}
        <div className="campo">
          <label htmlFor="nu-correo">Correo</label>
          <div className="correo-dominio">
            <input id="nu-correo" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="nombre.apellido" autoComplete="off" required />
            <span>{DOMINIO}</span>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="nu-clave">Contraseña temporal</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><CampoClave id="nu-clave" value={clave} onChange={setClave} autoComplete="new-password" minLength={8} required /></div>
            <button type="button" className="btn secundario" onClick={() => setClave(generarClave())}>Generar</button>
          </div>
        </div>
      </div>
      <div className="aviso info" style={{ margin: '12px 0' }}>
        El usuario se crea activo y con el correo ya confirmado. En su primer ingreso el sistema le pedirá cambiar esta contraseña. Compártesela por un canal seguro.
      </div>
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {creado && (
        <div className="aviso ok" style={{ marginBottom: 12 }}>
          Usuario creado: <strong>{creado.email}</strong>. Contraseña temporal: <strong>{creado.clave}</strong> (cópiala ahora; no se vuelve a mostrar).
        </div>
      )}
      <button className="btn" disabled={guardando}>{guardando ? 'Creando…' : 'Crear usuario'}</button>
    </form>
  )
}

function ModificarUsuario({ perfil, datos, miPerfil, onCerrar }: { perfil: PerfilUsuario; datos: DatosAdmin; miPerfil: PerfilUsuario; onCerrar: (cambio: boolean) => void }) {
  const esRegionalAdmin = miPerfil.id_pais === null
  const roles = datos.roles.filter((r) => esRegionalAdmin || r.ambito !== 'regional')
  const paises = datos.paises.filter((p) => p.activo || p.id === perfil.id_pais)

  const [nombre, setNombre] = useState(perfil.nombre ?? '')
  const [idRol, setIdRol] = useState(perfil.id_rol)
  const [idPais, setIdPais] = useState(perfil.id_pais ?? '')
  const [activo, setActivo] = useState(perfil.activo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const rol = roles.find((r) => r.id === idRol)
  const { lleva, obligatorio, fijo } = usePaisPorRol(rol, esRegionalAdmin, miPerfil.id_pais)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('El nombre es obligatorio.')
    const paisFinal = lleva ? (fijo ?? idPais) : ''
    if (obligatorio && !paisFinal) return setError(`El puesto «${rol?.nombre}» requiere un país.`)
    setGuardando(true)
    const { error } = await sb
      .from('perfiles_usuario')
      .update({ nombre: nombre.trim(), id_rol: idRol, id_pais: paisFinal || null, activo })
      .eq('user_id', perfil.user_id)
    setGuardando(false)
    if (error) return setError(error.message)
    onCerrar(true)
  }

  return (
    <div className="velo centrado" onMouseDown={(e) => e.target === e.currentTarget && onCerrar(false)}>
      <form className="tarjeta grupo modal" onSubmit={guardar} role="dialog" aria-modal="true">
        <h3>Modificar usuario</h3>
        <p style={{ margin: '0 0 12px' }}>{perfil.email}</p>
        <div className="rejilla" style={{ gridTemplateColumns: '1fr', marginBottom: 12 }}>
          <div className="campo">
            <label htmlFor="mu-nombre">Nombre</label>
            <input id="mu-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor="mu-rol">Puesto</label>
            <select id="mu-rol" value={idRol} onChange={(e) => setIdRol(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          {lleva && (
            <div className="campo">
              <label htmlFor="mu-pais">País{obligatorio && <span className="req"> *</span>}</label>
              <SelectorPais id="mu-pais" paises={paises} valor={idPais} onChange={setIdPais} obligatorio={obligatorio} fijo={fijo} />
            </div>
          )}
          {rol?.ambito === 'regional' && <div className="chip neutro" style={{ alignSelf: 'flex-start' }}>Puesto regional: ve todos los países</div>}
          <label className="interruptor">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Usuario activo
          </label>
        </div>
        <div className="aviso info" style={{ marginBottom: 12 }}>Puedes deshacer este cambio después con «Revertir cambio anterior».</div>
        {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="barra" style={{ marginBottom: 0 }}>
          <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
          <button type="button" className="btn secundario" onClick={() => onCerrar(false)}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function RestablecerClave({ perfil, onCerrar }: { perfil: PerfilUsuario; onCerrar: () => void }) {
  const [clave, setClave] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (clave.length < 8) return setError('La contraseña temporal debe tener al menos 8 caracteres.')
    setGuardando(true)
    const fallo = await invocarAdmin({ accion: 'restablecer', user_id: perfil.user_id, password: clave })
    setGuardando(false)
    if (fallo) return setError(fallo)
    setListo(clave)
  }

  return (
    <div className="velo centrado" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="tarjeta grupo modal" onSubmit={enviar} role="dialog" aria-modal="true">
        <h3>Restablecer contraseña</h3>
        <p style={{ margin: '0 0 12px' }}>{perfil.email}{perfil.nombre ? ` · ${perfil.nombre}` : ''}</p>
        {listo ? (
          <>
            <div className="aviso ok" style={{ marginBottom: 12 }}>
              Contraseña restablecida. Contraseña temporal: <strong>{listo}</strong> (cópiala ahora; no se vuelve a mostrar). En su próximo ingreso deberá cambiarla.
            </div>
            <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
          </>
        ) : (
          <>
            <div className="campo" style={{ marginBottom: 12 }}>
              <label htmlFor="rc-clave">Contraseña temporal nueva</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><CampoClave id="rc-clave" value={clave} onChange={setClave} autoComplete="new-password" minLength={8} required /></div>
                <button type="button" className="btn secundario" onClick={() => setClave(generarClave())}>Generar</button>
              </div>
            </div>
            <div className="aviso info" style={{ marginBottom: 12 }}>La contraseña anterior deja de servir y el usuario deberá cambiar esta en su próximo ingreso.</div>
            {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
            <div className="barra" style={{ marginBottom: 0 }}>
              <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Restablecer'}</button>
              <button type="button" className="btn secundario" onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
