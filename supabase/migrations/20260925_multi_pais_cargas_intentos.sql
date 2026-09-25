-- Multi-país, histórico de cargas de la bitácora y bitácora de intentos de llamada

-- ===== Países =====
create table public.paises (
  id             uuid        not null default gen_random_uuid(),
  codigo         text        not null,
  nombre         text        not null,
  zona_horaria   text        not null,
  activo         boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint pk_paises primary key (id),
  constraint uq_paises_codigo unique (codigo),
  constraint uq_paises_nombre unique (nombre),
  constraint ck_paises_codigo check (codigo ~ '^[A-Z]{2,3}$'),
  constraint ck_paises_nombre check (length(btrim(nombre)) > 0)
);

create trigger trg_paises_actualizado_en
  before update on public.paises
  for each row execute function public.set_actualizado_en();

insert into public.paises (codigo, nombre, zona_horaria) values
  ('NI', 'Nicaragua',   'America/Managua'),
  ('PA', 'Panamá',      'America/Panama'),
  ('SV', 'El Salvador', 'America/El_Salvador'),
  ('CR', 'Costa Rica',  'America/Costa_Rica');

-- ===== Registros por país =====
alter table public.llamadas_bienvenida add column id_pais uuid;
update public.llamadas_bienvenida set id_pais = (select p.id from public.paises p where p.codigo = 'NI');
alter table public.llamadas_bienvenida alter column id_pais set not null;
alter table public.llamadas_bienvenida
  add constraint fk_llamadas_bienvenida_paises foreign key (id_pais) references public.paises (id) on delete restrict;
alter table public.llamadas_bienvenida drop constraint uq_llamadas_bienvenida_numero_solicitud;
alter table public.llamadas_bienvenida
  add constraint uq_llamadas_bienvenida_pais_solicitud unique (id_pais, numero_solicitud);

-- ===== Cargas de la bitácora (histórico) =====
create table public.cargas_bitacora (
  id               uuid        not null default gen_random_uuid(),
  id_pais          uuid        not null,
  periodo          text        not null,
  numero           integer     not null,
  fecha_local      date        not null,
  fecha_carga      timestamptz not null default now(),
  nombre_archivo   text,
  total_filas      integer     not null default 0,
  total_importadas integer     not null default 0,
  nuevos           integer     not null default 0,
  cargado_por      uuid        default auth.uid(),
  constraint pk_cargas_bitacora primary key (id),
  constraint fk_cargas_bitacora_paises foreign key (id_pais) references public.paises (id) on delete restrict,
  constraint fk_cargas_bitacora_cargado_por foreign key (cargado_por) references auth.users (id) on delete set null,
  constraint uq_cargas_bitacora_pais_periodo_numero unique (id_pais, periodo, numero),
  constraint ck_cargas_bitacora_periodo check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint ck_cargas_bitacora_numero check (numero > 0)
);
create index ix_cargas_bitacora_cargado_por on public.cargas_bitacora (cargado_por);

create table public.carga_registros (
  id_carga   uuid not null,
  id_llamada uuid not null,
  constraint pk_carga_registros primary key (id_carga, id_llamada),
  constraint fk_carga_registros_cargas foreign key (id_carga) references public.cargas_bitacora (id) on delete cascade,
  constraint fk_carga_registros_llamadas foreign key (id_llamada) references public.llamadas_bienvenida (id) on delete cascade
);
create index ix_carga_registros_id_llamada on public.carga_registros (id_llamada);

-- Los registros que ya existían quedan como "Carga 1" (migrada) de su país
insert into public.cargas_bitacora (id_pais, periodo, numero, fecha_local, fecha_carga, nombre_archivo, total_filas, total_importadas, nuevos)
select p.id,
       to_char(min(l.creado_en) at time zone p.zona_horaria, 'YYYY-MM'),
       1,
       (min(l.creado_en) at time zone p.zona_horaria)::date,
       min(l.creado_en),
       'Carga inicial (migrada)',
       count(*), count(*), count(*)
from public.llamadas_bienvenida l
join public.paises p on p.id = l.id_pais
group by p.id, p.zona_horaria;

insert into public.carga_registros (id_carga, id_llamada)
select c.id, l.id
from public.llamadas_bienvenida l
join public.cargas_bitacora c on c.id_pais = l.id_pais;

-- ===== Intentos de llamada =====
create table public.intentos_llamada (
  id              uuid        not null default gen_random_uuid(),
  id_llamada      uuid        not null,
  id_pais         uuid        not null,
  user_id         uuid        default auth.uid(),
  usuario         text,
  hora_intento    timestamptz not null default now(),
  estatus_llamada text,
  constraint pk_intentos_llamada primary key (id),
  constraint fk_intentos_llamada_llamadas foreign key (id_llamada) references public.llamadas_bienvenida (id) on delete cascade,
  constraint fk_intentos_llamada_paises foreign key (id_pais) references public.paises (id) on delete restrict,
  constraint fk_intentos_llamada_user foreign key (user_id) references auth.users (id) on delete set null
);
create index ix_intentos_llamada_id_llamada on public.intentos_llamada (id_llamada);
create index ix_intentos_llamada_pais_hora on public.intentos_llamada (id_pais, hora_intento);
create index ix_intentos_llamada_user_id on public.intentos_llamada (user_id);

-- La primera fecha/hora de apertura no se puede modificar; solo la fija abrir_registro()
create or replace function public.proteger_fecha_hora_llamada()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.permitir_fecha_hora', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.fecha_hora_llamada := null;
    else
      new.fecha_hora_llamada := old.fecha_hora_llamada;
    end if;
  end if;
  return new;
