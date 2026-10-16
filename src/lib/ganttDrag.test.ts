import { describe, expect, it } from 'vitest'
import type { CalendarConfig } from '../types'
import { addWorkingDays } from './dateUtils'
import {
  DRAG_THRESHOLD_PX,
  computeMovePreview,
  computeResizePreview,
  isDragMoved,
  pixelsToDays,
} from './ganttDrag'

const DAY_W = 44

const standard: CalendarConfig = { weekendDays: [0, 6], holidays: [] }
const weekdaysOnly: CalendarConfig = { weekendDays: [], holidays: [] }
const harvestHoliday: CalendarConfig = { weekendDays: [0, 6], holidays: ['2026-10-09'] }

/* 2026-10-05 = Senin, 2026-10-09 = Jumat, 2026-10-10 = Sabtu, 2026-10-12 = Senin berikutnya. */
const MON = '2026-10-05'

describe('pixelsToDays', () => {
  it('converts pixel distance to whole day columns', () => {
    expect(pixelsToDays(0, DAY_W)).toBe(0)
    expect(pixelsToDays(44, DAY_W)).toBe(1)
    expect(pixelsToDays(88, DAY_W)).toBe(2)
    expect(pixelsToDays(-88, DAY_W)).toBe(-2)
  })

  it('rounds to the nearest column so small jitters do not shift the bar', () => {
    expect(pixelsToDays(21, DAY_W)).toBe(0)
    expect(pixelsToDays(23, DAY_W)).toBe(1)
    expect(pixelsToDays(-21, DAY_W)).toBe(0)
  })

  it('honours the zoom level (week zoom is 15px per day)', () => {
    expect(pixelsToDays(45, 15)).toBe(3)
    expect(pixelsToDays(-30, 15)).toBe(-2)
  })

  it('is safe for a degenerate column width', () => {
    expect(pixelsToDays(50, 0)).toBe(0)
    expect(pixelsToDays(50, -1)).toBe(0)
    expect(pixelsToDays(50, Number.NaN)).toBe(0)
  })
})

describe('isDragMoved', () => {
  it('treats sub-threshold movement as a click, not a drag', () => {
    expect(isDragMoved(0)).toBe(false)
    expect(isDragMoved(DRAG_THRESHOLD_PX)).toBe(false)
    expect(isDragMoved(DRAG_THRESHOLD_PX + 1)).toBe(true)
    expect(isDragMoved(-(DRAG_THRESHOLD_PX + 1))).toBe(true)
  })
})

describe('computeMovePreview', () => {
  const move = (deltaX: number, cal: CalendarConfig = standard, origStart = MON) =>
    computeMovePreview({ origStart, deltaX, dayW: DAY_W, calendar: cal })

  it('keeps the original date when the pointer has not moved a column', () => {
    expect(move(0)).toBe('2026-10-05')
    expect(move(21)).toBe('2026-10-05')
  })

  it('moves forward by calendar days, skipping the weekend', () => {
    expect(move(44)).toBe('2026-10-06')
    expect(move(132)).toBe('2026-10-08')
    expect(move(176)).toBe('2026-10-09')
    // 5 hari kalender dari Senin = Sabtu, tapi hasilnya di-snap ke Senin berikutnya.
    expect(move(220)).toBe('2026-10-12')
  })

  it('moves backward and skips the weekend in the other direction', () => {
    expect(move(-44, standard, '2026-10-08')).toBe('2026-10-07')
    expect(move(-132, standard, '2026-10-08')).toBe('2026-10-05')
  })

  it('never lands the bar on a weekend — it snaps forward to Monday', () => {
    // Jumat + 1 kolom = Sabtu -> Senin.
    expect(move(44, standard, '2026-10-09')).toBe('2026-10-12')
    // Senin - 1 kolom = Minggu -> Senin (snap maju, bukan mundur).
    expect(move(-44, standard, '2026-10-12')).toBe('2026-10-12')
  })

  it('skips configured holidays', () => {
    expect(move(44, harvestHoliday, '2026-10-08')).toBe('2026-10-12')
  })

  it('moves by raw calendar days when every day is a working day', () => {
    expect(move(220, weekdaysOnly)).toBe('2026-10-10')
    expect(move(44, weekdaysOnly, '2026-10-09')).toBe('2026-10-10')
  })

  it('agrees with addWorkingDays, i.e. a moved bar keeps its duration', () => {
    const start = move(220)
    const end = addWorkingDays(start, 3, standard)
    expect(start).toBe('2026-10-12')
    expect(end).toBe('2026-10-14')
  })
})

describe('computeResizePreview', () => {
  const resize = (
    deltaX: number,
    origDuration = 5,
    cal: CalendarConfig = standard,
    origStart = MON,
  ) => computeResizePreview({ origStart, origDuration, deltaX, dayW: DAY_W, calendar: cal })

  it('keeps the duration when the pointer has not moved a column', () => {
    // 5 hari kerja dari Senin 2026-10-05 berakhir Jumat 2026-10-09.
    expect(resize(0)).toBe(5)
    expect(resize(21)).toBe(5)
  })

  it('extends the duration by whole working days', () => {
    expect(resize(132)).toBe(6) // ujung: Jumat -> Senin
    expect(resize(220)).toBe(8) // ujung: Jumat -> Rabu
  })

  it('shrinks the duration by whole working days', () => {
    expect(resize(-44)).toBe(4)
    expect(resize(-132)).toBe(2)
  })

  it('holds steady while the end sits inside a weekend', () => {
    expect(resize(44)).toBe(5) // -> Sabtu, snap mundur ke Jumat
    expect(resize(88)).toBe(5) // -> Minggu, snap mundur ke Jumat
  })

  it('never shrinks past a single working day', () => {
    expect(resize(-264)).toBe(1) // ujung jatuh sebelum tanggal mulai -> clamp
    expect(resize(-2000)).toBe(1)
    expect(resize(-44, 1)).toBe(1)
  })

  it('snaps the end back off a holiday', () => {
    // Mulai Senin 10-05, durasi 4 -> berakhir Kamis 10-08. Jumat 10-09 libur.
    expect(resize(44, 4, harvestHoliday)).toBe(4)
    expect(resize(176, 4, harvestHoliday)).toBe(5)
  })

  it('counts only working days in weekdays-only calendars', () => {
    expect(resize(44, 5, weekdaysOnly)).toBe(6)
  })

  it('round-trips: the resized duration covers the dragged end date', () => {
    const duration = resize(132)
    expect(addWorkingDays(MON, duration, standard)).toBe('2026-10-12')
  })
})
