-- Vista histórica de número equivocado (para Gerente local: aunque el estatus haya cambiado después)
-- y resumen de % de estatus de llamada "congelado" al cierre del día 4 del mes siguiente.

create view public.v_historial_numero_equivocado with (security_invoker = true) as
select l.*, m.primera_vez, m.veces
from public.llamadas_bienvenida l
join (
  select t.id_llamada, min(t.hora_intento) as primera_vez, count(*) as veces
  from public.intentos_llamada t
  where t.estatus_llamada = 'NUMERO EQUIVOCADO'
  group by t.id_llamada
) m on m.id_llamada = l.id;

create or replace function public.resumen_estatus_periodo(p_pais uuid, p_periodo text)
returns table (
  total_base    integer,
  aceptacion    integer,
  no_aceptacion integer,
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
    count(*) filter (where estatus = 'ACEPTACION')::integer,
    count(*) filter (where estatus = 'NO ACEPTACION')::integer,
    count(*) filter (where estatus = 'BUZON')::integer,
    count(*) filter (where estatus = 'NO CONTESTA')::integer,
    count(*) filter (where estatus = 'DEVOLVER LLAMADA')::integer,
    count(*) filter (where estatus = 'NUMERO EQUIVOCADO')::integer,
    count(*) filter (where estatus is null)::integer
  from base;
end $$;

revoke execute on function public.resumen_estatus_periodo(uuid, text) from public, anon;
grant execute on function public.resumen_estatus_periodo(uuid, text) to authenticated;
