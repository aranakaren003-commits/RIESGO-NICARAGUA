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
  opcionesDe?: { campo: FieldKey; mapa: Record<string, string[]> } // lista dependiente: las opciones y la visibilidad salen del valor de otro campo (p. ej. Queja: categoría → detalle)
  source: 'bitacora' | 'manual' // bitacora = precargado desde la bitácora; manual = lo ingresa el usuario
  readOnly?: boolean // nunca editable
  fijoEnEdicion?: boolean // editable solo al crear un registro nuevo; fijo al editar uno ya existente (viene de la bitácora)
  visibleSi?: { campo: FieldKey; valor: string } // el campo solo aparece (y es obligatorio) cuando otro campo tiene ese valor
}

export type TipoProducto = 'moto' | 'pyme'

export interface FieldGroup {
  title: string
  fields: FieldDef[]
  aplicaA?: TipoProducto // la sección solo se activa para este tipo de producto
  obligatorioEn?: TipoProducto // los campos de la sección son obligatorios para este tipo de producto
  obligatorioConAceptacion?: boolean // con estatus ACEPTACION, las preguntas de la sección son obligatorias
}

// TIPO DE CRÉDITO en la bitácora: 'MOTO', 'PYMES', 'ASALARIADO', etc.
export function esProducto(tipoCredito: string | null | undefined, tipo: TipoProducto): boolean {
  return (tipoCredito ?? '').trim().toUpperCase().startsWith(tipo === 'moto' ? 'MOTO' : 'PYME')
}

const BMR = ['BUENO', 'REGULAR', 'MALO']

export const SIN_QUEJA = 'Sin Queja'

export const QUEJA_CATEGORIAS: { categoria: string; opciones: string[] }[] = [
  { categoria: 'Cobro', opciones: ['Recordatorios consecutivos de Cobro', 'Llamadas consecutivas de Cobro', 'Mensaje consecutivos de Cobro', 'Otra'] },
  {
    categoria: 'Comercial',
    opciones: [
      'Atención muy lenta en sucursal',
      'No le comentaron el seguro',
      'Tiempo de Formalización',
      'Llamadas por parte de diversos ejecutivos',
      'No le entregaron Tarjeta de Pago',
      'Otra',
    ],
  },
  {
    categoria: 'Condiciones de Crédito',
    opciones: ['Monto del crédito', 'Tiempo de Legalización (Motos)', 'Tasa de Interes', 'Comisión de Desembolso', 'Otra'],
  },
  { categoria: 'DAC', opciones: ['Motorizado Descortés', 'Analista Descortés', 'Otra'] },
]

const QUEJA_MAPA: Record<string, string[]> = Object.fromEntries(QUEJA_CATEGORIAS.map((c) => [c.categoria, c.opciones]))

const f = (
  key: FieldKey,
  col: string,
  label: string,
  type: FieldType,
  source: 'bitacora' | 'manual',
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, col, label, type, source, ...extra })

export const ESTATUS_LLAMADA = [
  'CONTESTA',
  'ACEPTACION',
  'NO ACEPTACION',
  'NO CONTESTA',
  'BUZON',
  'DEVOLVER LLAMADA',
  'NUMERO EQUIVOCADO',
  'APROBADO SIN FORMALIZAR',
  'NO FORMALIZA',
  'DUPLICADO',
  'ANULADO',
  'CANCELACION',
]

