-- Módulo de administración: roles, permisos y acceso por opción de la aplicación

create table public.roles (
  id             uuid        not null default gen_random_uuid(),
  nombre         text        not null,
  descripcion    text,
  es_sistema     boolean     not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint pk_roles primary key (id),
  constraint uq_roles_nombre unique (nombre),
  constraint ck_roles_nombre check (length(btrim(nombre)) > 0)
);

create table public.permisos (
  codigo      text not null,
  modulo      text not null,
  descripcion text not null,
  constraint pk_permisos primary key (codigo)
);

create table public.roles_permisos (
  id_rol         uuid not null,
  codigo_permiso text not null,
  constraint pk_roles_permisos primary key (id_rol, codigo_permiso),
  constraint fk_roles_permisos_roles foreign key (id_rol) references public.roles (id) on delete cascade,
  constraint fk_roles_permisos_permisos foreign key (codigo_permiso) references public.permisos (codigo) on delete cascade
);
create index ix_roles_permisos_codigo_permiso on public.roles_permisos (codigo_permiso);

create trigger trg_roles_actualizado_en
  before update on public.roles
  for each row execute function public.set_actualizado_en();

insert into public.permisos (codigo, modulo, descripcion) values
  ('registros.ver',      'Registros', 'Ver el listado y el detalle de los registros'),
  ('registros.crear',    'Registros', 'Crear registros nuevos'),
  ('registros.editar',   'Registros', 'Editar registros existentes'),
  ('registros.exportar', 'Registros', 'Exportar registros a CSV'),
  ('graficas.ver',       'Gráficas',  'Ver el módulo de gráficas'),
  ('bitacora.importar',  'Importar',  'Importar la bitácora de atención'),
  ('admin.usuarios',     'Administración', 'Gestionar usuarios, roles y accesos');

insert into public.roles (nombre, descripcion, es_sistema) values
  ('Administrador', 'Acceso total, incluida la administración de usuarios y roles', true),
  ('Operador',      'Captura y edición de registros, gráficas y exportación', false),
  ('Consulta',      'Solo lectura de registros y gráficas', false);

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r cross join public.permisos p where r.nombre = 'Administrador';

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p
  on p.codigo in ('registros.ver', 'registros.crear', 'registros.editar', 'registros.exportar', 'graficas.ver')
where r.nombre = 'Operador';

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p
  on p.codigo in ('registros.ver', 'graficas.ver')
where r.nombre = 'Consulta';

-- perfiles_usuario: de texto libre 'rol' a FK hacia roles (antes de las funciones que lo usan)
alter table public.perfiles_usuario add column id_rol uuid;
update public.perfiles_usuario p
   set id_rol = r.id
  from public.roles r
 where r.nombre = case p.rol when 'admin' then 'Administrador' else 'Operador' end;
alter table public.perfiles_usuario alter column id_rol set not null;
alter table public.perfiles_usuario
  add constraint fk_perfiles_usuario_roles foreign key (id_rol) references public.roles (id) on delete restrict;
create index ix_perfiles_usuario_id_rol on public.perfiles_usuario (id_rol);

-- Funciones de autorización basadas en permisos
create or replace function public.tiene_permiso(p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.perfiles_usuario pu
    join public.roles_permisos rp on rp.id_rol = pu.id_rol
    where pu.user_id = auth.uid() and pu.activo and rp.codigo_permiso = p_codigo
  )
$$;

create or replace function public.mis_permisos()
returns setof text language sql stable security definer set search_path = public as $$
  select rp.codigo_permiso
  from public.perfiles_usuario pu
  join public.roles_permisos rp on rp.id_rol = pu.id_rol
  where pu.user_id = auth.uid() and pu.activo
$$;

create or replace function public.rol_es_sistema(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select r.es_sistema from public.roles r where r.id = p_id), false)
$$;

create or replace function public.usuario_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tiene_permiso('admin.usuarios')
$$;

alter table public.perfiles_usuario drop constraint ck_perfiles_usuario_rol;
alter table public.perfiles_usuario drop column rol;

-- El primer usuario queda como Administrador activo; los demás como Consulta, inactivos hasta que un admin los active.
create or replace function public.crear_perfil_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare es_primero boolean;
begin
  select not exists (select 1 from public.perfiles_usuario) into es_primero;
  insert into public.perfiles_usuario (user_id, email, id_rol, activo)
  values (
    new.id,
    new.email,
    (select r.id from public.roles r where r.nombre = case when es_primero then 'Administrador' else 'Consulta' end),
    es_primero
  );
  return new;
end $$;

-- Políticas
alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.roles_permisos enable row level security;

drop policy pol_perfiles_update_admin on public.perfiles_usuario;
create policy pol_perfiles_update_admin on public.perfiles_usuario
  for update to authenticated
  using ((select public.usuario_es_admin()) and user_id <> (select auth.uid()))
  with check ((select public.usuario_es_admin()) and user_id <> (select auth.uid()));

create policy pol_roles_select on public.roles
  for select to authenticated using ((select public.usuario_activo()));
create policy pol_roles_insert on public.roles
  for insert to authenticated with check ((select public.usuario_es_admin()) and not es_sistema);
create policy pol_roles_update on public.roles
  for update to authenticated
  using ((select public.usuario_es_admin()) and not es_sistema)
  with check ((select public.usuario_es_admin()) and not es_sistema);
create policy pol_roles_delete on public.roles
  for delete to authenticated using ((select public.usuario_es_admin()) and not es_sistema);

create policy pol_permisos_select on public.permisos
  for select to authenticated using ((select public.usuario_activo()));

create policy pol_roles_permisos_select on public.roles_permisos
  for select to authenticated using ((select public.usuario_activo()));
create policy pol_roles_permisos_insert on public.roles_permisos
  for insert to authenticated
  with check ((select public.usuario_es_admin()) and not (select public.rol_es_sistema(id_rol)));
create policy pol_roles_permisos_delete on public.roles_permisos
  for delete to authenticated
  using ((select public.usuario_es_admin()) and not (select public.rol_es_sistema(id_rol)));

drop policy pol_llamadas_select on public.llamadas_bienvenida;
drop policy pol_llamadas_insert on public.llamadas_bienvenida;
drop policy pol_llamadas_update on public.llamadas_bienvenida;

create policy pol_llamadas_select on public.llamadas_bienvenida
  for select to authenticated
  using ((select public.tiene_permiso('registros.ver')) or (select public.tiene_permiso('graficas.ver')));
create policy pol_llamadas_insert on public.llamadas_bienvenida
  for insert to authenticated
  with check ((select public.tiene_permiso('registros.crear')) or (select public.tiene_permiso('bitacora.importar')));
create policy pol_llamadas_update on public.llamadas_bienvenida
  for update to authenticated
  using ((select public.tiene_permiso('registros.editar')))
  with check ((select public.tiene_permiso('registros.editar')));

revoke execute on function public.tiene_permiso(text) from public, anon;
revoke execute on function public.mis_permisos() from public, anon;
revoke execute on function public.rol_es_sistema(uuid) from public, anon;
grant execute on function public.tiene_permiso(text) to authenticated;
grant execute on function public.mis_permisos() to authenticated;
grant execute on function public.rol_es_sistema(uuid) to authenticated;
