import { describe, expect, it } from 'vitest'
import type { CalendarConfig } from '../types'
import {
  addWorkingDays,
  addWorkingDaysOffset,
  countWorkingDaysInclusive,
  diffDays,
  isWorkingDay,
  nextWorkingDay,
  parseISO,
  toISO,
} from './dateUtils'

const weekdaysOnly: CalendarConfig = { weekendDays: [], holidays: [] }
const standard: CalendarConfig = { weekendDays: [0, 6], holidays: [] }
const withHoliday: CalendarConfig = {
  weekendDays: [0, 6],
  holidays: ['2026-10-12'],
}

describe('parseISO / toISO', () => {
  it('round-trips an ISO date without timezone drift', () => {
    expect(toISO(parseISO('2026-10-05'))).toBe('2026-10-05')
    expect(toISO(parseISO('2026-01-01'))).toBe('2026-01-01')
    expect(diffDays('2026-10-05', '2026-10-09')).toBe(4)
  })

  it('2026-10-05 is a Monday and 2026-10-10 a Saturday', () => {
    expect(parseISO('2026-10-05').getDay()).toBe(1)
    expect(parseISO('2026-10-10').getDay()).toBe(6)
  })
})

describe('isWorkingDay', () => {
  it('respects weekends', () => {
    expect(isWorkingDay('2026-10-09', standard)).toBe(true)
    expect(isWorkingDay('2026-10-10', standard)).toBe(false)
    expect(isWorkingDay('2026-10-11', standard)).toBe(false)
    expect(isWorkingDay('2026-10-10', weekdaysOnly)).toBe(true)
  })

  it('respects custom holidays', () => {
    expect(isWorkingDay('2026-10-12', withHoliday)).toBe(false)
  })
})

describe('nextWorkingDay', () => {
  it('skips the weekend forward', () => {
    expect(nextWorkingDay('2026-10-10', standard)).toBe('2026-10-12')
    expect(nextWorkingDay('2026-10-09', standard)).toBe('2026-10-09')
  })

  it('skips weekends and holidays', () => {
    expect(nextWorkingDay('2026-10-09', withHoliday)).toBe('2026-10-09')
    expect(nextWorkingDay('2026-10-10', withHoliday)).toBe('2026-10-13')
  })
})

describe('addWorkingDays (durasi hari kerja)', () => {
  it('counts only working days', () => {
    // Jumat 9 Okt + 3 hari kerja => Jumat, Senin, Selasa
    expect(addWorkingDays('2026-10-09', 3, standard)).toBe('2026-10-13')
  })

  it('skips custom holidays', () => {
    // Jumat(1), Senin libur, Selasa(2), Rabu(3)
    expect(addWorkingDays('2026-10-09', 3, withHoliday)).toBe('2026-10-14')
  })

  it('treats duration 1 as a single day', () => {
    expect(addWorkingDays('2026-10-09', 1, standard)).toBe('2026-10-09')
  })

  it('snaps a weekend start forward', () => {
    expect(addWorkingDays('2026-10-10', 2, standard)).toBe('2026-10-13')
  })
})

describe('addWorkingDaysOffset', () => {
  it('moves forward across the weekend', () => {
    expect(addWorkingDaysOffset('2026-10-09', 1, standard)).toBe('2026-10-12')
    expect(addWorkingDaysOffset('2026-10-09', 3, standard)).toBe('2026-10-14')
  })

  it('moves backward across the weekend', () => {
    expect(addWorkingDaysOffset('2026-10-12', -1, standard)).toBe('2026-10-09')
  })

  it('returns itself for offset 0', () => {
    expect(addWorkingDaysOffset('2026-10-09', 0, standard)).toBe('2026-10-09')
  })
})

describe('countWorkingDaysInclusive', () => {
  it('counts a full week as 5 working days', () => {
    expect(countWorkingDaysInclusive('2026-10-05', '2026-10-11', standard)).toBe(5)
  })

  it('returns a negative count when reversed', () => {
    expect(countWorkingDaysInclusive('2026-10-11', '2026-10-05', standard)).toBe(-5)
  })

  it('counts a single working day as 1', () => {
    expect(countWorkingDaysInclusive('2026-10-05', '2026-10-05', standard)).toBe(1)
    expect(countWorkingDaysInclusive('2026-10-10', '2026-10-10', standard)).toBe(0)
  })
})
