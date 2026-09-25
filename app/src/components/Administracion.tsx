import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { zonaValida } from '../lib/fechas'
import type { Pais, PerfilUsuario, Permiso, Rol, RolPermiso } from '../types/database.types'

interface Datos {
  perfiles: PerfilUsuario[]
  roles: Rol[]
  permisos: Permiso[]
  rolesPermisos: RolPermiso[]
}

const ZONAS_SUGERIDAS = [
  'America/Managua', 'America/Panama', 'America/El_Salvador', 'America/Costa_Rica', 'America/Guatemala', 'America/Tegucigalpa',
  'America/Bogota', 'America/Mexico_City', 'America/Santo_Domingo', 'America/Lima', 'America/Guayaquil', 'America/Caracas',
]

export default function Administracion({ miId, onPaisesCambiaron }: { miId: string; onPaisesCambiaron: () => void }) {
  const [pestana, setPestana] = useState<'usuarios' | 'roles' | 'paises'>('usuarios')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [p, r, pe, rp] = await Promise.all([
      sb.from('perfiles_usuario').select('*').order('creado_en', { ascending: true }),
      sb.from('roles').select('*').order('nombre', { ascending: true }),
      sb.from('permisos').select('*').order('modulo', { ascending: true }),
      sb.from('roles_permisos').select('*'),
    ])
    const fallo = p.error ?? r.error ?? pe.error ?? rp.error
    if (fallo) return setError(fallo.message)
    setError('')
    setDatos({ perfiles: p.data ?? [], roles: r.data ?? [], permisos: pe.data ?? [], rolesPermisos: rp.data ?? [] })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <>
      <div className="barra">
        <div className="pestanas">
          <button className={pestana === 'usuarios' ? 'activo' : ''} onClick={() => setPestana('usuarios')}>Usuarios</button>
          <button className={pestana === 'roles' ? 'activo' : ''} onClick={() => setPestana('roles')}>Roles y accesos</button>
          <button className={pestana === 'paises' ? 'activo' : ''} onClick={() => setPestana('paises')}>Países</button>
        </div>
      </div>
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      {pestana === 'paises' ? (
        <Paises onError={setError} onCambio={onPaisesCambiaron} />
      ) : !datos ? (
        <div className="vacio">Cargando…</div>
      ) : pestana === 'usuarios' ? (
        <Usuarios datos={datos} miId={miId} onCambio={cargar} onError={setError} />
      ) : (
        <Roles datos={datos} onCambio={cargar} onError={setError} />
      )}
    </>
  )
}