end $$;

create trigger trg_llamadas_bienvenida_proteger_fecha_hora
  before insert or update on public.llamadas_bienvenida
  for each row execute function public.proteger_fecha_hora_llamada();

-- ===== Permiso nuevo =====
insert into public.permisos (codigo, modulo, descripcion)
values ('intentos.ver', 'Bitácora de intentos', 'Ver la bitácora de intentos de llamada');

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, 'intentos.ver' from public.roles r where r.nombre in ('Administrador', 'Operador');

-- ===== Funciones (RPC) =====
create or replace function public.abrir_registro(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fecha timestamptz;
  v_pais uuid;
  v_estatus text;
  v_usuario text;
  v_intento uuid;
begin
  if not public.tiene_permiso('registros.editar') then
    raise exception 'Sin permiso para registrar intentos';
  end if;

  perform set_config('app.permitir_fecha_hora', '1', true);
  update public.llamadas_bienvenida set fecha_hora_llamada = now() where id = p_id and fecha_hora_llamada is null;
  perform set_config('app.permitir_fecha_hora', '', true);

  select l.fecha_hora_llamada, l.id_pais, l.estatus_llamada into v_fecha, v_pais, v_estatus
  from public.llamadas_bienvenida l where l.id = p_id;
  if v_pais is null then
    raise exception 'Registro inexistente';
  end if;

  select p.email into v_usuario from public.perfiles_usuario p where p.user_id = auth.uid();

  insert into public.intentos_llamada (id_llamada, id_pais, usuario, estatus_llamada)
  values (p_id, v_pais, v_usuario, v_estatus)
  returning id into v_intento;

  return jsonb_build_object('fecha_hora_llamada', v_fecha, 'id_intento', v_intento);
end $$;

create or replace function public.actualizar_intento(p_id uuid, p_estatus text)
returns void language sql security definer set search_path = public as $$
  update public.intentos_llamada set estatus_llamada = p_estatus where id = p_id and user_id = auth.uid()
$$;

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
  select p.zona_horaria into v_tz from public.paises p where p.id = p_pais and p.activo;
  if v_tz is null then
    raise exception 'País inexistente o inactivo';
  end if;

  v_local := now() at time zone v_tz;
  v_periodo := to_char(v_local, 'YYYY-MM');
  perform pg_advisory_xact_lock(hashtext(p_pais::text || v_periodo));

  select coalesce(max(c.numero), 0) + 1 into v_numero
  from public.cargas_bitacora c where c.id_pais = p_pais and c.periodo = v_periodo;

  insert into public.cargas_bitacora (id_pais, periodo, numero, fecha_local, nombre_archivo, total_filas)
  values (p_pais, v_periodo, v_numero, v_local::date, p_archivo, coalesce(p_total, 0))
  returning id into v_id;
  return v_id;
end $$;

-- Inserta los registros nuevos (los existentes no se tocan) y liga todos a la carga. Devuelve cuántos son nuevos.
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

revoke execute on function public.abrir_registro(uuid) from public, anon;
revoke execute on function public.actualizar_intento(uuid, text) from public, anon;
revoke execute on function public.crear_carga(uuid, text, integer) from public, anon;
revoke execute on function public.importar_lote(uuid, jsonb) from public, anon;
grant execute on function public.abrir_registro(uuid) to authenticated;
grant execute on function public.actualizar_intento(uuid, text) to authenticated;
grant execute on function public.crear_carga(uuid, text, integer) to authenticated;
grant execute on function public.importar_lote(uuid, jsonb) to authenticated;

-- ===== Vistas (respetan RLS de las tablas base) =====
create view public.v_llamadas_carga with (security_invoker = true) as
select l.*, cr.id_carga
from public.carga_registros cr
join public.llamadas_bienvenida l on l.id = cr.id_llamada;

create view public.v_intentos_llamada with (security_invoker = true) as
select i.id, i.id_pais, i.hora_intento, i.usuario, i.estatus_llamada as estatus_intento, i.id_llamada,
       l.num, l.cliente, l.estado, l.numero_solicitud, l.tipo_credito, l.cedula, l.telefono,
       l.fecha_formalizado, l.promotor
from public.intentos_llamada i
join public.llamadas_bienvenida l on l.id = i.id_llamada;

-- ===== RLS =====
alter table public.paises enable row level security;
alter table public.cargas_bitacora enable row level security;
alter table public.carga_registros enable row level security;
alter table public.intentos_llamada enable row level security;

create policy pol_paises_select on public.paises
  for select to authenticated using ((select public.usuario_activo()));
create policy pol_paises_insert on public.paises
  for insert to authenticated with check ((select public.usuario_es_admin()));
create policy pol_paises_update on public.paises
  for update to authenticated
  using ((select public.usuario_es_admin())) with check ((select public.usuario_es_admin()));

create policy pol_cargas_select on public.cargas_bitacora
  for select to authenticated using ((select public.usuario_activo()));

create policy pol_carga_registros_select on public.carga_registros
  for select to authenticated using ((select public.usuario_activo()));
create policy pol_carga_registros_insert on public.carga_registros
  for insert to authenticated
  with check ((select public.tiene_permiso('registros.crear')) or (select public.tiene_permiso('bitacora.importar')));

create policy pol_intentos_select on public.intentos_llamada
  for select to authenticated using ((select public.tiene_permiso('intentos.ver')));
