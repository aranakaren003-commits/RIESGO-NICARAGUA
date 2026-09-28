-- «Llamadas» (gestión de la cola) queda solo para Digitador; «Importar bitácora» queda solo para Analista de Carga de Datos.
delete from public.roles_permisos
where codigo_permiso in ('gestion.llamadas', 'bitacora.importar')
  and id_rol = (select id from public.roles where nombre = 'Administrador');
