-- v_cola_llamadas exigía específicamente 'gestion.llamadas'; ahora acepta también 'registros.editar'
-- (el mismo criterio que ya usa registrar_intento), para que un administrador vea la cola real en la vista de prueba.
create or replace view public.v_cola_llamadas as
select l.id,
       l.id_pais,
       l.cliente,
       l.tipo_credito,
       regexp_replace(l.informa, '^([^0-9]+)([0-9]+)$', '\1_\2') as llave_credito,
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
  and (public.tiene_permiso('gestion.llamadas') or public.tiene_permiso('registros.editar'))
  and public.puede_ver_pais(l.id_pais);
