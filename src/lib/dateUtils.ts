import type { CalendarConfig } from '../types'

const MS_PER_DAY = 86_400_000

/** Parse `YYYY-MM-DD` menjadi Date pada tengah malam lokal. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Format Date lokal menjadi `YYYY-MM-DD`. */
export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + n)
  return d
}

export function addDaysISO(iso: string, n: number): string {
  return toISO(addDays(parseISO(iso), n))
}

/** Selisih hari kalender b - a. */
export function diffDays(aIso: string, bIso: string): number {
  return Math.round((parseISO(bIso).getTime() - parseISO(aIso).getTime()) / MS_PER_DAY)
}

export function isWeekend(iso: string, cal: CalendarConfig): boolean {
  return cal.weekendDays.includes(parseISO(iso).getDay())
}

export function isHoliday(iso: string, cal: CalendarConfig): boolean {
  return cal.holidays.includes(iso)
}

export function isWorkingDay(iso: string, cal: CalendarConfig): boolean {
  return !isWeekend(iso, cal) && !isHoliday(iso, cal)
}

/** Hari libur/akhir pekan pertama pada atau setelah `iso`. */
export function nextWorkingDay(iso: string, cal: CalendarConfig): string {
  let d = iso
  for (let guard = 0; guard < 4000; guard += 1) {
    if (isWorkingDay(d, cal)) return d
    d = addDaysISO(d, 1)
  }
  return d
}

/** Hari kerja terakhir pada atau sebelum `iso`. */
export function prevWorkingDay(iso: string, cal: CalendarConfig): string {
  let d = iso
  for (let guard = 0; guard < 4000; guard += 1) {
    if (isWorkingDay(d, cal)) return d
    d = addDaysISO(d, -1)
  }
  return d
}

/**
 * Geser `n` hari kerja. `n` boleh negatif.
 * Tanggal masukan diasumsikan sudah berupa hari kerja.
 */
export function addWorkingDaysOffset(
  iso: string,
  n: number,
  cal: CalendarConfig,
): string {
  if (n === 0) return nextWorkingDay(iso, cal)
  const step = n > 0 ? 1 : -1
  let remaining = Math.abs(n)
  let d = iso
  for (let guard = 0; guard < 40_000 && remaining > 0; guard += 1) {
    d = addDaysISO(d, step)
    if (isWorkingDay(d, cal)) remaining -= 1
  }
  return d
}

/**
 * Tanggal selesai (inklusif) untuk tugas yang mulai di `startIso`
 * selama `duration` hari kerja.
 */
export function addWorkingDays(
  startIso: string,
  duration: number,
  cal: CalendarConfig,
): string {
  const start = nextWorkingDay(startIso, cal)
  if (duration <= 1) return start
  return addWorkingDaysOffset(start, duration - 1, cal)
}

/** Jumlah hari kerja antara a dan b (inklusif). Bernilai negatif bila b < a. */
export function countWorkingDaysInclusive(
  aIso: string,
  bIso: string,
  cal: CalendarConfig,
): number {
  if (aIso === bIso) return isWorkingDay(aIso, cal) ? 1 : 0
  const forward = diffDays(aIso, bIso) >= 0
  const from = forward ? aIso : bIso
  const to = forward ? bIso : aIso
  let count = 0
  let d = from
  for (let guard = 0; guard < 40_000; guard += 1) {
    if (diffDays(d, to) < 0) break
    if (isWorkingDay(d, cal)) count += 1
    d = addDaysISO(d, 1)
  }
  return forward ? count : -count
}

/** Daftar tanggal ISO dari `fromIso` s/d `toIso` (inklusif). */
export function eachDay(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  const total = diffDays(fromIso, toIso)
  for (let i = 0; i <= total; i += 1) out.push(addDaysISO(fromIso, i))
  return out
}

export function startOfMonth(year: number, month: number): string {
  return toISO(new Date(year, month, 1))
}

export function endOfMonth(year: number, month: number): string {
  return toISO(new Date(year, month + 1, 0))
}

/** Format tanggal ramah-baca: `12 Okt 2026`. */
export function formatLong(iso: string): string {
  const d = parseISO(iso)
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export function formatShort(iso: string): string {
  const d = parseISO(iso)
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ]
  return `${d.getDate()} ${months[d.getMonth()]}`
}

/** Format rupiah ringkas untuk gaji. */
export function formatIDR(value: number): string {
  if (!Number.isFinite(value)) return 'Rp0'
  if (value >= 1_000_000) {
    const jt = value / 1_000_000
    return `Rp${jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1)} jt`
  }
  return `Rp${value.toLocaleString('id-ID')}`
}
