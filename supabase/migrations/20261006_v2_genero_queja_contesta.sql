-- Versión 2 de modificaciones: género, queja en dos niveles, estatus CONTESTA (guardado sin terminar),
-- categorización solo Crédito Nuevo / Refinanciamiento, y permiso de intentos para el Administrador.

alter table public.llamadas_bienvenida add column if not exists queja_categoria text;
alter table public.llamadas_bienvenida add column if not exists genero text;
alter table public.llamadas_bienvenida drop constraint if exists ck_llamadas_bienvenida_genero;
alter table public.llamadas_bienvenida add constraint ck_llamadas_bienvenida_genero
  check (genero is null or genero in ('MASCULINO', 'FEMENINO'));

-- Categorización: solo CREDITO NUEVO y REFINANCIAMIENTO
update public.llamadas_bienvenida set categorizacion = 'CREDITO NUEVO' where upper(trim(categorizacion)) = 'NUEVO';
update public.llamadas_bienvenida set categorizacion = null
 where categorizacion is not null and categorizacion not in ('CREDITO NUEVO', 'REFINANCIAMIENTO');

-- Queja: la opción elegida (detalle) conserva su columna; se agrega la categoría
update public.llamadas_bienvenida set queja_categoria = case
  when queja in ('Recordatorios consecutivos de Cobro', 'Llamadas consecutivas de Cobro', 'Mensaje consecutivos de Cobro') then 'Cobro'
  when queja in ('Atención muy lenta en sucursal', 'No le comentaron el seguro', 'Tiempo de Formalización', 'Llamadas por parte de diversos ejecutivos', 'No le entregaron Tarjeta de Pago') then 'Comercial'
  when queja in ('Monto del crédito', 'Tiempo de Legalización (Motos)', 'Tasa de Interes', 'Comisión de Desembolso') then 'Condiciones de Crédito'
  when queja in ('Motorizado Descortés', 'Analista Descortés') then 'DAC'
  else null end
 where queja is not null and queja_categoria is null;

-- El Administrador ve intentos (la vista de prueba como Gerente local/Analista depende de este permiso)
insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, 'intentos.ver' from public.roles r where r.nombre = 'Administrador'
on conflict do nothing;

-- Cola del Digitador: ESTADO y número de solicitud visibles; CONTESTA (guardado sin terminar) sigue en la cola
drop view if exists public.v_cola_llamadas;
create view public.v_cola_llamadas as
select l.id, l.id_pais, l.periodo, l.cliente, l.tipo_credito,
       regexp_replace(l.informa, '^([^0-9]+)([0-9]+)$', '\1_\2') as llave_credito,
       l.telefono, l.cedula, l.fecha_formalizado, l.estatus_llamada, l.devolver_llamada_en,
       coalesce(i.n, 0)::integer as intentos,
       case
         when l.estatus_llamada = 'DEVOLVER LLAMADA' and l.devolver_llamada_en is not null and l.devolver_llamada_en <= now() + interval '10 minutes' then 0
         when l.estatus_llamada = 'CONTESTA' then 0
         when l.estatus_llamada is null then 1
         when l.estatus_llamada = 'NO CONTESTA' then 2
         when l.estatus_llamada = 'BUZON' then 3
         else 4
       end as orden_estatus,
       l.estado, l.numero_solicitud
  from public.llamadas_bienvenida l
  left join (select t.id_llamada, count(*) as n from public.intentos_llamada t group by t.id_llamada) i on i.id_llamada = l.id
 where (l.estatus_llamada is null or l.estatus_llamada in ('NO CONTESTA', 'BUZON', 'DEVOLVER LLAMADA', 'CONTESTA'))
   and (public.tiene_permiso('gestion.llamadas') or public.tiene_permiso('registros.editar'))
   and public.puede_ver_pais(l.id_pais);
grant select on public.v_cola_llamadas to authenticated;

