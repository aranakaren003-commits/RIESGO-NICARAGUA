// Crea un usuario con correo @instacredit.com. Solo puede invocarla un administrador (permiso admin.usuarios).
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
  if (errAdmin || !esAdmin) return json({ error: 'Solo un administrador puede crear usuarios.' }, 403)

  // 2. Datos
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400)
  }
  const email = String(cuerpo.email ?? '').trim().toLowerCase()
  const nombre = String(cuerpo.nombre ?? '').trim()
  const idRol = String(cuerpo.id_rol ?? '')
  const password = String(cuerpo.password ?? '')

  if (!/^[^@\s]+@instacredit\.com$/.test(email)) return json({ error: `El correo debe tener el dominio ${DOMINIO}.` }, 400)
  if (!idRol) return json({ error: 'Selecciona un rol.' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña temporal debe tener al menos 8 caracteres.' }, 400)

  // 3. Crear el usuario (correo ya confirmado) y completar su perfil
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
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
    .update({ id_rol: idRol, nombre: nombre || null, activo: true, debe_cambiar_clave: true })
    .eq('user_id', creado.user.id)
  if (errPerfil) {
    await admin.auth.admin.deleteUser(creado.user.id) // se deshace el usuario recién creado para no dejarlo a medias
    return json({ error: `No se pudo asignar el rol: ${errPerfil.message}` }, 500)
  }

  return json({ ok: true, user_id: creado.user.id, email })
})
