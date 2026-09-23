import type { Llamada } from '../types/database.types'

export type FieldKey = Exclude<keyof Llamada, 'id' | 'periodo' | 'creado_por' | 'actualizado_por' | 'creado_en' | 'actualizado_en'>
export type FieldType = 'text' | 'textarea' | 'select' | 'sino' | 'date' | 'datetime' | 'email' | 'number'

export interface FieldDef {
  key: FieldKey
  col: string // letra de columna en REPORTE CALIDAD GENERAL
  label: string // nombre del campo tal como aparece en el reporte
  caption?: string // encabezado superior del reporte (pregunta), cuando existe
  type: FieldType
  options?: string[]
  source: 'bitacora' | 'manual' // bitacora = precargado desde la bitácora (editable); manual = lo ingresa el usuario
  readOnly?: boolean
}

export interface FieldGroup {
  title: string
  fields: FieldDef[]
}

const BMR = ['BUENO', 'REGULAR', 'MALO']

const f = (
  key: FieldKey,
  col: string,
  label: string,
  type: FieldType,
  source: 'bitacora' | 'manual',
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, col, label, type, source, ...extra })

export const ESTATUS_LLAMADA = [
  'ACEPTACION',
  'NO ACEPTACION',
  'NO CONTESTA',
  'BUZON',
  'NO FORMALIZA',
  'DUPLICADO',
  'ANULADO',
  'CANCELACION',
]

