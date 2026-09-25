import { sb } from './supabase'

const vistaCarga = () => sb.from('v_llamadas_carga')
export type OrigenLlamadas = ReturnType<typeof vistaCarga>

// Con «Todas las cargas» se lee la tabla de registros del país (sin duplicados por carga); si no, la vista de la carga elegida.
export const origenLlamadas = (todas: boolean): OrigenLlamadas =>
  (todas ? sb.from('llamadas_bienvenida') : vistaCarga()) as unknown as OrigenLlamadas
