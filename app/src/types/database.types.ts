export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Llamada = {
  id: string
  id_pais: string
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
  comentario_llamada: string | null
  fecha_hora_llamada: string | null
  devolver_llamada_en: string | null
  caso_sospecha: string | null
  adquirio_asistencia: string | null
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
  id_rol: string
  id_pais: string | null // null = perfil regional
  activo: boolean
  eliminado_en: string | null
  debe_cambiar_clave: boolean
  creado_en: string
  actualizado_en: string
}

export type Rol = {
  id: string
  nombre: string
  descripcion: string | null
  es_sistema: boolean
  ambito: 'regional' | 'pais' | 'ambos'
  creado_en: string
  actualizado_en: string
}

export type CampoConfig = { id_pais: string; campo: string; obligatorio: boolean; actualizado_en: string }

export type VCola = {
  id: string
  id_pais: string
  cliente: string
  tipo_credito: string | null
  telefono: string | null
  cedula: string | null
  fecha_formalizado: string | null
  estatus_llamada: string | null
  caso_sospecha: string | null
  devolver_llamada_en: string | null
  intentos: number
  orden_estatus: number // 0 = devolver llamada vigente, 1 sin asignar, 2 no contesta, 3 buzón, 4 devolver llamada futura
}

export type Permiso = {
  codigo: string
  modulo: string
  descripcion: string
}

export type RolPermiso = {
  id_rol: string
  codigo_permiso: string
}

export type Pais = {
  id: string
  codigo: string
  nombre: string
  zona_horaria: string
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export type CargaBitacora = {
  id: string
  id_pais: string
  periodo: string
  numero: number
  fecha_local: string
  fecha_carga: string
  nombre_archivo: string | null
  total_filas: number
  total_importadas: number
  nuevos: number
  cargado_por: string | null
}

export type CargaRegistro = { id_carga: string; id_llamada: string }

export type IntentoLlamada = {
  id: string
  id_llamada: string
  id_pais: string
  user_id: string | null
  usuario: string | null
  hora_intento: string
  estatus_llamada: string | null
}

export type VLlamadaCarga = Llamada & { id_carga: string }

export type VIntento = {
  id: string
  id_pais: string
  hora_intento: string
  usuario: string | null
  estatus_intento: string | null
  id_llamada: string
  num: number
  cliente: string
  estado: string | null
  numero_solicitud: number
  tipo_credito: string | null
  cedula: string | null
  telefono: string | null
  fecha_formalizado: string | null
  promotor: string | null
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
      paises: {
        Row: Pais
        Insert: Partial<Pais> & Pick<Pais, 'codigo' | 'nombre' | 'zona_horaria'>
        Update: Partial<Pais>
        Relationships: []
      }
      cargas_bitacora: {
        Row: CargaBitacora
        Insert: Partial<CargaBitacora> & Pick<CargaBitacora, 'id_pais' | 'periodo' | 'numero' | 'fecha_local'>
        Update: Partial<CargaBitacora>
        Relationships: []
      }
      carga_registros: {
        Row: CargaRegistro
        Insert: CargaRegistro
        Update: Partial<CargaRegistro>
        Relationships: []
      }
      intentos_llamada: {
        Row: IntentoLlamada
        Insert: Partial<IntentoLlamada> & Pick<IntentoLlamada, 'id_llamada' | 'id_pais'>
        Update: Partial<IntentoLlamada>
        Relationships: []
      }
      campos_formulario_config: {
        Row: CampoConfig
        Insert: Partial<CampoConfig> & Pick<CampoConfig, 'id_pais' | 'campo'>
        Update: Partial<CampoConfig>
        Relationships: []
      }
      roles: {
        Row: Rol
        Insert: Partial<Rol> & Pick<Rol, 'nombre'>
        Update: Partial<Rol>
        Relationships: []
      }
      permisos: {
        Row: Permiso
        Insert: Permiso
        Update: Partial<Permiso>
        Relationships: []
      }
      roles_permisos: {
        Row: RolPermiso
        Insert: RolPermiso
        Update: Partial<RolPermiso>
        Relationships: []
      }
    }
    Views: {
      v_llamadas_carga: { Row: VLlamadaCarga; Relationships: [] }
      v_intentos_llamada: { Row: VIntento; Relationships: [] }
      v_cola_llamadas: { Row: VCola; Relationships: [] }
    }
    Functions: {
      clave_cambiada: { Args: never; Returns: undefined }
      registrar_intento: { Args: { p_id: string; p_resultado: string }; Returns: Json }
      revertir_perfil: { Args: { p_user: string }; Returns: undefined }
      actualizar_intento: { Args: { p_id: string; p_estatus: string }; Returns: undefined }
      crear_carga: { Args: { p_pais: string; p_archivo: string; p_total: number }; Returns: string }
      importar_lote: { Args: { p_carga: string; p_filas: Json }; Returns: number }
      usuario_activo: { Args: never; Returns: boolean }
      usuario_es_admin: { Args: never; Returns: boolean }
      tiene_permiso: { Args: { p_codigo: string }; Returns: boolean }
      mis_permisos: { Args: never; Returns: string[] }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
