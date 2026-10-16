// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { createSeedData } from '../data/seed'
import {
  addDaysISO,
  countWorkingDaysInclusive,
  nextWorkingDay,
  prevWorkingDay,
} from '../lib/dateUtils'
import { schedule } from '../lib/scheduling'
import { STORAGE_KEY } from '../store/ProjectProvider'
import type { ProjectData } from '../types'

/* --- Oracle: jadwal seed dihitung lewat mesin penjadwalan sungguhan --- */
const seed = createSeedData()
const sched = schedule(seed)
/** t2 "Riset Kebutuhan Pengguna": mulai Senin 2026-10-05, durasi 5 hari kerja. */
const T2_ID = 't2'
const T2_START = sched.byId[T2_ID].start
const T2_ORIG_DURATION = sched.byId[T2_ID].task.durationDays

const DAY_W = 44 // zoom "Hari" adalah nilai default halaman Gantt

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

const clickNav = (label: string) => {
  const nav = screen.getByRole('navigation', { name: /navigasi utama/i })
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(label, 'i') }))
}

const openGantt = () => {
  render(<App />)
  clickNav('Gantt')
  expect(screen.getByRole('heading', { name: /Gantt Chart/i })).toBeTruthy()
}

/** Bar di timeline punya aria-label "... , <mulai> sampai <selesai>, N hari kerja". */
const barFor = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`${name}, .* sampai `, 'i') })

const stored = (): ProjectData => JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
const storedTask = (id: string) => stored().tasks.find((t) => t.id === id) as { startDate: string; durationDays: number }

/**
 * jsdom tidak punya PointerEvent, jadi event pointer disintesis dari MouseEvent
 * (tipe event tetap "pointerdown", sehingga handler React native tetap terpanggil).
 */
const pointerEvent = (type: string, clientX: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 })

const dragBy = (handle: Element, deltaX: number) => {
  const from = 200
  fireEvent(handle, pointerEvent('pointerdown', from))
  act(() => {
    window.dispatchEvent(pointerEvent('pointermove', from + deltaX))
  })
  act(() => {
    window.dispatchEvent(pointerEvent('pointerup', from + deltaX))
  })
}

describe('Gantt drag & resize (interaksi nyata)', () => {
  it('geser bar satu kolom memindahkan tanggal mulai tepat satu hari kerja', () => {
    openGantt()
    const bar = barFor('Riset Kebutuhan Pengguna')
    expect(T2_START).toBe('2026-10-05')

    dragBy(bar, DAY_W)

    const expected = nextWorkingDay(addDaysISO(T2_START, 1), seed.calendar)
    expect(expected).toBe('2026-10-06')
    const t2 = storedTask(T2_ID)
    expect(t2.startDate).toBe(expected)
    // Durasi tidak boleh ikut berubah saat menggeser bar.
    expect(t2.durationDays).toBe(T2_ORIG_DURATION)
  })

  it('geser bar maju melewati akhir pekan dan mendarat di hari kerja', () => {
    // Kamis 2026-10-08 + 2 kolom = Sabtu 2026-10-10 -> di-snap ke Senin 2026-10-12.
    openGantt()
    const target = sched.byId['t3']
    expect(target.start).toBe('2026-10-06')
    const bar = barFor('Analisis Kompetitor')

    dragBy(bar, -DAY_W)

    const t3 = storedTask('t3')
    expect(t3.startDate).toBe('2026-10-05')
    expect(t3.startDate).not.toBe('2026-10-04') // bukan Minggu
  })

  it('klik tanpa perpindahan memilih bar tanpa mengubah data', () => {
    openGantt()
    const bar = barFor('Riset Kebutuhan Pengguna')
    expect(bar.className).not.toContain('is-selected')

    dragBy(bar, 2) // di bawah ambang drag

    expect(bar.className).toContain('is-selected')
    expect(storedTask(T2_ID).startDate).toBe(T2_START)
  })

  it('tarik sisi kanan menambah durasi dalam satuan hari kerja', () => {
    openGantt()
    const bar = barFor('Riset Kebutuhan Pengguna')
    const handle = bar.querySelector('.bar__handle')
    expect(handle).toBeTruthy()

    dragBy(handle as Element, 3 * DAY_W)

    // Ujung lama Jumat 2026-10-09 bergeser 3 hari kalender ke Senin 2026-10-12.
    const newEnd = prevWorkingDay(
      addDaysISO(addDaysISO(T2_START, T2_ORIG_DURATION - 1), 3),
      seed.calendar,
    )
    const expected = countWorkingDaysInclusive(T2_START, newEnd, seed.calendar)
    expect(newEnd).toBe('2026-10-12')
    expect(expected).toBe(6)

    const t2 = storedTask(T2_ID)
    expect(t2.durationDays).toBe(expected)
    expect(t2.startDate).toBe(T2_START) // tanggal mulai tetap saat resize
  })

  it('tarik sisi kanan ke kiri tidak pernah mengecilkan durasi di bawah 1 hari', () => {
    openGantt()
    const bar = barFor('Riset Kebutuhan Pengguna')
    const handle = bar.querySelector('.bar__handle') as Element

    dragBy(handle, -40 * DAY_W)

    expect(storedTask(T2_ID).durationDays).toBe(1)
    expect(storedTask(T2_ID).startDate).toBe(T2_START)
  })

  it('menghormati hari libur kalender saat menggeser bar', () => {
    // 2026-10-16 (Jumat) adalah hari libur pada seed.
    openGantt()
    expect(seed.calendar.holidays).toContain('2026-10-16')
    const t4 = sched.byId['t4']
    expect(t4.start).toBe('2026-10-12')
    const bar = barFor('Dokumen Spesifikasi Produk')

    // Senin 10-12 + 4 kolom = Jumat 10-16 (libur) -> di-snap ke Senin 10-19.
    dragBy(bar, 4 * DAY_W)

    expect(storedTask('t4').startDate).toBe('2026-10-19')
  })
})
