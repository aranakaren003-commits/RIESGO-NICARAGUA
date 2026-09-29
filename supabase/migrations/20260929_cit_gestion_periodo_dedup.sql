-- Documento "Modificaciones llamada de Bienvenida": CIT, período por cierre de mes, deduplicación por cédula,
-- primera/última gestión, número equivocado gestionado, devolver llamada a 10 min, estados de importación,
-- reorganización de permisos por puesto.

-- ===== Primera y última gestión =====
alter table public.llamadas_bienvenida rename column fecha_hora_llamada to fecha_hora_primera_gestion;
alter table public.llamadas_bienvenida add column fecha_hora_ultima_gestion timestamptz;
alter table public.llamadas_bienvenida add column numero_equivocado_gestionado boolean not null default false;

-- ===== CIT: histórico de cargas + registros que reasignan el período de la bitácora =====
create table public.cargas_cit (
  id             uuid        not null default gen_random_uuid(),
  id_pais        uuid        not null,
  periodo        text        not null, -- período en que se cargó el archivo (no el período que asigna)
  numero         integer     not null,
  fecha_local    date        not null,
  fecha_carga    timestamptz not null default now(),
  nombre_archivo text,
  total_filas    integer     not null default 0,
  actualizados   integer     not null default 0,
  cargado_por    uuid        default auth.uid(),
  constraint pk_cargas_cit primary key (id),
  constraint fk_cargas_cit_paises foreign key (id_pais) references public.paises (id) on delete restrict,
  constraint fk_cargas_cit_cargado_por foreign key (cargado_por) references auth.users (id) on delete set null,
  constraint uq_cargas_cit_pais_periodo_numero unique (id_pais, periodo, numero),
  constraint ck_cargas_cit_periodo check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

create table public.cit_registros (
  id                    uuid        not null default gen_random_uuid(),
  id_carga_cit          uuid        not null,
  id_pais               uuid        not null,
  llave_credito         text        not null,
  f_ultima_formalizacion date       not null,
  periodo_asignado      text        not null,
  id_llamada            uuid, -- null si no hubo coincidencia en la bitácora
  creado_en             timestamptz not null default now(),
  constraint pk_cit_registros primary key (id),
  constraint fk_cit_registros_carga foreign key (id_carga_cit) references public.cargas_cit (id) on delete cascade,
  constraint fk_cit_registros_paises foreign key (id_pais) references public.paises (id) on delete restrict,
  constraint fk_cit_registros_llamada foreign key (id_llamada) references public.llamadas_bienvenida (id) on delete set null
);
create index ix_cit_registros_llamada on public.cit_registros (id_llamada);
create index ix_cit_registros_carga on public.cit_registros (id_carga_cit);

alter table public.cargas_cit enable row level security;
alter table public.cit_registros enable row level security;
create policy pol_cargas_cit_select on public.cargas_cit for select to authenticated using ((select public.puede_ver_pais(id_pais)));
create policy pol_cit_registros_select on public.cit_registros for select to authenticated using ((select public.puede_ver_pais(id_pais)));

-- ===== Permisos nuevos =====
insert into public.permisos (codigo, modulo, descripcion) values
  ('cit.importar', 'Importar', 'Importar el archivo CIT (reasigna el período de la bitácora)');

-- Reorganización de pestañas por puesto:
-- Gerente regional: solo Dashboard (se retiran Casos sospechosos y Número equivocado).
delete from public.roles_permisos
where codigo_permiso in ('casos.sospecha.ver', 'casos.numero_equivocado.ver')
  and id_rol = (select id from public.roles where nombre = 'Gerente regional');

-- Gerente local: recupera Bitácora de intentos.
insert into public.roles_permisos (id_rol, codigo_permiso)
select id, 'intentos.ver' from public.roles where nombre = 'Gerente local'
on conflict do nothing;

-- Analista de Carga de Datos: Importar CIT, Dashboard y Bitácora de intentos.
insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p
  on p.codigo in ('cit.importar', 'graficas.ver', 'dashboard.descargar', 'intentos.ver')
where r.nombre = 'Analista de Carga de Datos'
on conflict do nothing;

-- Administrador conserva acceso a todo lo nuevo.
insert into public.roles_permisos (id_rol, codigo_permiso)
select id, 'cit.importar' from public.roles where nombre = 'Administrador'
on conflict do nothing;

-- ===== v_cola_llamadas: ventana de devolver llamada 5 -> 10 min, incluye periodo, quita caso_sospecha (solo lo ve Gerente local en su propia pestaña) =====
drop view public.v_cola_llamadas;
create view public.v_cola_llamadas as
select l.id,
       l.id_pais,
       l.periodo,
       l.cliente,
       l.tipo_credito,
       regexp_replace(l.informa, '^([^0-9]+)([0-9]+)$', '\1_\2') as llave_credito,
       l.telefono,
       l.cedula,
       l.fecha_formalizado,
       l.estatus_llamada,
       l.devolver_llamada_en,
       coalesce(i.n, 0)::integer as intentos,
       case
         when l.estatus_llamada = 'DEVOLVER LLAMADA' and l.devolver_llamada_en is not null and l.devolver_llamada_en <= now() + interval '10 minutes' then 0
         when l.estatus_llamada is null then 1
         when l.estatus_llamada = 'NO CONTESTA' then 2
         when l.estatus_llamada = 'BUZON' then 3
         else 4
       end as orden_estatus
from public.llamadas_bienvenida l
left join (select t.id_llamada, count(*) as n from public.intentos_llamada t group by t.id_llamada) i on i.id_llamada = l.id
where (l.estatus_llamada is null or l.estatus_llamada in ('NO CONTESTA', 'BUZON', 'DEVOLVER LLAMADA'))
  and (public.tiene_permiso('gestion.llamadas') or public.tiene_permiso('registros.editar'))
  and public.puede_ver_pais(l.id_pais);

revoke all on public.v_cola_llamadas from anon;
grant select on public.v_cola_llamadas to authenticated;

-- ===== registrar_intento: usa fecha_hora_primera_gestion + fecha_hora_ultima_gestion, y ya no rompe el número equivocado =====
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
  update public.llamadas_bienvenida
     set fecha_hora_primera_gestion = coalesce(fecha_hora_primera_gestion, now()),
         fecha_hora_ultima_gestion = now()
   where id = p_id;
  if p_resultado in ('NO CONTESTA', 'BUZON') then
    update public.llamadas_bienvenida set estatus_llamada = p_resultado, devolver_llamada_en = null where id = p_id;
  end if;
  perform set_config('app.permitir_fecha_hora', '', true);

  select l.fecha_hora_primera_gestion into v_fecha from public.llamadas_bienvenida l where l.id = p_id;
  select p.email into v_usuario from public.perfiles_usuario p where p.user_id = auth.uid();

  insert into public.intentos_llamada (id_llamada, id_pais, usuario, estatus_llamada)
  values (p_id, v_pais, v_usuario, p_resultado)
  returning id into v_intento;

  return jsonb_build_object('fecha_hora_primera_gestion', v_fecha, 'id_intento', v_intento);
end $$;

-- actualizar_intento: también actualiza fecha_hora_ultima_gestion
create or replace function public.actualizar_intento(p_id uuid, p_estatus text)
returns void language plpgsql security definer set search_path = public as $$
declare v_llamada uuid;
begin
  update public.intentos_llamada set estatus_llamada = p_estatus where id = p_id and user_id = auth.uid()
  returning id_llamada into v_llamada;
  if v_llamada is not null then
    update public.llamadas_bienvenida set fecha_hora_ultima_gestion = now() where id = v_llamada;
  end if;
end $$;

-- proteger_fecha_hora_llamada: ahora protege fecha_hora_primera_gestion (fecha_hora_ultima_gestion sí cambia siempre)
create or replace function public.proteger_fecha_hora_llamada()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.permitir_fecha_hora', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.fecha_hora_primera_gestion := null;
    else
      new.fecha_hora_primera_gestion := old.fecha_hora_primera_gestion;
    end if;
  end if;
  return new;
end $$;

-- ===== Número equivocado: marcar gestionado (cuenta como intento) =====
create or replace function public.marcar_numero_equivocado_gestionado(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pais uuid;
  v_usuario text;
  v_intento uuid;
begin
  if not (public.tiene_permiso('gestion.llamadas') or public.tiene_permiso('registros.editar')) then
    raise exception 'Sin permiso para gestionar llamadas';
  end if;
  select l.id_pais into v_pais from public.llamadas_bienvenida l where l.id = p_id and l.estatus_llamada = 'NUMERO EQUIVOCADO';
  if v_pais is null then
    raise exception 'El registro no está en número equivocado';
  end if;
  if not public.puede_ver_pais(v_pais) then
    raise exception 'Sin permiso sobre este país';
  end if;

  update public.llamadas_bienvenida
     set numero_equivocado_gestionado = true,
         fecha_hora_ultima_gestion = now()
   where id = p_id;

  select p.email into v_usuario from public.perfiles_usuario p where p.user_id = auth.uid();
  insert into public.intentos_llamada (id_llamada, id_pais, usuario, estatus_llamada)
  values (p_id, v_pais, v_usuario, 'NUMERO EQUIVOCADO GESTIONADO')
  returning id into v_intento;

  return jsonb_build_object('id_intento', v_intento);
end $$;

revoke execute on function public.marcar_numero_equivocado_gestionado(uuid) from public, anon;
grant execute on function public.marcar_numero_equivocado_gestionado(uuid) to authenticated;

-- ===== Aprobado sin formalizar: automático según el ESTADO de la bitácora, igual que ACEPTACION saca la línea de la cola =====
create or replace function public.aplicar_estado_automatico()
returns trigger language plpgsql as $$
begin
  if new.estatus_llamada is null and upper(trim(coalesce(new.estado, ''))) = 'APROBADO INFORMA' then
    new.estatus_llamada := 'APROBADO SIN FORMALIZAR';
  end if;
  return new;
end $$;

create trigger trg_llamadas_bienvenida_estado_automatico
  before insert on public.llamadas_bienvenida
  for each row execute function public.aplicar_estado_automatico();

-- backfill de lo ya importado
update public.llamadas_bienvenida
   set estatus_llamada = 'APROBADO SIN FORMALIZAR'
 where estatus_llamada is null and upper(trim(coalesce(estado, ''))) = 'APROBADO INFORMA';

-- ===== crear_carga / importar_lote: deduplica por cédula dentro del mismo país+período, aplica estado automático =====
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

  perform set_config('app.importando', '1', true);
  with numeradas as (
    select x.*,
           row_number() over (partition by x.periodo, x.cedula order by x.ord) as rn
    from jsonb_to_recordset(p_filas) as x(
      periodo text, cliente text, estado text, informa text, numero_solicitud bigint, cedula text, telefono text,
      lugar_trabajo text, fecha_formalizado timestamptz, tipo_credito text, promotor text, categorizacion text, modalidad text,
      email text, sucursal text, origen text, ord integer)
  ),
  -- se descarta dentro del mismo lote toda fila cuya cédula ya apareció antes en el lote, para el mismo período
  -- (las filas sin cédula nunca se deduplican entre sí)
  filas as (
    select * from numeradas where cedula is null or rn = 1
  ),
  ins as (
    insert into public.llamadas_bienvenida as l
      (id_pais, periodo, cliente, estado, informa, numero_solicitud, cedula, telefono, lugar_trabajo,
       fecha_formalizado, tipo_credito, promotor, categorizacion, modalidad, email, sucursal, origen)
    select v_pais, f.periodo, f.cliente, f.estado, f.informa, f.numero_solicitud, f.cedula, f.telefono, f.lugar_trabajo,
           f.fecha_formalizado, f.tipo_credito, f.promotor, f.categorizacion, f.modalidad, f.email, f.sucursal, f.origen
    from filas f
    where f.cedula is null or not exists (
      select 1 from public.llamadas_bienvenida ex
      where ex.id_pais = v_pais and ex.periodo = f.periodo and ex.cedula = f.cedula
    )
    on conflict (id_pais, numero_solicitud) do update
      set sucursal = coalesce(excluded.sucursal, l.sucursal),
          origen = coalesce(excluded.origen, l.origen),
          email = coalesce(l.email, excluded.email)
      where (l.sucursal, l.origen, l.email)
            is distinct from (coalesce(excluded.sucursal, l.sucursal), coalesce(excluded.origen, l.origen), coalesce(l.email, excluded.email))
    returning (xmax = 0) as nuevo
  )
  select count(*) filter (where nuevo) into v_nuevos from ins;
  perform set_config('app.importando', '', true);

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

-- ===== CIT: crear carga y aplicar (reasigna periodo por llave de crédito) =====
create or replace function public.crear_carga_cit(p_pais uuid, p_archivo text, p_total integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
  v_local timestamp;
  v_periodo text;
  v_numero integer;
  v_id uuid;
begin
  if not public.tiene_permiso('cit.importar') then
    raise exception 'Sin permiso para importar el CIT';
  end if;
  select p.zona_horaria into v_tz from public.paises p where p.id = p_pais and p.activo;
  if v_tz is null then
    raise exception 'País inexistente o inactivo';
  end if;
  v_local := now() at time zone v_tz;
  v_periodo := to_char(v_local, 'YYYY-MM');
  perform pg_advisory_xact_lock(hashtext('cit-' || p_pais::text || v_periodo));
  select coalesce(max(c.numero), 0) + 1 into v_numero from public.cargas_cit c where c.id_pais = p_pais and c.periodo = v_periodo;
  insert into public.cargas_cit (id_pais, periodo, numero, fecha_local, nombre_archivo, total_filas)
  values (p_pais, v_periodo, v_numero, v_local::date, p_archivo, coalesce(p_total, 0))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.importar_cit_lote(p_carga uuid, p_filas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_pais uuid;
  v_actualizados integer := 0;
begin
  if not public.tiene_permiso('cit.importar') then
    raise exception 'Sin permiso para importar el CIT';
  end if;
  select c.id_pais into v_pais from public.cargas_cit c where c.id = p_carga;
  if v_pais is null then
    raise exception 'Carga inexistente';
  end if;

  with filas as (
    select x.llave_credito, x.f_ultima_formalizacion, to_char(x.f_ultima_formalizacion, 'YYYY-MM') as periodo
    from jsonb_to_recordset(p_filas) as x(llave_credito text, f_ultima_formalizacion date)
  ),
  actualizadas as (
    update public.llamadas_bienvenida l
       set periodo = f.periodo
      from filas f
     where l.id_pais = v_pais
       and regexp_replace(l.informa, '^([^0-9]+)([0-9]+)$', '\1_\2') = f.llave_credito
       and l.periodo is distinct from f.periodo
     returning l.id, f.llave_credito, f.f_ultima_formalizacion, f.periodo
  ),
  -- filas del CIT que no coincidieron con ningún crédito de la bitácora (quedan como constancia, sin id_llamada)
  sin_match as (
    select f.llave_credito, f.f_ultima_formalizacion, f.periodo
    from filas f
    where not exists (
      select 1 from public.llamadas_bienvenida l
      where l.id_pais = v_pais and regexp_replace(l.informa, '^([^0-9]+)([0-9]+)$', '\1_\2') = f.llave_credito
    )
  ),
  todas as (
    select llave_credito, f_ultima_formalizacion, periodo, id as id_llamada from actualizadas
    union all
    select llave_credito, f_ultima_formalizacion, periodo, null::uuid as id_llamada from sin_match
  )
  insert into public.cit_registros (id_carga_cit, id_pais, llave_credito, f_ultima_formalizacion, periodo_asignado, id_llamada)
  select p_carga, v_pais, t.llave_credito, t.f_ultima_formalizacion, t.periodo, t.id_llamada
  from todas t;

  select count(*) into v_actualizados from public.cit_registros where id_carga_cit = p_carga and id_llamada is not null;
  update public.cargas_cit set actualizados = v_actualizados where id = p_carga;
  return v_actualizados;
end $$;

revoke execute on function public.crear_carga_cit(uuid, text, integer) from public, anon;
revoke execute on function public.importar_cit_lote(uuid, jsonb) from public, anon;
grant execute on function public.crear_carga_cit(uuid, text, integer) to authenticated;
grant execute on function public.importar_cit_lote(uuid, jsonb) to authenticated;

-- ===== % de estatus de llamada "congelado" al día 5 del mes siguiente (cierre del día 4) =====
-- Usa el historial de intentos como aproximación del estatus vigente en ese momento.
create or replace function public.estatus_al_corte(p_id_llamada uuid, p_corte timestamptz)
returns text language sql stable as $$
  select t.estatus_llamada
  from public.intentos_llamada t
  where t.id_llamada = p_id_llamada and t.hora_intento <= p_corte
  order by t.hora_intento desc
  limit 1
$$;

-- Corte oficial de un período (aaaa-mm) para un país: 00:00 del día 5 del mes siguiente, hora local del país.
create or replace function public.corte_de_periodo(p_pais uuid, p_periodo text)
returns timestamptz language plpgsql stable as $$
declare v_tz text; v_anio int; v_mes int;
begin
  select zona_horaria into v_tz from public.paises where id = p_pais;
  v_anio := split_part(p_periodo, '-', 1)::int;
  v_mes := split_part(p_periodo, '-', 2)::int;
  return (make_date(v_anio, v_mes, 1) + interval '1 month' + interval '4 days')::timestamp at time zone v_tz;
end $$;
