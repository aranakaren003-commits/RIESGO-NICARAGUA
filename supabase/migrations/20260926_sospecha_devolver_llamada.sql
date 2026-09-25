-- Adquirió la asistencia, caso con sospecha, devolver llamada; correo/sucursal/origen desde la bitácora

alter table public.llamadas_bienvenida add column adquirio_asistencia text;
alter table public.llamadas_bienvenida add column caso_sospecha text;
alter table public.llamadas_bienvenida add column devolver_llamada_en timestamptz;
alter table public.llamadas_bienvenida
  add constraint ck_llamadas_bienvenida_caso_sospecha check (caso_sospecha is null or caso_sospecha in ('SI', 'NO'));

-- SUCURSAL y ORIGEN vienen de la bitácora y no se editan: solo los cambia la importación
create or replace function public.proteger_campos_bitacora()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.importando', true), '') <> '1' then
    new.sucursal := old.sucursal;
    new.origen := old.origen;
  end if;
  return new;
end $$;

create trigger trg_llamadas_bienvenida_proteger_bitacora
  before update on public.llamadas_bienvenida
  for each row execute function public.proteger_campos_bitacora();

-- Vistas: se recrean para incluir las columnas nuevas
drop view public.v_llamadas_carga;
create view public.v_llamadas_carga with (security_invoker = true) as
select l.*, cr.id_carga
from public.carga_registros cr
join public.llamadas_bienvenida l on l.id = cr.id_llamada;

drop view public.v_cola_llamadas;
-- Prioridad: 0 = devolver llamada vigente (desde 5 min antes de la hora acordada), 1 sin asignar, 2 no contesta, 3 buzón, 4 devolver llamada futura
create view public.v_cola_llamadas as
select l.id,
       l.id_pais,
       l.cliente,
       l.tipo_credito,
       l.telefono,
       l.cedula,
       l.fecha_formalizado,
       l.estatus_llamada,
       l.caso_sospecha,
       l.devolver_llamada_en,
       coalesce(i.n, 0)::integer as intentos,
       case
         when l.estatus_llamada = 'DEVOLVER LLAMADA' and l.devolver_llamada_en is not null and l.devolver_llamada_en <= now() + interval '5 minutes' then 0
         when l.estatus_llamada is null then 1
         when l.estatus_llamada = 'NO CONTESTA' then 2
         when l.estatus_llamada = 'BUZON' then 3
         else 4
       end as orden_estatus
from public.llamadas_bienvenida l
left join (select t.id_llamada, count(*) as n from public.intentos_llamada t group by t.id_llamada) i on i.id_llamada = l.id
where (l.estatus_llamada is null or l.estatus_llamada in ('NO CONTESTA', 'BUZON', 'DEVOLVER LLAMADA'))
  and public.tiene_permiso('gestion.llamadas')
  and public.puede_ver_pais(l.id_pais);

revoke all on public.v_cola_llamadas from anon;
grant select on public.v_cola_llamadas to authenticated;

-- Un nuevo NO CONTESTA / BUZON cancela una devolución de llamada pendiente
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
    update public.llamadas_bienvenida set estatus_llamada = p_resultado, devolver_llamada_en = null where id = p_id;
  end if;
  perform set_config('app.permitir_fecha_hora', '', true);

  select l.fecha_hora_llamada into v_fecha from public.llamadas_bienvenida l where l.id = p_id;
  select p.email into v_usuario from public.perfiles_usuario p where p.user_id = auth.uid();

  insert into public.intentos_llamada (id_llamada, id_pais, usuario, estatus_llamada)
  values (p_id, v_pais, v_usuario, p_resultado)
  returning id into v_intento;

  return jsonb_build_object('fecha_hora_llamada', v_fecha, 'id_intento', v_intento);
end $$;

-- Importación: además de insertar los registros nuevos, completa correo (si no tiene), sucursal y origen desde la bitácora
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
  with ins as (
    insert into public.llamadas_bienvenida as l
      (id_pais, periodo, cliente, estado, informa, numero_solicitud, cedula, telefono, lugar_trabajo,
       fecha_formalizado, tipo_credito, promotor, categorizacion, modalidad, email, sucursal, origen)
    select v_pais, x.periodo, x.cliente, x.estado, x.informa, x.numero_solicitud, x.cedula, x.telefono, x.lugar_trabajo,
           x.fecha_formalizado, x.tipo_credito, x.promotor, x.categorizacion, x.modalidad, x.email, x.sucursal, x.origen
    from jsonb_to_recordset(p_filas) as x(
      periodo text, cliente text, estado text, informa text, numero_solicitud bigint, cedula text, telefono text,
      lugar_trabajo text, fecha_formalizado timestamptz, tipo_credito text, promotor text, categorizacion text, modalidad text,
      email text, sucursal text, origen text)
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
