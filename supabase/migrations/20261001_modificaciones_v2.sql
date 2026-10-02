-- Documento "Modificaciones llamada de Bienvenida versión 2":
-- queja en dos niveles (categoría + detalle, con «Sin Queja»), «Aprobado sin formalizar» lo marca el Digitador desde la cola,
-- ESTADO visible en la cola, lectura de intentos para Dashboard / Número equivocado / Vista de prueba,
-- historial de número equivocado más robusto e importación unificada bitácora + CIT.

-- ===== Queja: categoría (primera lista) + detalle (segunda lista, depende de la categoría) =====
alter table public.llamadas_bienvenida add column queja_categoria text;

update public.llamadas_bienvenida
   set queja_categoria = case
     when queja in ('Recordatorios consecutivos de Cobro', 'Llamadas consecutivas de Cobro', 'Mensaje consecutivos de Cobro') then 'Cobro'
     when queja in ('Atención muy lenta en sucursal', 'No le comentaron el seguro', 'Tiempo de Formalización',
                    'Llamadas por parte de diversos ejecutivos', 'No le entregaron Tarjeta de Pago') then 'Comercial'
     when queja in ('Monto del crédito', 'Tiempo de Legalización (Motos)', 'Tasa de Interes', 'Comisión de Desembolso') then 'Condiciones de Crédito'
     when queja in ('Motorizado Descortés', 'Analista Descortés') then 'DAC'
   end
 where queja is not null and queja_categoria is null;

-- ===== Aprobado sin formalizar: ya no es automático; el Digitador lo marca desde la cola =====
drop trigger if exists trg_llamadas_bienvenida_estado_automatico on public.llamadas_bienvenida;
drop function if exists public.aplicar_estado_automatico();

-- ===== Intentos: los leen también Dashboard (gestiones), Número equivocado (historial) y la Vista de prueba del administrador =====
drop policy pol_intentos_select on public.intentos_llamada;
create policy pol_intentos_select on public.intentos_llamada
  for select to authenticated
  using (
    (select public.puede_ver_pais(id_pais))
    and (
      (select public.tiene_permiso('intentos.ver'))
      or (select public.tiene_permiso('graficas.ver'))
      or (select public.tiene_permiso('casos.numero_equivocado.ver'))
      or (select public.tiene_permiso('gestion.llamadas'))
      or (select public.tiene_permiso('admin.vista_previa'))
    )
  );

-- ===== Historial de número equivocado: estatus actual, intento registrado o ya gestionado =====
drop view public.v_historial_numero_equivocado;
create view public.v_historial_numero_equivocado with (security_invoker = true) as
select l.*, m.primera_vez, coalesce(m.veces, 0)::integer as veces
from public.llamadas_bienvenida l
left join (
  select t.id_llamada, min(t.hora_intento) as primera_vez, count(*) as veces
  from public.intentos_llamada t
  where t.estatus_llamada in ('NUMERO EQUIVOCADO', 'NUMERO EQUIVOCADO GESTIONADO')
  group by t.id_llamada
) m on m.id_llamada = l.id
where l.estatus_llamada = 'NUMERO EQUIVOCADO'
   or l.numero_equivocado_gestionado
   or m.id_llamada is not null;

-- ===== Cola: muestra el ESTADO de la bitácora =====
drop view public.v_cola_llamadas;
create view public.v_cola_llamadas as
select l.id,
       l.id_pais,
       l.periodo,
       l.cliente,
       l.estado,
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

-- ===== registrar_intento: acepta APROBADO SIN FORMALIZAR (saca la línea de la cola, igual que aceptación / no aceptación) =====
create or replace function public.registrar_intento(p_id uuid, p_resultado text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pais uuid;
  v_fecha timestamptz;
  v_usuario text;
  v_intento uuid;
begin
  if p_resultado not in ('NO CONTESTA', 'BUZON', 'CONTESTA', 'APROBADO SIN FORMALIZAR') then
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
  if p_resultado in ('NO CONTESTA', 'BUZON', 'APROBADO SIN FORMALIZAR') then
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

-- ===== % de estatus: ACEPTACION + NO ACEPTACION = CONTESTACION =====
drop function public.resumen_estatus_periodo(uuid, text);
create function public.resumen_estatus_periodo(p_pais uuid, p_periodo text)
returns table (
  total_base    integer,
  contestacion  integer,
  buzon         integer,
  no_contesta   integer,
  devolver_llamada integer,
  numero_equivocado integer,
  sin_estatus   integer
) language plpgsql stable security definer set search_path = public as $$
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
  select
    count(*)::integer,
    count(*) filter (where estatus in ('ACEPTACION', 'NO ACEPTACION'))::integer,
    count(*) filter (where estatus = 'BUZON')::integer,
    count(*) filter (where estatus = 'NO CONTESTA')::integer,
    count(*) filter (where estatus = 'DEVOLVER LLAMADA')::integer,
    count(*) filter (where estatus in ('NUMERO EQUIVOCADO', 'NUMERO EQUIVOCADO GESTIONADO'))::integer,
    count(*) filter (where estatus is null or estatus = 'CONTESTA')::integer
  from base;
end $$;

revoke execute on function public.resumen_estatus_periodo(uuid, text) from public, anon;
grant execute on function public.resumen_estatus_periodo(uuid, text) to authenticated;

-- ===== Importación unificada bitácora + CIT: la pestaña única la usa quien tiene bitacora.importar =====
-- El Analista de Carga de Datos ya tiene ambos permisos; el CIT se aplica junto con la bitácora.
insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, 'cit.importar' from public.roles r
where exists (select 1 from public.roles_permisos rp where rp.id_rol = r.id and rp.codigo_permiso = 'bitacora.importar')
on conflict do nothing;
