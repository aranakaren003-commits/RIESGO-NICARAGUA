-- Perfiles ligados a un país (o regionales), nuevos roles, cola de gestión de llamadas, configuración de campos obligatorios e historial de perfiles

-- ===== Ámbito de los roles y país de los perfiles =====
alter table public.roles add column ambito text not null default 'pais';
alter table public.roles add constraint ck_roles_ambito check (ambito in ('regional', 'pais', 'ambos'));
update public.roles set ambito = 'ambos' where nombre = 'Administrador';

alter table public.perfiles_usuario add column id_pais uuid;
alter table public.perfiles_usuario
  add constraint fk_perfiles_usuario_paises foreign key (id_pais) references public.paises (id) on delete restrict;
create index ix_perfiles_usuario_id_pais on public.perfiles_usuario (id_pais);
alter table public.perfiles_usuario add column eliminado_en timestamptz;

-- ===== Permisos nuevos =====
insert into public.permisos (codigo, modulo, descripcion) values
  ('gestion.llamadas',    'Gestión de llamadas', 'Gestionar la cola de llamadas: marcar intentos y capturar la encuesta'),
  ('dashboard.descargar', 'Dashboard',           'Descargar la información del dashboard'),
  ('admin.formulario',    'Administración',      'Configurar qué campos del formulario son obligatorios');
update public.permisos set modulo = 'Dashboard', descripcion = 'Ver el dashboard' where codigo = 'graficas.ver';

-- ===== Roles: se retiran Operador y Consulta (sin usuarios) y se crean los nuevos =====
delete from public.roles where nombre in ('Operador', 'Consulta');

insert into public.roles (nombre, descripcion, es_sistema, ambito) values
  ('Gerente regional',           'Ve dashboards y datos de todos los países y puede descargarlos',            false, 'regional'),
  ('Gerente local',              'Ve dashboards y datos del país al que pertenece y puede descargarlos',      false, 'pais'),
  ('Digitador',                  'Gestiona las llamadas de su país y captura la encuesta del formulario',    false, 'pais'),
  ('Analista de Carga de Datos', 'Carga la bitácora de atención del país al que está asignado',              false, 'pais'),
  ('Sin acceso',                 'Usuario sin accesos, pendiente de asignación',                              true,  'ambos');

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p on p.codigo in ('gestion.llamadas', 'dashboard.descargar', 'admin.formulario')
where r.nombre = 'Administrador';

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p
  on p.codigo in ('registros.ver', 'registros.exportar', 'graficas.ver', 'dashboard.descargar', 'intentos.ver')
where r.nombre in ('Gerente regional', 'Gerente local');

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p
  on p.codigo in ('gestion.llamadas', 'registros.crear', 'registros.editar')
where r.nombre = 'Digitador';

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, 'bitacora.importar' from public.roles r where r.nombre = 'Analista de Carga de Datos';

-- Un rol regional no lleva país; un rol de país lo exige; el Administrador puede ser regional o de un país
create or replace function public.validar_ambito_perfil()
returns trigger language plpgsql set search_path = public as $$
declare v_ambito text;
begin
  select r.ambito into v_ambito from public.roles r where r.id = new.id_rol;
  if v_ambito = 'regional' and new.id_pais is not null then
    raise exception 'Un rol regional no lleva país';
  end if;
  if v_ambito = 'pais' and new.id_pais is null then
    raise exception 'Este rol requiere un país';
  end if;
  return new;
end $$;

create trigger trg_perfiles_usuario_ambito
  before insert or update of id_rol, id_pais on public.perfiles_usuario
  for each row execute function public.validar_ambito_perfil();

-- Los usuarios nuevos quedan sin acceso hasta que un administrador les asigne rol y país
create or replace function public.crear_perfil_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare es_primero boolean;
begin
  select not exists (select 1 from public.perfiles_usuario) into es_primero;
  insert into public.perfiles_usuario (user_id, email, id_rol, activo)
  values (
    new.id,
    new.email,
    (select r.id from public.roles r where r.nombre = case when es_primero then 'Administrador' else 'Sin acceso' end),
    es_primero
  );
  return new;
end $$;

-- ===== Funciones de alcance por país =====
create or replace function public.es_regional()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.activo and p.id_pais is null from public.perfiles_usuario p where p.user_id = auth.uid()), false)
$$;

