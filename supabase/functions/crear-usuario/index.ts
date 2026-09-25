// Alta de usuarios @instacredit.com y restablecimiento de contraseña. Solo puede invocarla un administrador (permiso admin.usuarios).
// Un administrador de un país solo administra usuarios de su país; un administrador regional (sin país) administra todos.
// Body: { accion?: 'crear' | 'restablecer', ... }
//   crear:        { email, nombre, id_rol, id_pais (opcional según el rol), password }
//   restablecer:  { user_id, password }
import { createClient } from 'npm:@supabase/supabase-js@2'

const DOMINIO = '@instacredit.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. Quién llama: debe ser administrador activo
  const llamador = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: esAdmin, error: errAdmin } = await llamador.rpc('usuario_es_admin')
  if (errAdmin || !esAdmin) return json({ error: 'Solo un administrador puede realizar esta acción.' }, 403)
  const { data: quien } = await llamador.auth.getUser()
  const idLlamador = quien.user?.id
  if (!idLlamador) return json({ error: 'Sesión inválida.' }, 401)

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: perfilLlamador } = await admin.from('perfiles_usuario').select('id_pais').eq('user_id', idLlamador).maybeSingle()
  const paisLlamador: string | null = perfilLlamador?.id_pais ?? null // null = administrador regional
  const alcanza = (idPais: string | null) => (paisLlamador === null ? true : idPais === paisLlamador)

  // 2. Datos
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400)
  }
  const accion = String(cuerpo.accion ?? 'crear')
  const password = String(cuerpo.password ?? '')
  if (password.length < 8) return json({ error: 'La contraseña temporal debe tener al menos 8 caracteres.' }, 400)

  // 3a. Restablecer contraseña de un usuario existente
  if (accion === 'restablecer') {
    const userId = String(cuerpo.user_id ?? '')
    if (!userId) return json({ error: 'Falta el usuario.' }, 400)
    if (userId === idLlamador) return json({ error: 'Tu propia contraseña no se restablece desde aquí.' }, 400)

    const { data: perfil } = await admin.from('perfiles_usuario').select('user_id, id_pais').eq('user_id', userId).maybeSingle()
    if (!perfil) return json({ error: 'El usuario no existe.' }, 404)
    if (!alcanza(perfil.id_pais)) return json({ error: 'No tienes alcance sobre ese usuario.' }, 403)

    const { error: errClave } = await admin.auth.admin.updateUserById(userId, { password })
    if (errClave) return json({ error: errClave.message }, 400)
    const { error: errFlag } = await admin.from('perfiles_usuario').update({ debe_cambiar_clave: true }).eq('user_id', userId)
    if (errFlag) return json({ error: `La contraseña cambió, pero no se pudo exigir el cambio en el próximo ingreso: ${errFlag.message}` }, 500)
    return json({ ok: true, user_id: userId })
  }

  // 3b. Crear usuario (correo ya confirmado) y completar su perfil
  const email = String(cuerpo.email ?? '').trim().toLowerCase()
  const nombre = String(cuerpo.nombre ?? '').trim()
  const idRol = String(cuerpo.id_rol ?? '')
  const idPais: string | null = cuerpo.id_pais ? String(cuerpo.id_pais) : null
  if (!/^[^@\s]+@instacredit\.com$/.test(email)) return json({ error: `El correo debe tener el dominio ${DOMINIO}.` }, 400)
  if (!nombre) return json({ error: 'El nombre es obligatorio.' }, 400)
  if (!idRol) return json({ error: 'Selecciona el puesto (rol).' }, 400)

  const { data: rol } = await admin.from('roles').select('id, nombre, ambito').eq('id', idRol).maybeSingle()
  if (!rol) return json({ error: 'El rol no existe.' }, 400)
  if (rol.ambito === 'regional' && idPais) return json({ error: `El puesto «${rol.nombre}» es regional y no lleva país.` }, 400)
  if (rol.ambito === 'pais' && !idPais) return json({ error: `El puesto «${rol.nombre}» requiere un país.` }, 400)
  if (paisLlamador !== null && (rol.ambito === 'regional' || !alcanza(idPais))) {
    return json({ error: 'Como administrador de un país solo puedes crear usuarios de tu país.' }, 403)
  }

  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  })
  if (errCrear || !creado.user) {
    const yaExiste = /already|registered|exists/i.test(errCrear?.message ?? '')
    return json({ error: yaExiste ? 'Ya existe un usuario con ese correo.' : (errCrear?.message ?? 'No se pudo crear el usuario.') }, yaExiste ? 409 : 400)
  }

  const { error: errPerfil } = await admin
    .from('perfiles_usuario')
    .update({ id_rol: idRol, id_pais: idPais, nombre, activo: true, debe_cambiar_clave: true })
    .eq('user_id', creado.user.id)
  if (errPerfil) {
    await admin.auth.admin.deleteUser(creado.user.id) // se deshace el usuario recién creado para no dejarlo a medias
    return json({ error: `No se pudo asignar el puesto y el país: ${errPerfil.message}` }, 500)
  }

  return json({ ok: true, user_id: creado.user.id, email })
})