function Paises({ onError, onCambio }: { onError: (m: string) => void; onCambio: () => void }) {
  const [paises, setPaises] = useState<Pais[]>([])
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [zona, setZona] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await sb.from('paises').select('*').order('nombre', { ascending: true })
    if (error) return onError(error.message)
    setPaises(data ?? [])
  }, [onError])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function agregar() {
    onError('')
    const c = codigo.trim().toUpperCase()
    const n = nombre.trim()
    const z = zona.trim()
    if (!/^[A-Z]{2,3}$/.test(c)) return onError('El código debe tener 2 o 3 letras (por ejemplo GT).')
    if (!n) return onError('El nombre es obligatorio.')
    if (!zonaValida(z)) return onError('La zona horaria no es válida. Usa un nombre IANA, por ejemplo America/Guatemala.')
    setGuardando(true)
    const { error } = await sb.from('paises').insert({ codigo: c, nombre: n, zona_horaria: z })
    setGuardando(false)
    if (error) return onError(error.code === '23505' ? 'Ya existe un país con ese código o nombre.' : error.message)
    setCodigo('')
    setNombre('')
    setZona('')
    await cargar()
    onCambio()
  }

  async function alternar(p: Pais) {
    const { error } = await sb.from('paises').update({ activo: !p.activo }).eq('id', p.id)
    if (error) return onError(error.message)
    await cargar()
    onCambio()
  }

  return (
    <>
      <div className="aviso info" style={{ marginBottom: 12 }}>
        Cada país tiene sus propios registros y cargas de la bitácora, y usa su zona horaria para mostrar fechas y horas. Un país inactivo deja de aparecer en la pantalla inicial, pero conserva su información.
      </div>
      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table className="sin-clic">
            <thead>
              <tr><th>Código</th><th>País</th><th>Zona horaria</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {paises.map((p) => (
                <tr key={p.id}>
                  <td>{p.codigo}</td>
                  <td>{p.nombre}</td>
                  <td>{p.zona_horaria}</td>
                  <td>
                    <label className="interruptor">
                      <input type="checkbox" checked={p.activo} onChange={() => alternar(p)} />
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="tarjeta grupo" style={{ marginTop: 16 }}>
        <h3>Agregar país</h3>
        <div className="rejilla" style={{ gridTemplateColumns: '120px 1fr 1fr auto', alignItems: 'end' }}>
          <div className="campo">
            <label htmlFor="pais-cod">Código</label>
            <input id="pais-cod" value={codigo} maxLength={3} placeholder="GT" onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="pais-nom">Nombre</label>
            <input id="pais-nom" value={nombre} placeholder="Guatemala" onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="pais-zona">Zona horaria</label>
            <input id="pais-zona" list="zonas-sugeridas" value={zona} placeholder="America/Guatemala" onChange={(e) => setZona(e.target.value)} />
            <datalist id="zonas-sugeridas">{ZONAS_SUGERIDAS.map((z) => <option key={z} value={z} />)}</datalist>
          </div>
          <button className="btn" onClick={agregar} disabled={guardando}>Agregar</button>
        </div>
      </div>
    </>
  )
}

function Usuarios({ datos, miId, onCambio, onError }: { datos: Datos; miId: string; onCambio: () => void; onError: (m: string) => void }) {
  async function actualizar(userId: string, cambios: Partial<Pick<PerfilUsuario, 'nombre' | 'id_rol' | 'activo'>>) {
    const { error } = await sb.from('perfiles_usuario').update(cambios).eq('user_id', userId)
    if (error) onError(error.message)
    await onCambio()
  }

  const pendientes = datos.perfiles.filter((p) => !p.activo).length

  return (
    <>
      <div className="aviso info" style={{ marginBottom: 12 }}>
        Los usuarios se crean solos al registrarse desde la pantalla de acceso («Crear cuenta nueva»). Quedan <strong>inactivos</strong> con el rol «Consulta» hasta que
        aquí los actives y les asignes su rol. {pendientes > 0 && <strong>Pendientes de activar: {pendientes}.</strong>}
      </div>
      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table className="sin-clic">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Activo</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {datos.perfiles.map((p) => {
                const soyYo = p.user_id === miId
                return (
                  <tr key={p.user_id}>
                    <td>{p.email}{soyYo && <span className="chip neutro" style={{ marginLeft: 8 }}>Tú</span>}</td>
                    <td>
                      <input
                        defaultValue={p.nombre ?? ''}
                        placeholder="Nombre"
                        disabled={soyYo}
                        onBlur={(e) => e.target.value.trim() !== (p.nombre ?? '') && actualizar(p.user_id, { nombre: e.target.value.trim() || null })}
                      />
                    </td>
                    <td>
                      <select value={p.id_rol} disabled={soyYo} onChange={(e) => actualizar(p.user_id, { id_rol: e.target.value })}>
                        {datos.roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    </td>
                    <td>
                      <label className="interruptor">
                        <input type="checkbox" checked={p.activo} disabled={soyYo} onChange={(e) => actualizar(p.user_id, { activo: e.target.checked })} />
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </label>
                    </td>
                    <td>{new Date(p.creado_en).toLocaleDateString('es-NI', { timeZone: 'America/Managua' })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pie"><span>Tu propio usuario no se puede modificar desde aquí para evitar quedarte sin acceso.</span></div>
      </div>
    </>
  )
}

function Roles({ datos, onCambio, onError }: { datos: Datos; onCambio: () => void; onError: (m: string) => void }) {
  const [rolId, setRolId] = useState<string>(datos.roles[0]?.id ?? '')
  const rol = datos.roles.find((r) => r.id === rolId) ?? null
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [nuevo, setNuevo] = useState('')

  useEffect(() => {
    if (!rol) return
    setNombre(rol.nombre)
    setDescripcion(rol.descripcion ?? '')
    setMarcados(new Set(datos.rolesPermisos.filter((x) => x.id_rol === rol.id).map((x) => x.codigo_permiso)))
    setMensaje('')
  }, [rol?.id, datos]) // eslint-disable-line react-hooks/exhaustive-deps

  const modulos = [...new Set(datos.permisos.map((p) => p.modulo))]
  const usuariosConRol = rol ? datos.perfiles.filter((p) => p.id_rol === rol.id).length : 0

  async function crear() {
    const n = nuevo.trim()
    if (!n) return
    const { data, error } = await sb.from('roles').insert({ nombre: n }).select('id').single()
    if (error) return onError(error.code === '23505' ? 'Ya existe un rol con ese nombre.' : error.message)
    setNuevo('')
    await onCambio()
    if (data) setRolId(data.id)
  }

  async function guardar() {
    if (!rol || rol.es_sistema) return
    if (!nombre.trim()) return onError('El nombre del rol es obligatorio.')
    setGuardando(true)
    onError('')
    const actuales = new Set(datos.rolesPermisos.filter((x) => x.id_rol === rol.id).map((x) => x.codigo_permiso))
    const agregar = [...marcados].filter((c) => !actuales.has(c))
    const quitar = [...actuales].filter((c) => !marcados.has(c))

    const r1 = await sb.from('roles').update({ nombre: nombre.trim(), descripcion: descripcion.trim() || null }).eq('id', rol.id)
    if (r1.error) {
      setGuardando(false)
      return onError(r1.error.code === '23505' ? 'Ya existe un rol con ese nombre.' : r1.error.message)
    }
    if (agregar.length) {
      const r2 = await sb.from('roles_permisos').insert(agregar.map((codigo_permiso) => ({ id_rol: rol.id, codigo_permiso })))
      if (r2.error) {
        setGuardando(false)
        return onError(r2.error.message)
      }
    }
    if (quitar.length) {
      const r3 = await sb.from('roles_permisos').delete().eq('id_rol', rol.id).in('codigo_permiso', quitar)
      if (r3.error) {
        setGuardando(false)
        return onError(r3.error.message)
      }
    }
    await onCambio()
    setGuardando(false)
    setMensaje('Cambios guardados. Los usuarios con este rol los verán al volver a iniciar sesión o recargar.')
  }

  async function eliminar() {
    if (!rol || rol.es_sistema) return
    if (!window.confirm(`¿Eliminar el rol «${rol.nombre}»? Esta acción no se puede deshacer.`)) return
    const { error } = await sb.from('roles').delete().eq('id', rol.id)
    if (error) return onError(error.code === '23503' ? 'No se puede eliminar: hay usuarios con este rol. Cámbialos de rol primero.' : error.message)
    setRolId(datos.roles.find((r) => r.id !== rol.id)?.id ?? '')
    await onCambio()
  }

  function alternar(codigo: string) {
    setMarcados((prev) => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo)
      else n.add(codigo)
      return n
    })
  }

  return (
    <div className="roles-layout">
      <aside className="tarjeta grupo">
        <h3>Roles</h3>
        <div className="lista-roles">
          {datos.roles.map((r) => (
            <button key={r.id} className={r.id === rolId ? 'activo' : ''} onClick={() => setRolId(r.id)}>
              {r.nombre}
              {r.es_sistema && <span className="chip neutro">Sistema</span>}
            </button>
          ))}
        </div>
        <div className="nuevo-rol">
          <input placeholder="Nombre del nuevo rol" value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} />
          <button className="btn" onClick={crear} disabled={!nuevo.trim()}>Crear</button>
        </div>
      </aside>

      {rol && (
        <section className="tarjeta grupo">
          <h3>
            {rol.nombre}
            <span className="etiqueta-origen bitacora">{usuariosConRol} usuario(s)</span>
          </h3>
          {rol.es_sistema && <div className="aviso info" style={{ marginBottom: 12 }}>Rol de sistema: tiene todos los accesos y no se puede modificar ni eliminar.</div>}
          <div className="rejilla" style={{ marginBottom: 16 }}>
            <div className="campo">
              <label htmlFor="rol-nombre">Nombre</label>
              <input id="rol-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={rol.es_sistema} />
            </div>
            <div className="campo">
              <label htmlFor="rol-desc">Descripción</label>
              <input id="rol-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={rol.es_sistema} />
            </div>
          </div>
          {modulos.map((m) => (
            <fieldset key={m} className="modulo-permisos">
              <legend>{m}</legend>
              {datos.permisos.filter((p) => p.modulo === m).map((p) => (
                <label key={p.codigo} className="permiso">
                  <input type="checkbox" checked={marcados.has(p.codigo)} disabled={rol.es_sistema} onChange={() => alternar(p.codigo)} />
                  <span>{p.descripcion}<small>{p.codigo}</small></span>
                </label>
              ))}
            </fieldset>
          ))}
          {mensaje && <div className="aviso ok" style={{ marginTop: 12 }}>{mensaje}</div>}
          {!rol.es_sistema && (
            <div className="barra" style={{ marginTop: 16, marginBottom: 0 }}>
              <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
              <div className="espacio" />
              <button className="btn peligro" onClick={eliminar}>Eliminar rol</button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