export const FIELD_GROUPS: FieldGroup[] = [
  {
    // Todos estos campos vienen de la bitácora: fijos al editar un registro existente, editables solo al crear uno nuevo a mano.
    title: 'Cliente y solicitud',
    fields: [
      f('cliente', 'B', 'CLIENTE', 'text', 'bitacora', { fijoEnEdicion: true }),
      f('estado', 'C', 'ESTADO', 'text', 'bitacora', { fijoEnEdicion: true }),
      f('informa', 'D', 'INFORMA', 'text', 'bitacora', { fijoEnEdicion: true }),
      f('numero_solicitud', 'E', 'NUMERO DE SOLICITUD', 'number', 'bitacora', { fijoEnEdicion: true }),
      f('cedula', 'F', 'CEDULA', 'text', 'bitacora', { fijoEnEdicion: true }),
      f('telefono', 'G', 'TELEFONO', 'text', 'bitacora', { fijoEnEdicion: true }),
      f('lugar_trabajo', 'H', 'LUGAR DONDE TRABAJA', 'text', 'bitacora', { fijoEnEdicion: true }),
      f('fecha_formalizado', 'I', 'FECHA DE FORMALIZADO', 'datetime', 'bitacora', { fijoEnEdicion: true }),
    ],
  },
  {
    title: 'Seguimiento de la llamada',
    fields: [
      f('estatus_llamada', 'J', 'ESTATUS DE LLAMADA', 'select', 'manual', { options: ESTATUS_LLAMADA }),
      // Se fija sola la primera vez que se gestiona el registro (hora del país) y no se puede modificar
      f('fecha_hora_primera_gestion', 'K', 'FECHA Y HORA PRIMERA GESTIÓN', 'datetime', 'manual', { readOnly: true }),
      // Se actualiza sola cada vez que se registra o se cambia el estatus de la llamada
      f('fecha_hora_ultima_gestion', '', 'FECHA Y HORA ÚLTIMA GESTIÓN', 'datetime', 'manual', { readOnly: true }),
      // La llamada se devolverá en esta fecha y hora: la línea sube en la cola desde 10 minutos antes
      f('devolver_llamada_en', '', 'FECHA Y HORA PARA DEVOLVER LA LLAMADA', 'datetime', 'manual', { visibleSi: { campo: 'estatus_llamada', valor: 'DEVOLVER LLAMADA' } }),
      // Comentario cuando el estatus es NUMERO EQUIVOCADO
      f('numero_pertenece_a', '', 'COMENTARIO', 'text', 'manual', { visibleSi: { campo: 'estatus_llamada', valor: 'NUMERO EQUIVOCADO' } }),
    ],
  },
  {
    title: 'Crédito',
    fields: [
      f('tipo_credito', 'L', 'TIPO DE CRÉDITO', 'text', 'bitacora'),
      f('promotor', 'M', 'PROMOTOR', 'text', 'bitacora'),
      f('categorizacion', 'N', 'CATEGORIZACIÓN', 'select', 'bitacora', { options: ['CREDITO NUEVO', 'REFINANCIAMIENTO'] }),
      f('modalidad', 'O', 'MODALIDAD', 'text', 'bitacora'),
    ],
  },
  {
    title: 'Atención y experiencia del trámite',
    obligatorioConAceptacion: true,
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
    obligatorioConAceptacion: true,
    fields: [
      f('conoce_asistencias', 'W', 'SI , NO', 'sino', 'manual', {caption: 'YA CONOCE SOBRE LOS BENEFICIOS ADICIONALES DE NUESTRAS ASISTENCIAS?' }),
      f('ofrecieron_asistencia', 'X', 'SI , NO', 'sino', 'manual', {caption: 'LE OFRECIERON ADQUIRIR ALGUNA ASISTENCIA?' }),
      f('adquirio_asistencia', '', 'SI , NO', 'sino', 'manual', { caption: 'ADQUIRIÓ LA ASISTENCIA?' }),
      f('entregaron_documentacion', 'Y', 'SI , NO', 'sino', 'manual', {caption: 'ENTREGARON , LA DOCUMENTACIÓN QUE CORRESPONDE A RESUMEN INFORMATIVO,TABLA DE PAGO Y COPIA DE CONTRATO.' }),
      f('claro_informacion', 'Z', 'SI , NO', 'sino', 'manual', {caption: 'ESTA CLARO CON TODA LA INFORMACIÓN,COMO COMISIÓN ADMINISTRATIVA, FECHAS DE PAGO, INTERÉS, PLAZO.' }),
      f('conforme_fechas_pago', 'AA', 'SI , NO', 'sino', 'manual', {caption: 'ESTA CONFORME CON LAS FECHAS DE PAGOS BRINDADAS' }),
    ],
  },
  {
    title: 'Motocicleta',
    aplicaA: 'moto',
    fields: [
      f('nombre_dealer', 'AC', 'NOMBRE DE DEALER', 'text', 'manual', { caption: 'DONDE RETIRO SU MOTOCICLETA?' }),
      f('pregunta_ad', 'AD', 'SI , NO', 'sino', 'manual', { caption: 'YA REALIZO LA LEGALIZACION DE SU MOTO?' }),
      f('pregunta_ae', 'AE', 'SI , NO', 'sino', 'manual', { caption: 'LE ACOMPAÑO A LA LEGALIZACION EL ABOGADO?' }),
    ],
  },
  {
    title: 'Cierre y observaciones',
    obligatorioConAceptacion: true,
    fields: [
      f('genero', '', 'GÉNERO', 'select', 'manual', { options: ['MASCULINO', 'FEMENINO'], caption: 'GÉNERO DEL CLIENTE' }),
      f('pregunta_af', 'AF', 'SI , NO', 'sino', 'manual', { caption: 'RECOMENDARÍA ALGÚN AMIGO,FAMILIAR O CONOCIDO CON INSTACREDIT' }),
      f('comentario_sugerencia', 'AJ', 'COMENTARIO Y SUGERENCIA', 'textarea', 'manual', { caption: 'CLIENTE BRINDA EL COMENTARIO' }),
      // E-MAIL, SUCURSAL y ORIGEN vienen de la bitácora (Correo_MK, Suc Origen, Medio Captacion); el correo se puede editar, los otros dos no
      f('email', 'AK', 'E-MAIL', 'email', 'bitacora'),
      f('correo_agre_x_control', 'AL', 'CORREO AGRE X CONTROL', 'sino', 'manual'),
      f('sucursal', 'AM', 'SUCURSAL', 'text', 'bitacora', { readOnly: true }),
      f('origen', 'AN', 'ORIGEN( LLAMADA, Facebook, Redes, volante etc)', 'text', 'bitacora', { readOnly: true, caption: 'MEDIO DE CAPTACIÓN (POR QUE MEDIO SE ENTERO DE NUESTRO SERVICIO)' }),
      f('fechas_pago', 'AO', 'FECHAS DE PAGO', 'date', 'manual'),
      f('no_conforme_fechas_pago', 'AP', 'NO CONFORME CON FECHAS DE PAGO', 'textarea', 'manual', { caption: 'OBSERVACIONES/ COMENTARIO' }),
      f('medio_notificacion', 'AQ', 'SMS- CORREO- WHATSAPP-LLAMADA', 'select', 'manual', {
        options: ['WHATSAPP', 'CORREO', 'LLAMADA', 'SMS', 'NO LE INTERESA'],
        caption: 'NOTIFICACIÓN ENCUESTA (PROMOCIONES MENSUALES) Por que medio le gustaría recibir información de promociones?',
      }),
    ],
  },
  {
    title: 'Comentario y sospecha',
    obligatorioConAceptacion: true,
    fields: [
      f('comentario_llamada', 'K', 'COMENTARIO', 'textarea', 'manual'),
      // Si es SI, la línea se resalta en rojo tenue en las tablas y queda disponible para análisis por promotor, canal y solicitud
      f('caso_sospecha', '', 'CASO TIENE SOSPECHA', 'sino', 'manual'),
      f('queja_categoria', '', 'QUEJA (CATEGORÍA)', 'select', 'manual', { options: [...QUEJA_CATEGORIAS.map((c) => c.categoria), SIN_QUEJA] }),
      f('queja', '', 'QUEJA (DETALLE)', 'select', 'manual', { opcionesDe: { campo: 'queja_categoria', mapa: QUEJA_MAPA } }),
    ],
  },
]

