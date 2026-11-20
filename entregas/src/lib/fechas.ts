// Fechas y plazos hábiles. Las fechas "de calendario" (despacho, entrega, stock estimado) viajan como
// 'YYYY-MM-DD' y se interpretan en hora local; los instantes (estado_desde, created_at) son ISO.
// Días hábiles = lunes a viernes. Los feriados nacionales no se descuentan todavía.

export const JORNADA_INICIO = 8
export const JORNADA_FIN = 16 // a las 16 corta todo el equipo

export function hoyISO(ahora: Date = new Date()): string {
  return aISO(ahora)
}

export function aISO(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 'YYYY-MM-DD' → Date local a las 00:00. */
export function desdeISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function esHabil(fecha: Date): boolean {
  const dia = fecha.getDay()
  return dia !== 0 && dia !== 6
}

/** Días hábiles completos entre dos fechas (no cuenta el día de inicio; cuenta el final si es hábil). */
export function diasHabilesEntre(desde: Date, hasta: Date): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
  if (b <= a) return 0
  let dias = 0
  const cursor = new Date(a)
  while (cursor < b) {
    cursor.setDate(cursor.getDate() + 1)
    if (esHabil(cursor)) dias += 1
  }
  return dias
}

/** Horas de jornada laboral (lun–vie, 8 a 16) transcurridas entre dos instantes. */
export function horasHabilesEntre(desde: Date, hasta: Date): number {
  if (hasta <= desde) return 0
  let total = 0
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  while (cursor <= hasta) {
    if (esHabil(cursor)) {
      const inicio = new Date(cursor); inicio.setHours(JORNADA_INICIO, 0, 0, 0)
      const fin = new Date(cursor); fin.setHours(JORNADA_FIN, 0, 0, 0)
      const a = Math.max(inicio.getTime(), desde.getTime())
      const b = Math.min(fin.getTime(), hasta.getTime())
      if (b > a) total += (b - a) / 3_600_000
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return Math.round(total * 10) / 10
}

export function sumarDiasHabiles(fecha: Date, dias: number): Date {
  const cursor = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  let restantes = dias
  while (restantes > 0) {
    cursor.setDate(cursor.getDate() + 1)
    if (esHabil(cursor)) restantes -= 1
  }
  return cursor
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** 12/11 */
export function fechaCorta(valor: string | Date | null | undefined): string {
  if (!valor) return '—'
  const f = typeof valor === 'string' ? (valor.length === 10 ? desdeISO(valor) : new Date(valor)) : valor
  return `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}`
}

/** jue 12 nov */
export function fechaLarga(valor: string | Date | null | undefined): string {
  if (!valor) return '—'
  const f = typeof valor === 'string' ? (valor.length === 10 ? desdeISO(valor) : new Date(valor)) : valor
  return `${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]}`
}

/** 12/11 14:05 */
export function fechaHora(valor: string | null | undefined): string {
  if (!valor) return '—'
  const f = new Date(valor)
  return `${fechaCorta(f)} ${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`
}

/** "hace 3 h", "hace 2 días" */
export function hace(valor: string | null | undefined, ahora: Date = new Date()): string {
  if (!valor) return ''
  const ms = ahora.getTime() - new Date(valor).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

/** Días de calendario (no hábiles) entre dos fechas, para mostrar "3 d" en la lista. */
export function diasCorridos(desde: string, ahora: Date = new Date()): number {
  const a = new Date(desde)
  return Math.max(0, Math.floor((ahora.getTime() - a.getTime()) / 86_400_000))
}

export function inicioSemana(fecha: Date): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  const dia = (d.getDay() + 6) % 7 // lunes = 0
  d.setDate(d.getDate() - dia)
  return d
}
