import type { CalendarConfig } from '../types'
import {
  addDaysISO,
  countWorkingDaysInclusive,
  nextWorkingDay,
  prevWorkingDay,
} from './dateUtils'

/** Ambang piksel sebelum sebuah drag dianggap benar-benar memindahkan bar. */
export const DRAG_THRESHOLD_PX = 3

/** Ubah jarak piksel horizontal menjadi jumlah kolom hari (pembulatan terdekat). */
export function pixelsToDays(deltaX: number, dayW: number): number {
  if (!Number.isFinite(dayW) || dayW <= 0) return 0
  const days = Math.round(deltaX / dayW)
  return days === 0 ? 0 : days // normalisasi -0 -> 0
}

/** Apakah pointer sudah bergerak cukup jauh untuk dianggap drag (bukan klik). */
export function isDragMoved(deltaX: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return Math.abs(deltaX) > threshold
}

export interface MoveDragInput {
  /** Tanggal mulai bar saat drag dimulai. */
  origStart: string
  /** Perpindahan pointer dari titik awal, dalam piksel. */
  deltaX: number
  /** Lebar satu kolom hari, dalam piksel. */
  dayW: number
  calendar: CalendarConfig
}

/**
 * Tanggal mulai baru hasil geser bar.
 * Hasil selalu di-snap maju ke hari kerja, sehingga bar tidak pernah mendarat di akhir pekan/hari libur.
 */
export function computeMovePreview({
  origStart,
  deltaX,
  dayW,
  calendar,
}: MoveDragInput): string {
  const raw = addDaysISO(origStart, pixelsToDays(deltaX, dayW))
  return nextWorkingDay(raw, calendar)
}

export interface ResizeDragInput {
  /** Tanggal mulai bar (tetap selama resize). */
  origStart: string
  /** Durasi bar saat resize dimulai, dalam hari kerja. */
  origDuration: number
  /** Perpindahan pointer dari titik awal, dalam piksel. */
  deltaX: number
  dayW: number
  calendar: CalendarConfig
}

/**
 * Durasi baru (hari kerja) hasil tarik sisi kanan bar.
 * Sisi kanan di-snap mundur ke hari kerja, dan tidak pernah lebih awal dari `origStart`,
 * sehingga durasi tidak pernah kurang dari 1 hari kerja.
 */
export function computeResizePreview({
  origStart,
  origDuration,
  deltaX,
  dayW,
  calendar,
}: ResizeDragInput): number {
  const duration = Math.max(1, Math.round(origDuration))
  const origEnd = addDaysISO(origStart, duration - 1)
  const rawEnd = addDaysISO(origEnd, pixelsToDays(deltaX, dayW))
  const snappedEnd = prevWorkingDay(rawEnd, calendar)
  const safeEnd = snappedEnd < origStart ? origStart : snappedEnd
  return Math.max(1, countWorkingDaysInclusive(origStart, safeEnd, calendar))
}