create or replace function public.puede_ver_pais(p_pais uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.activo and (p.id_pais is null or p.id_pais = p_pais) from public.perfiles_usuario p where p.user_id = auth.uid()), false)
$$;

-- Administrador con alcance sobre ese país (p_pais nulo = perfil regional: solo un administrador regional)
create or replace function public.admin_alcanza(p_pais uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.usuario_es_admin() and (case when p_pais is null then public.es_regional() else public.puede_ver_pais(p_pais) end)
$$;

revoke execute on function public.es_regional() from public, anon;
revoke execute on function public.puede_ver_pais(uuid) from public, anon;
revoke execute on function public.admin_alcanza(uuid) from public, anon;
grant execute on function public.es_regional() to authenticated;
grant execute on function public.puede_ver_pais(uuid) to authenticated;
grant execute on function public.admin_alcanza(uuid) to authenticated;

-- ===== RLS por país =====
drop policy pol_perfiles_select on public.perfiles_usuario;
drop policy pol_perfiles_update_admin on public.perfiles_usuario;
create policy pol_perfiles_select on public.perfiles_usuario
  for select to authenticated using (user_id = (select auth.uid()) or (select public.admin_alcanza(id_pais)));
create policy pol_perfiles_update_admin on public.perfiles_usuario
  for update to authenticated
  using ((select public.admin_alcanza(id_pais)) and user_id <> (select auth.uid()))
  with check ((select public.admin_alcanza(id_pais)) and user_id <> (select auth.uid()));

drop policy pol_roles_insert on public.roles;
drop policy pol_roles_update on public.roles;
drop policy pol_roles_delete on public.roles;
create policy pol_roles_insert on public.roles
  for insert to authenticated with check ((select public.usuario_es_admin()) and (select public.es_regional()) and not es_sistema);
create policy pol_roles_update on public.roles
  for update to authenticated
  using ((select public.usuario_es_admin()) and (select public.es_regional()) and not es_sistema)
  with check ((select public.usuario_es_admin()) and (select public.es_regional()) and not es_sistema);
create policy pol_roles_delete on public.roles
  for delete to authenticated using ((select public.usuario_es_admin()) and (select public.es_regional()) and not es_sistema);

drop policy pol_roles_permisos_insert on public.roles_permisos;
drop policy pol_roles_permisos_delete on public.roles_permisos;
create policy pol_roles_permisos_insert on public.roles_permisos
  for insert to authenticated
  with check ((select public.usuario_es_admin()) and (select public.es_regional()) and not (select public.rol_es_sistema(id_rol)));
create policy pol_roles_permisos_delete on public.roles_permisos
  for delete to authenticated
  using ((select public.usuario_es_admin()) and (select public.es_regional()) and not (select public.rol_es_sistema(id_rol)));

drop policy pol_paises_select on public.paises;
drop policy pol_paises_insert on public.paises;
drop policy pol_paises_update on public.paises;
create policy pol_paises_select on public.paises
  for select to authenticated using ((select public.puede_ver_pais(id)));
create policy pol_paises_insert on public.paises
  for insert to authenticated with check ((select public.usuario_es_admin()) and (select public.es_regional()));
create policy pol_paises_update on public.paises
  for update to authenticated
  using ((select public.usuario_es_admin()) and (select public.es_regional()))
  with check ((select public.usuario_es_admin()) and (select public.es_regional()));

drop policy pol_llamadas_select on public.llamadas_bienvenida;
drop policy pol_llamadas_insert on public.llamadas_bienvenida;
drop policy pol_llamadas_update on public.llamadas_bienvenida;
create policy pol_llamadas_select on public.llamadas_bienvenida
  for select to authenticated
  using (
    (select public.puede_ver_pais(id_pais))
    and ((select public.tiene_permiso('registros.ver')) or (select public.tiene_permiso('graficas.ver')) or (select public.tiene_permiso('gestion.llamadas')))
  );
create policy pol_llamadas_insert on public.llamadas_bienvenida
  for insert to authenticated
  with check ((select public.puede_ver_pais(id_pais)) and (select public.tiene_permiso('registros.crear')));
create policy pol_llamadas_update on public.llamadas_bienvenida
  for update to authenticated
  using ((select public.puede_ver_pais(id_pais)) and (select public.tiene_permiso('registros.editar')))
  with check ((select public.puede_ver_pais(id_pais)) and (select public.tiene_permiso('registros.editar')));

drop policy pol_cargas_select on public.cargas_bitacora;
create policy pol_cargas_select on public.cargas_bitacora
  for select to authenticated using ((select public.puede_ver_pais(id_pais)));

drop policy pol_carga_registros_select on public.carga_registros;
drop policy pol_carga_registros_insert on public.carga_registros;
create policy pol_carga_registros_select on public.carga_registros
  for select to authenticated
  using (exists (select 1 from public.cargas_bitacora c where c.id = id_carga and (select public.puede_ver_pais(c.id_pais))));
create policy pol_carga_registros_insert on public.carga_registros
  for insert to authenticated
  with check (
    exists (select 1 from public.cargas_bitacora c where c.id = id_carga and (select public.puede_ver_pais(c.id_pais)))
    and ((select public.tiene_permiso('registros.crear')) or (select public.tiene_permiso('bitacora.importar')))
  );

drop policy pol_intentos_select on public.intentos_llamada;
create policy pol_intentos_select on public.intentos_llamada
  for select to authenticated
  using ((select public.puede_ver_pais(id_pais)) and (select public.tiene_permiso('intentos.ver')));

-- ===== Historial de perfiles (para revertir) =====
create table public.perfiles_historial (
  id           uuid        not null default gen_random_uuid(),
  user_id      uuid        not null,
  snapshot     jsonb       not null,
  cambiado_por uuid,
  cambiado_en  timestamptz not null default now(),
  revertido    boolean     not null default false,
  constraint pk_perfiles_historial primary key (id),
  constraint fk_perfiles_historial_perfiles foreign key (user_id) references public.perfiles_usuario (user_id) on delete cascade
);
create index ix_perfiles_historial_user_cambiado on public.perfiles_historial (user_id, cambiado_en);
alter table public.perfiles_historial enable row level security;
create policy pol_perfiles_historial_select on public.perfiles_historial
  for select to authenticated
  using (exists (select 1 from public.perfiles_usuario p where p.user_id = perfiles_historial.user_id and (select public.admin_alcanza(p.id_pais))));

create or replace function public.guardar_historial_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.sin_historial', true), '') = '1' then
    return new;
  end if;
  if (old.id_rol, old.id_pais, old.activo, old.nombre, old.eliminado_en)
     is distinct from (new.id_rol, new.id_pais, new.activo, new.nombre, new.eliminado_en) then
    insert into public.perfiles_historial (user_id, snapshot, cambiado_por) values (old.user_id, to_jsonb(old), auth.uid());
  end if;
  return new;
end $$;

create trigger trg_perfiles_usuario_historial
  after update on public.perfiles_usuario
  for each row execute function public.guardar_historial_perfil();

create or replace function public.revertir_perfil(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pais uuid;
  v_h public.perfiles_historial%rowtype;
begin
  select p.id_pais into v_pais from public.perfiles_usuario p where p.user_id = p_user;
  if not found then
    raise exception 'El usuario no existe';
  end if;
  if p_user = auth.uid() or not public.admin_alcanza(v_pais) then
    raise exception 'Sin permiso para revertir este perfil';
  end if;

  select h.* into v_h from public.perfiles_historial h
  where h.user_id = p_user and not h.revertido order by h.cambiado_en desc limit 1;
  if not found then
    raise exception 'No hay cambios anteriores para revertir';
  end if;
  if not public.admin_alcanza((v_h.snapshot ->> 'id_pais')::uuid) then
    raise exception 'Sin permiso para restaurar ese perfil';
  end if;

  perform set_config('app.sin_historial', '1', true);
  update public.perfiles_usuario
     set id_rol = (v_h.snapshot ->> 'id_rol')::uuid,
         id_pais = (v_h.snapshot ->> 'id_pais')::uuid,
         activo = (v_h.snapshot ->> 'activo')::boolean,
         nombre = v_h.snapshot ->> 'nombre',
         eliminado_en = (v_h.snapshot ->> 'eliminado_en')::timestamptz
   where user_id = p_user;
  perform set_config('app.sin_historial', '', true);

  update public.perfiles_historial set revertido = true where id = v_h.id;
end $$;

revoke execute on function public.revertir_perfil(uuid) from public, anon;
revoke execute on function public.guardar_historial_perfil() from public, anon, authenticated;
revoke execute on function public.validar_ambito_perfil() from public, anon, authenticated;
grant execute on function public.revertir_perfil(uuid) to authenticated;

-- ===== Campos obligatorios del formulario (por país) =====
create table public.campos_formulario_config (
  id_pais        uuid        not null,
  campo          text        not null,
  obligatorio    boolean     not null default false,
  actualizado_en timestamptz not null default now(),
  constraint pk_campos_formulario_config primary key (id_pais, campo),
  constraint fk_campos_formulario_config_paises foreign key (id_pais) references public.paises (id) on delete cascade
);
alter table public.campos_formulario_config enable row level security;
create policy pol_campos_config_select on public.campos_formulario_config
  for select to authenticated using ((select public.puede_ver_pais(id_pais)));
create policy pol_campos_config_insert on public.campos_formulario_config
  for insert to authenticated
  with check ((select public.admin_alcanza(id_pais)) and (select public.tiene_permiso('admin.formulario')));
create policy pol_campos_config_update on public.campos_formulario_config
  for update to authenticated
  using ((select public.admin_alcanza(id_pais)) and (select public.tiene_permiso('admin.formulario')))
  with check ((select public.admin_alcanza(id_pais)) and (select public.tiene_permiso('admin.formulario')));

-- ===== Gestión de llamadas =====
-- Cada selección de la lista (NO CONTESTA / BUZON / CONTESTA) es un intento. La primera fija FECHA Y HORA (inmodificable).
drop function public.abrir_registro(uuid);

create or replace function public.registrar_intento(p_id uuid, p_resultado text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pais uuid;
  v_fecha timestamptz;
  v_usuario text;
  v_intento uuid;
begin
  if p_resultado not in ('NO CONTESTA', 'BUZON', 'CONTESTA') then
    raise exception 'Resultado de llamada inválido';
  end if;
  if not (public.tiene_permiso('gestion.llamadas') or public.tiene_permiso('registros.editar')) then
    raise exception 'Sin permiso para gestionar llamadas';
  end if;

  select l.id_pais into v_pais from public.llamadas_bienvenida l where l.id = p_id;
  if v_pais is null then
    raise exception 'Registro inexistente';
  end if;
  if not public.puede_ver_pais(v_pais) then
    raise exception 'Sin permiso sobre este país';
  end if;

  perform set_config('app.permitir_fecha_hora', '1', true);
  update public.llamadas_bienvenida set fecha_hora_llamada = now() where id = p_id and fecha_hora_llamada is null;
  if p_resultado in ('NO CONTESTA', 'BUZON') then
    update public.llamadas_bienvenida set estatus_llamada = p_resultado where id = p_id;
  end if;
  perform set_config('app.permitir_fecha_hora', '', true);

  select l.fecha_hora_llamada into v_fecha from public.llamadas_bienvenida l where l.id = p_id;
  select p.email into v_usuario from public.perfiles_usuario p where p.user_id = auth.uid();

  insert into public.intentos_llamada (id_llamada, id_pais, usuario, estatus_llamada)
  values (p_id, v_pais, v_usuario, p_resultado)
  returning id into v_intento;

  return jsonb_build_object('fecha_hora_llamada', v_fecha, 'id_intento', v_intento);
end $$;

revoke execute on function public.registrar_intento(uuid, text) from public, anon;
grant execute on function public.registrar_intento(uuid, text) to authenticated;

-- Cola de trabajo del Digitador: líneas sin gestionar (sin estatus, NO CONTESTA o BUZON) de su país.
-- Vista con los derechos del propietario (para poder contar intentos); el acceso lo restringen las condiciones del WHERE.
create view public.v_cola_llamadas as
select l.id,
       l.id_pais,
       l.cliente,
       l.tipo_credito,
       l.telefono,
       l.cedula,
       l.fecha_formalizado,
       l.estatus_llamada,
       coalesce(i.n, 0)::integer as intentos,
       case when l.estatus_llamada is null then 1 when l.estatus_llamada = 'NO CONTESTA' then 2 else 3 end as orden_estatus
from public.llamadas_bienvenida l
left join (select t.id_llamada, count(*) as n from public.intentos_llamada t group by t.id_llamada) i on i.id_llamada = l.id
where (l.estatus_llamada is null or l.estatus_llamada in ('NO CONTESTA', 'BUZON'))
  and public.tiene_permiso('gestion.llamadas')
  and public.puede_ver_pais(l.id_pais);

revoke all on public.v_cola_llamadas from anon;
grant select on public.v_cola_llamadas to authenticated;

-- ===== Cargas: solo de tu país y máximo 5 por día =====
create or replace function public.crear_carga(p_pais uuid, p_archivo text, p_total integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
  v_local timestamp;
  v_periodo text;
  v_numero integer;
  v_id uuid;
begin
  if not public.tiene_permiso('bitacora.importar') then
    raise exception 'Sin permiso para importar';
  end if;
  if not public.puede_ver_pais(p_pais) then
    raise exception 'Solo puedes cargar la bitácora del país al que estás asignado';
  end if;
  select p.zona_horaria into v_tz from public.paises p where p.id = p_pais and p.activo;
  if v_tz is null then
    raise exception 'País inexistente o inactivo';
  end if;

  v_local := now() at time zone v_tz;
  v_periodo := to_char(v_local, 'YYYY-MM');
  perform pg_advisory_xact_lock(hashtext(p_pais::text || v_periodo));

  if (select count(*) from public.cargas_bitacora c where c.id_pais = p_pais and c.fecha_local = v_local::date) >= 5 then
    raise exception 'Se alcanzó el máximo de 5 cargas por día en este país';
  end if;

  select coalesce(max(c.numero), 0) + 1 into v_numero
  from public.cargas_bitacora c where c.id_pais = p_pais and c.periodo = v_periodo;

  insert into public.cargas_bitacora (id_pais, periodo, numero, fecha_local, nombre_archivo, total_filas)
  values (p_pais, v_periodo, v_numero, v_local::date, p_archivo, coalesce(p_total, 0))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.importar_lote(p_carga uuid, p_filas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_pais uuid;
  v_nuevos integer;
  v_ligados integer;
begin
  if not public.tiene_permiso('bitacora.importar') then
    raise exception 'Sin permiso para importar';
  end if;
  select c.id_pais into v_pais from public.cargas_bitacora c where c.id = p_carga;
  if v_pais is null then
    raise exception 'Carga inexistente';
  end if;
  if not public.puede_ver_pais(v_pais) then
    raise exception 'Solo puedes cargar la bitácora del país al que estás asignado';
  end if;

  with ins as (
    insert into public.llamadas_bienvenida
      (id_pais, periodo, cliente, estado, informa, numero_solicitud, cedula, telefono, lugar_trabajo,
       fecha_formalizado, tipo_credito, promotor, categorizacion, modalidad)
    select v_pais, x.periodo, x.cliente, x.estado, x.informa, x.numero_solicitud, x.cedula, x.telefono, x.lugar_trabajo,
           x.fecha_formalizado, x.tipo_credito, x.promotor, x.categorizacion, x.modalidad
    from jsonb_to_recordset(p_filas) as x(
      periodo text, cliente text, estado text, informa text, numero_solicitud bigint, cedula text, telefono text,
      lugar_trabajo text, fecha_formalizado timestamptz, tipo_credito text, promotor text, categorizacion text, modalidad text)
    on conflict (id_pais, numero_solicitud) do nothing
    returning id
  )
  select count(*) into v_nuevos from ins;

  insert into public.carga_registros (id_carga, id_llamada)
  select p_carga, l.id
  from public.llamadas_bienvenida l
  join jsonb_to_recordset(p_filas) as x(numero_solicitud bigint) on x.numero_solicitud = l.numero_solicitud
  where l.id_pais = v_pais
  on conflict do nothing;
  get diagnostics v_ligados = row_count;

  update public.cargas_bitacora
     set total_importadas = total_importadas + v_ligados,
         nuevos = nuevos + v_nuevos
   where id = p_carga;

  return v_nuevos;
end $$;
