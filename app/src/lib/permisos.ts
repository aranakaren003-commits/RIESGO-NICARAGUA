// Códigos de permiso: deben coincidir con la tabla `permisos` de Supabase.
export const P = {
  registrosVer: 'registros.ver',
  registrosCrear: 'registros.crear',
  registrosEditar: 'registros.editar',
  registrosExportar: 'registros.exportar',
  graficasVer: 'graficas.ver',
  bitacoraImportar: 'bitacora.importar',
  intentosVer: 'intentos.ver',
  gestionLlamadas: 'gestion.llamadas',
  dashboardDescargar: 'dashboard.descargar',
  adminFormulario: 'admin.formulario',
  adminUsuarios: 'admin.usuarios',
} as const

export type Permisos = ReadonlySet<string>