-- Vistas que exponen columnas de llamadas_bienvenida (se recrean para incluir las nuevas)
drop view if exists public.v_historial_numero_equivocado;
create view public.v_historial_numero_equivocado with (security_invoker = true) as
select l.*, m.primera_vez, m.veces
  from public.llamadas_bienvenida l
  join (select t.id_llamada, min(t.hora_intento) as primera_vez, count(*) as veces
          from public.intentos_llamada t where t.estatus_llamada = 'NUMERO EQUIVOCADO' group by t.id_llamada) m on m.id_llamada = l.id;

drop view if exists public.v_llamadas_carga;
create view public.v_llamadas_carga with (security_invoker = true) as
select l.*, cr.id_carga
  from public.carga_registros cr
  join public.llamadas_bienvenida l on l.id = cr.id_llamada;

-- Resumen por período: una llamada en gestión (CONTESTA sin terminar) cuenta como sin estatus
create or replace function public.resumen_estatus_periodo(p_pais uuid, p_periodo text)
returns table (total_base int, aceptacion int, no_aceptacion int, buzon int, no_contesta int,
               devolver_llamada int, numero_equivocado int, sin_estatus int)
language plpgsql stable security definer set search_path = public as $$
declare v_corte timestamptz;
begin
  if not public.puede_ver_pais(p_pais) then
    raise exception 'Sin permiso sobre este país';
  end if;
  v_corte := public.corte_de_periodo(p_pais, p_periodo);
  return query
  with base as (
    select l.id, public.estatus_al_corte(l.id, v_corte) as estatus
      from public.llamadas_bienvenida l
     where l.id_pais = p_pais and l.periodo = p_periodo
       and coalesce(l.estatus_llamada, '') <> 'APROBADO SIN FORMALIZAR'
  )
  select count(*)::int,
         count(*) filter (where estatus = 'ACEPTACION')::int,
         count(*) filter (where estatus = 'NO ACEPTACION')::int,
         count(*) filter (where estatus = 'BUZON')::int,
         count(*) filter (where estatus = 'NO CONTESTA')::int,
         count(*) filter (where estatus = 'DEVOLVER LLAMADA')::int,
         count(*) filter (where estatus = 'NUMERO EQUIVOCADO')::int,
         count(*) filter (where estatus is null or estatus = 'CONTESTA')::int
    from base;
end $$;

-- Continuar una solicitud guardada sin terminar (CONTESTA): devuelve el intento abierto para cerrarlo con el estatus final
create or replace function public.intento_contesta_abierto(p_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_pais uuid; v_intento uuid;
begin
  if not (public.tiene_permiso('gestion.llamadas') or public.tiene_permiso('registros.editar')) then
    raise exception 'Sin permiso para gestionar llamadas';
  end if;
  select l.id_pais into v_pais from public.llamadas_bienvenida l where l.id = p_id;
  if v_pais is null or not public.puede_ver_pais(v_pais) then
    raise exception 'Sin permiso sobre este registro';
  end if;
  select t.id into v_intento from public.intentos_llamada t
   where t.id_llamada = p_id and t.estatus_llamada = 'CONTESTA'
   order by t.hora_intento desc limit 1;
  return v_intento;
end $$;

create or replace function public.actualizar_intento(p_id uuid, p_estatus text)
returns void language plpgsql security definer set search_path = public as $$
declare v_llamada uuid; v_pais uuid;
begin
  if not (public.tiene_permiso('gestion.llamadas') or public.tiene_permiso('registros.editar')) then
    raise exception 'Sin permiso para gestionar llamadas';
  end if;
  select i.id_pais into v_pais from public.intentos_llamada i where i.id = p_id;
  if v_pais is null or not public.puede_ver_pais(v_pais) then
    raise exception 'Sin permiso sobre este registro';
  end if;
  update public.intentos_llamada set estatus_llamada = p_estatus where id = p_id
  returning id_llamada into v_llamada;
  if v_llamada is not null then
    update public.llamadas_bienvenida set fecha_hora_ultima_gestion = now() where id = v_llamada;
  end if;
end $$;