// Con estatus ACEPTACION son obligatorias las preguntas (campos con encabezado de pregunta, sospecha, queja y género); los comentarios libres no.
const CLAVES_PREGUNTA: FieldKey[] = ['caso_sospecha', 'queja_categoria', 'queja', 'genero']
export const esPreguntaDeAceptacion = (x: FieldDef): boolean =>
  x.source === 'manual' && !x.readOnly && x.type !== 'textarea' && (!!x.caption || CLAVES_PREGUNTA.includes(x.key))

export const ALL_FIELDS: FieldDef[] = FIELD_GROUPS.flatMap((g) => g.fields)
export const MANUAL_FIELDS = ALL_FIELDS.filter((x) => x.source === 'manual')

export function encuestaProgreso(r: Llamada): { llenos: number; total: number } {
  const excluidos: FieldKey[] = [
    'estatus_llamada',
    'comentario_llamada',
    'fecha_hora_primera_gestion',
    'fecha_hora_ultima_gestion',
    'devolver_llamada_en',
    'caso_sospecha',
    'numero_pertenece_a',
    'queja',
    'queja_categoria',
  ]
  const campos = MANUAL_FIELDS.filter((x) => !excluidos.includes(x.key))
  const llenos = campos.filter((x) => {
    const v = r[x.key]
    return v !== null && v !== ''
  }).length
  return { llenos, total: campos.length }
}