export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'Cliente y solicitud',
    fields: [
      f('num', 'A', 'NÚM', 'number', 'bitacora', { readOnly: true }),
      f('cliente', 'B', 'CLIENTE', 'text', 'bitacora'),
      f('estado', 'C', 'ESTADO', 'text', 'bitacora'),
      f('informa', 'D', 'INFORMA', 'text', 'bitacora'),
      f('numero_solicitud', 'E', 'NUMERO DE SOLICITUD', 'number', 'bitacora'),
      f('cedula', 'F', 'CEDULA', 'text', 'bitacora'),
      f('telefono', 'G', 'TELEFONO', 'text', 'bitacora'),
      f('lugar_trabajo', 'H', 'LUGAR DONDE TRABAJA', 'text', 'bitacora'),
      f('fecha_formalizado', 'I', 'FECHA DE FORMALIZADO', 'datetime', 'bitacora'),
    ],
  },
  {
    title: 'Seguimiento de la llamada',
    fields: [
      f('estatus_llamada', 'J', 'ESTATUS DE LLAMADA', 'select', 'manual', { options: ESTATUS_LLAMADA }),
      f('comentario_fecha_hora', 'K', 'COMENTARIO, FECHA Y HORA', 'textarea', 'manual'),
    ],
  },
  {
    title: 'Crédito',
    fields: [
      f('tipo_credito', 'L', 'TIPO DE CRÉDITO', 'text', 'bitacora'),
      f('promotor', 'M', 'PROMOTOR', 'text', 'bitacora'),
      f('categorizacion', 'N', 'CATEGORIZACIÓN', 'text', 'bitacora'),
      f('modalidad', 'O', 'MODALIDAD', 'text', 'bitacora'),
    ],
  },
  {
    title: 'Atención y experiencia del trámite',
    fields: [
      f('atencion_tramite', 'P', 'BUENO ,MALO, REGULAR', 'select', 'manual', { options: BMR, caption: 'ATENCIÒN O EXPERIENCIA DEL TRAMITE DE CRÉDITO' }),
      f('atencion_ejecutivo', 'Q', 'BUENO ,MALO, REGULAR', 'select', 'manual', { options: BMR, caption: 'ATENCIÒN DEL EJECUTIVO O PROMOTOR DE CRÉDITO' }),
      f('nombre_ejecutivo', 'R', 'EJECUTIVO', 'text', 'manual', { caption: 'NOMBRE DEL EJECUTIVO QUE LE LLEVO LA GESTION.' }),
      f('calificacion_gestion', 'S', 'RÁPIDO , INTERMEDIO, MENOS RÁPIDO', 'select', 'manual', { options: ['RAPIDO', 'INTERMEDIO', 'MENOS RAPIDO'], caption: 'COMO CALIFICARÍA LA GESTIÓN' }),
      f('tipo_desembolso', 'T', 'SUCURSAL, FORMALIZADOR', 'select', 'manual', { options: ['SUCURSAL', 'FORMALIZADOR'], caption: 'TIPO DE DESEMBOLSO' }),
      f('atencion_analista', 'U', 'BUENO ,MALO, REGULAR', 'select', 'manual', { options: BMR, caption: 'EXPERIENCIA ATENCIÒN BRINDADA POR ANALISTA' }),
      f('atencion_formalizador', 'V', 'BUENO ,MALO, REGULAR', 'select', 'manual', { options: BMR, caption: 'EXPERIENCIA O ATENCIÒN BRINDADA POR EL FORMALIZADOR O EJECUTIVO DE CRÉDITO EN SUCURSAL' }),
    ],
  },
  {
    title: 'Asistencias, documentación y fechas de pago',
    fields: [
      f('conoce_asistencias', 'W', 'SI , NO', 'sino', 'manual', {caption: 'YA CONOCE SOBRE LOS BENEFICIOS ADICIONALES DE NUESTRAS ASISTENCIAS?' }),
      f('ofrecieron_asistencia', 'X', 'SI , NO', 'sino', 'manual', {caption: 'LE OFRECIERON ADQUIRIR ALGUNA ASISTENCIA?' }),
      f('entregaron_documentacion', 'Y', 'SI , NO', 'sino', 'manual', {caption: 'ENTREGARON , LA DOCUMENTACIÓN QUE CORRESPONDE A RESUMEN INFORMATIVO,TABLA DE PAGO Y COPIA DE CONTRATO.' }),
      f('claro_informacion', 'Z', 'SI , NO', 'sino', 'manual', {caption: 'ESTA CLARO CON TODA LA INFORMACIÓN,COMO COMISIÓN ADMINISTRATIVA, FECHAS DE PAGO, INTERÉS, PLAZO.' }),
      f('conforme_fechas_pago', 'AA', 'SI , NO', 'sino', 'manual', {caption: 'ESTA CONFORME CON LAS FECHAS DE PAGOS BRINDADAS' }),
    ],
  },
  {
    title: 'Motocicleta y verificación',
    fields: [
      f('nombre_dealer', 'AC', 'NOMBRE DE DEALER', 'text', 'manual', { caption: 'DONDE RETIRO SU MOTOCICLETA?' }),
      f('pregunta_ad', 'AD', 'SI , NO', 'sino', 'manual', {caption: 'YA REALIZO LA LEGALIZACION DE SU MOTO?' }),
      f('pregunta_ae', 'AE', 'SI , NO', 'sino', 'manual', {caption: 'LE ACOMPAÑO A LA LEGALIZACION EL ABOGADO?' }),
      f('pregunta_af', 'AF', 'SI , NO', 'sino', 'manual', {caption: 'RECOMENDARÍA ALGÚN AMIGO,FAMILIAR O CONOCIDO CON INSTACREDIT' }),
      f('pregunta_ag', 'AG', 'SI , NO', 'sino', 'manual', {caption: 'CRÉDITO VERIFICADO' }),
      f('pregunta_ah', 'AH', 'SI , NO', 'sino', 'manual', {caption: 'ANALISTA' }),
    ],
  },
  {
    title: 'Cierre y observaciones',
    fields: [
      f('nombre_analista', 'AI', 'NOMBRE ANALISTA', 'text', 'manual'),
      f('comentario_sugerencia', 'AJ', 'COMENTARIO Y SUGERENCIA', 'textarea', 'manual', { caption: 'CLIENTE BRINDA EL COMENTARIO' }),
      f('email', 'AK', 'E-MAIL', 'email', 'manual'),
      f('correo_agre_x_control', 'AL', 'CORREO AGRE X CONTROL', 'sino', 'manual'),
      f('sucursal', 'AM', 'SUCURSAL', 'text', 'manual'),
      f('origen', 'AN', 'ORIGEN( LLAMADA, Facebook, Redes, volante etc)', 'text', 'manual', { caption: 'MEDIO DE CAPTACIÓN (POR QUE MEDIO SE ENTERO DE NUESTRO SERVICIO)' }),
      f('fechas_pago', 'AO', 'FECHAS DE PAGO', 'date', 'manual'),
      f('no_conforme_fechas_pago', 'AP', 'NO CONFORME CON FECHAS DE PAGO', 'textarea', 'manual', { caption: 'OBSERVACIONES/ COMENTARIO' }),
      f('medio_notificacion', 'AQ', 'SMS- CORREO- WHATSAPP-LLAMADA', 'select', 'manual', {
        options: ['WHATSAPP', 'CORREO', 'LLAMADA', 'SMS', 'NO LE INTERESA'],
        caption: 'NOTIFICACIÓN ENCUESTA (PROMOCIONES MENSUALES) Por que medio le gustaría recibir información de promociones?',
      }),
    ],
  },
]

export const ALL_FIELDS: FieldDef[] = FIELD_GROUPS.flatMap((g) => g.fields)
export const MANUAL_FIELDS = ALL_FIELDS.filter((x) => x.source === 'manual')

const TZ = 'America/Managua'

export function fmtFecha(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-NI', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}

// timestamptz -> valor de <input type="datetime-local"> en hora de Nicaragua (UTC-6, sin horario de verano)
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() - 6 * 3600 * 1000)
  return d.toISOString().slice(0, 16)
}

export function localInputToIso(v: string): string | null {
  return v ? `${v}:00-06:00` : null
}

export function encuestaProgreso(r: Llamada): { llenos: number; total: number } {
  const campos = MANUAL_FIELDS.filter((x) => x.key !== 'estatus_llamada' && x.key !== 'comentario_fecha_hora')
  const llenos = campos.filter((x) => {
    const v = r[x.key]
    return v !== null && v !== ''
  }).length
  return { llenos, total: campos.length }
}
