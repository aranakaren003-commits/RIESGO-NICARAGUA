export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Llamada = {
  id: string
  num: number
  periodo: string
  cliente: string
  estado: string | null
  informa: string | null
  numero_solicitud: number
  cedula: string | null
  telefono: string | null
  lugar_trabajo: string | null
  fecha_formalizado: string | null
  estatus_llamada: string | null
  comentario_fecha_hora: string | null
  tipo_credito: string | null
  promotor: string | null
  categorizacion: string | null
  modalidad: string | null
  atencion_tramite: string | null
  atencion_ejecutivo: string | null
  nombre_ejecutivo: string | null
  calificacion_gestion: string | null
  tipo_desembolso: string | null
  atencion_analista: string | null
  atencion_formalizador: string | null
  conoce_asistencias: string | null
  ofrecieron_asistencia: string | null
  entregaron_documentacion: string | null
  claro_informacion: string | null
  conforme_fechas_pago: string | null
  pregunta_ab: string | null
  nombre_dealer: string | null
  pregunta_ad: string | null
  pregunta_ae: string | null
  pregunta_af: string | null
  pregunta_ag: string | null
  pregunta_ah: string | null
  nombre_analista: string | null
  comentario_sugerencia: string | null
  email: string | null
  correo_agre_x_control: string | null
  sucursal: string | null
  origen: string | null
  fechas_pago: string | null
  no_conforme_fechas_pago: string | null
  medio_notificacion: string | null
  creado_por: string | null
  actualizado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type PerfilUsuario = {
  user_id: string
  email: string | null
  nombre: string | null
  rol: string
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export type Database = {
  public: {
    Tables: {
      llamadas_bienvenida: {
        Row: Llamada
        Insert: Partial<Omit<Llamada, 'num'>> & Pick<Llamada, 'cliente' | 'numero_solicitud' | 'periodo'>
        Update: Partial<Omit<Llamada, 'num'>>
        Relationships: []
      }
      perfiles_usuario: {
        Row: PerfilUsuario
        Insert: Partial<PerfilUsuario> & Pick<PerfilUsuario, 'user_id'>
        Update: Partial<PerfilUsuario>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      usuario_activo: { Args: never; Returns: boolean }
      usuario_es_admin: { Args: never; Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
