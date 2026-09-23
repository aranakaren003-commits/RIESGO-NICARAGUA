-- Esquema inicial: llamadas de bienvenida (Riesgo Nicaragua)

create table public.perfiles_usuario (
  user_id        uuid        not null,
  email          text,
  nombre         text,
  rol            text        not null default 'operador',
  activo         boolean     not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint pk_perfiles_usuario primary key (user_id),
  constraint fk_perfiles_usuario_auth_users foreign key (user_id) references auth.users (id) on delete cascade,
  constraint ck_perfiles_usuario_rol check (rol in ('admin', 'operador'))
);

create or replace function public.set_actualizado_en()
returns trigger language plpgsql set search_path = public as $$
begin new.actualizado_en := now(); return new; end $$;

create or replace function public.usuario_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.activo from public.perfiles_usuario p where p.user_id = auth.uid()), false)
$$;

create or replace function public.usuario_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.activo and p.rol = 'admin' from public.perfiles_usuario p where p.user_id = auth.uid()), false)
$$;

-- El primer usuario que se registra queda como admin activo; los demás quedan inactivos hasta que un admin los active.
create or replace function public.crear_perfil_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare es_primero boolean;
begin
  select not exists (select 1 from public.perfiles_usuario) into es_primero;
  insert into public.perfiles_usuario (user_id, email, rol, activo)
  values (new.id, new.email, case when es_primero then 'admin' else 'operador' end, es_primero);
  return new;
end $$;

create trigger trg_auth_users_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

create trigger trg_perfiles_usuario_actualizado_en
  before update on public.perfiles_usuario
  for each row execute function public.set_actualizado_en();

create table public.llamadas_bienvenida (
  id                       uuid        not null default gen_random_uuid(),
  num                      integer     generated always as identity,
  periodo                  text        not null,
  -- A..O: información del cliente y del crédito (precargada desde la bitácora, editable)
  cliente                  text        not null,
  estado                   text,
  informa                  text,
  numero_solicitud         bigint      not null,
  cedula                   text,
  telefono                 text,
  lugar_trabajo            text,
  fecha_formalizado        timestamptz,
  estatus_llamada          text,
  comentario_fecha_hora    text,
  tipo_credito             text,
  promotor                 text,
  categorizacion           text,
  modalidad                text,
  -- P..AQ: encuesta y seguimiento (ingresados por el usuario)
  atencion_tramite         text,
  atencion_ejecutivo       text,
  nombre_ejecutivo         text,
  calificacion_gestion     text,
  tipo_desembolso          text,
  atencion_analista        text,
  atencion_formalizador    text,
  conoce_asistencias       text,
  ofrecieron_asistencia    text,
  entregaron_documentacion text,
  claro_informacion        text,
  conforme_fechas_pago     text,
  pregunta_ab              text,
  nombre_dealer            text,
  pregunta_ad              text,
  pregunta_ae              text,
  pregunta_af              text,
  pregunta_ag              text,
  pregunta_ah              text,
  nombre_analista          text,
  comentario_sugerencia    text,
  email                    text,
  correo_agre_x_control    text,
  sucursal                 text,
  origen                   text,
  fechas_pago              date,
  no_conforme_fechas_pago  text,
  medio_notificacion       text,
  creado_por               uuid        default auth.uid(),
  actualizado_por          uuid,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  constraint pk_llamadas_bienvenida primary key (id),
  constraint uq_llamadas_bienvenida_numero_solicitud unique (numero_solicitud),
  constraint ck_llamadas_bienvenida_periodo check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint fk_llamadas_bienvenida_creado_por foreign key (creado_por) references auth.users (id) on delete set null,
  constraint fk_llamadas_bienvenida_actualizado_por foreign key (actualizado_por) references auth.users (id) on delete set null
);

create index ix_llamadas_bienvenida_periodo on public.llamadas_bienvenida (periodo);
create index ix_llamadas_bienvenida_estatus_llamada on public.llamadas_bienvenida (estatus_llamada);
create index ix_llamadas_bienvenida_creado_por on public.llamadas_bienvenida (creado_por);
create index ix_llamadas_bienvenida_actualizado_por on public.llamadas_bienvenida (actualizado_por);

create or replace function public.fijar_autor_llamada()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.actualizado_por := auth.uid();
  else
    new.creado_por := old.creado_por;
    new.actualizado_por := auth.uid();
  end if;
  new.actualizado_en := now();
  return new;
end $$;

create trigger trg_llamadas_bienvenida_autor
  before insert or update on public.llamadas_bienvenida
  for each row execute function public.fijar_autor_llamada();

alter table public.perfiles_usuario enable row level security;
alter table public.llamadas_bienvenida enable row level security;

create policy pol_perfiles_select on public.perfiles_usuario
  for select to authenticated using (user_id = (select auth.uid()) or (select public.usuario_es_admin()));
create policy pol_perfiles_update_admin on public.perfiles_usuario
  for update to authenticated using ((select public.usuario_es_admin())) with check ((select public.usuario_es_admin()));

create policy pol_llamadas_select on public.llamadas_bienvenida
  for select to authenticated using ((select public.usuario_activo()));
create policy pol_llamadas_insert on public.llamadas_bienvenida
  for insert to authenticated with check ((select public.usuario_activo()));
create policy pol_llamadas_update on public.llamadas_bienvenida
  for update to authenticated using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

revoke execute on function public.usuario_activo() from public, anon;
revoke execute on function public.usuario_es_admin() from public, anon;
revoke execute on function public.crear_perfil_usuario() from public, anon, authenticated;
grant execute on function public.usuario_activo() to authenticated;
grant execute on function public.usuario_es_admin() to authenticated;
