// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { createSeedData } from '../data/seed'
import { schedule } from '../lib/scheduling'

/* --- Oracle: jadwal seed dihitung lewat mesin penjadwalan sungguhan --- */
const seed = createSeedData()
const sched = schedule(seed)
const leafTasks = seed.tasks.filter((t) => sched.leafIds.includes(t.id))
const PHASE_IDS = ['t1', 't5', 't9', 't14']

const expectedProgress = Math.round(
  leafTasks.reduce((a, t) => a + t.progress, 0) / leafTasks.length,
)
const expectedDone = leafTasks.filter((t) => t.status === 'done').length

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

const clickNav = (label: string) => {
  const nav = screen.getByRole('navigation', { name: /navigasi utama/i })
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(label, 'i') }))
}

describe('Dashboard — statistik tugas daun', () => {
  it('menghitung total tugas dan progres hanya dari tugas daun', () => {
    render(<App />)

    // 18 tugas seed = 4 fase induk + 14 tugas daun
    expect(leafTasks).toHaveLength(14)
    expect(sched.leafIds).not.toEqual(expect.arrayContaining(PHASE_IDS))

    const total = screen.getByRole('button', { name: /Buka halaman Tugas/i })
    expect(within(total).getByText('14')).toBeTruthy()
    expect(within(total).getByText(/4 fase utama · 14 tugas daun/)).toBeTruthy()

    const progressCard = screen.getByRole('button', {
      name: /Lihat progres di halaman Tugas/i,
    })
    expect(within(progressCard).getByText(`${expectedProgress}%`)).toBeTruthy()
    expect(
      within(progressCard).getByText(
        new RegExp(`${expectedDone} tugas daun selesai dari 14`),
      ),
    ).toBeTruthy()

    // Status hanya dihitung dari tugas daun.
    const doneCount = leafTasks.filter((t) => t.status === 'done').length
    expect(screen.getByText(new RegExp(`Selesai: ${doneCount}\\b`))).toBeTruthy()
  })

  it('menampilkan progres fase sebagai gabungan berbobot durasi sub-tugas', () => {
    render(<App />)
    // t5 = 57% (t6 100% × 4 hari, t7 60% × 6 hari, t8 20% × 5 hari)
    expect(sched.byId.t5.rolledUpProgress).toBe(57)
    expect(screen.getAllByText('57%').length).toBeGreaterThan(0)
  })

  it('membuat setiap kartu statistik bisa diklik dan bisa difokus dengan keyboard', () => {
    render(<App />)

    const teamCard = screen.getByRole('button', { name: /Buka halaman Tim/i })
    // Fokus keyboard tersedia (elemen <button>).
    teamCard.focus()
    expect(document.activeElement).toBe(teamCard)
    fireEvent.click(teamCard)
    expect(screen.getByRole('heading', { name: /Manajemen Tim/i })).toBeTruthy()

    clickNav('Dashboard')
    fireEvent.click(screen.getByRole('button', { name: /Buka halaman Gantt/i }))
    expect(screen.getByRole('heading', { name: /Gantt Chart/i })).toBeTruthy()

    clickNav('Dashboard')
    // Kartu Durasi CPM & Ekspektasi PERT menuju halaman Analisis.
    fireEvent.click(
      screen.getByRole('button', { name: 'Buka halaman Analisis (durasi CPM)' }),
    )
    expect(screen.getByRole('heading', { name: /Analisis Proyek/i })).toBeTruthy()
  })

  it('memakai ikon panah keluar pada kartu statistik', () => {
    render(<App />)
    const card = screen.getByRole('button', { name: /Buka halaman Tim/i })
    expect(card.querySelector('.stat__cta')).toBeTruthy()
    expect(card.className).toContain('stat--clickable')
  })
})
