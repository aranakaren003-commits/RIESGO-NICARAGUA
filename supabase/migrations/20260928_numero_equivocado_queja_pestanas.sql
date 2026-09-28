-- Número equivocado, queja, llave de crédito en la cola, y reorganización de pestañas (casos sospechosos / número equivocado)

alter table public.llamadas_bienvenida add column numero_pertenece_a text; -- comentario de NÚMERO EQUIVOCADO
alter table public.llamadas_bienvenida add column queja text;

-- Vistas: se recrean para incluir las columnas nuevas y la llave de crédito (Comprobante_Consecutivo, p. ej. JPE_7828)
drop view public.v_llamadas_carga;
create view public.v_llamadas_carga with (security_invoker = true) as
select l.*, cr.id_carga
from public.carga_registros cr
join public.llamadas_bienvenida l on l.id = cr.id_llamada;

drop view public.v_cola_llamadas;
create view public.v_cola_llamadas as
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
  and public.tiene_permiso('gestion.llamadas')
  and public.puede_ver_pais(l.id_pais);

revoke all on public.v_cola_llamadas from anon;
grant select on public.v_cola_llamadas to authenticated;

-- Nuevos permisos: casos con sospecha, número equivocado (vistas de análisis) y vista de prueba del administrador
insert into public.permisos (codigo, modulo, descripcion) values
  ('casos.sospecha.ver',          'Análisis', 'Ver los casos marcados con sospecha'),
  ('casos.numero_equivocado.ver', 'Análisis', 'Ver los casos marcados como número equivocado'),
  ('admin.vista_previa',          'Administración', 'Entrar a una vista de prueba como otro puesto');

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p
  on p.codigo in ('casos.sospecha.ver', 'casos.numero_equivocado.ver', 'admin.vista_previa')
where r.nombre = 'Administrador';

insert into public.roles_permisos (id_rol, codigo_permiso)
select r.id, p.codigo from public.roles r join public.permisos p
  on p.codigo in ('casos.sospecha.ver', 'casos.numero_equivocado.ver')
where r.nombre in ('Gerente regional', 'Gerente local');

-- Las pestañas de Registros y Bitácora de intentos se retiran para Administrador, Gerente regional y Gerente local,
-- reemplazadas por Casos sospechosos, Número equivocado y Dashboard.
delete from public.roles_permisos
where codigo_permiso in ('registros.ver', 'intentos.ver')
  and id_rol in (select id from public.roles where nombre in ('Administrador', 'Gerente regional', 'Gerente local'));

-- El acceso de lectura a llamadas_bienvenida ahora también lo dan los permisos nuevos (por si algún puesto futuro los tiene sin graficas.ver)
drop policy pol_llamadas_select on public.llamadas_bienvenida;
create policy pol_llamadas_select on public.llamadas_bienvenida
  for select to authenticated
  using (
    (select public.puede_ver_pais(id_pais))
    and (
      (select public.tiene_permiso('registros.ver'))
      or (select public.tiene_permiso('graficas.ver'))
      or (select public.tiene_permiso('gestion.llamadas'))
      or (select public.tiene_permiso('casos.sospecha.ver'))
      or (select public.tiene_permiso('casos.numero_equivocado.ver'))
    )
  );
