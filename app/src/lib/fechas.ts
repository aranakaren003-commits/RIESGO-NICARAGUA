// Utilidades de fecha y hora con zona horaria IANA (p. ej. America/Managua, America/Panama).
// Los instantes se guardan en la base de datos como timestamptz (UTC) y se muestran en la zona del país elegido.

function partes(d: Date, tz: string): Record<string, string> {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  return o
}

// Desfase (ms) de la zona `tz` respecto a UTC en el instante `d`.
function desfaseMs(d: Date, tz: string): number {
  const p = partes(d, tz)
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return comoUtc - Math.floor(d.getTime() / 1000) * 1000
}

// Hora "de pared" en la zona `tz` -> instante ISO (UTC).
export function paredAIso(y: number, m: number, d: number, hh: number, mi: number, ss: number, tz: string): string {
  const supuesto = Date.UTC(y, m - 1, d, hh, mi, ss)
  const d1 = supuesto - desfaseMs(new Date(supuesto), tz)
  const d2 = supuesto - desfaseMs(new Date(d1), tz)
  return new Date(d2).toISOString()
}

export function zonaValida(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: tz })
    return tz.trim() !== ''
  } catch {
    return false
  }
}

// dd/mm/aaaa hh:mm (24 h) en la zona del país
export function fmtFechaHora(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const p = partes(new Date(iso), tz)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

export function fmtSoloFecha(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const p = partes(new Date(iso), tz)
  return `${p.day}/${p.month}/${p.year}`
}

// instante -> valor de <input type="datetime-local"> en la zona del país
export function isoToLocalInput(iso: string | null, tz: string): string {
  if (!iso) return ''
  const p = partes(new Date(iso), tz)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// valor de <input type="datetime-local"> (hora del país) -> instante ISO
export function localInputToIso(v: string, tz: string): string | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  return paredAIso(+m[1], +m[2], +m[3], +m[4], +m[5], 0, tz)
}

// año-mes (aaaa-mm) de un instante en la zona del país
export function periodoDe(iso: string, tz: string): string {
  const p = partes(new Date(iso), tz)
  return `${p.year}-${p.month}`
}

// Inicio del día `aaaa-mm-dd` en la zona del país (instante ISO)
export function inicioDelDia(fecha: string, tz: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return paredAIso(y, m, d, 0, 0, 0, tz)
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

export function hoyEn(tz: string): string {
  const p = partes(new Date(), tz)
  return `${p.year}-${p.month}-${p.day}`
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
