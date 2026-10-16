// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { SEED_VERSION } from './data/seed'

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

const clickNav = (label: string) => {
  const nav = screen.getByRole('navigation', { name: /navigasi utama/i })
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(label, 'i') }))
}

describe('App smoke test', () => {
  it('renders the seed project on the dashboard', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /Peluncuran Aplikasi Mobile/i }),
    ).toBeTruthy()
    expect(screen.getByText(/Total Tugas/i)).toBeTruthy()
    expect(screen.getByText(/Progres Proyek/i)).toBeTruthy()
    expect(screen.getAllByText(/Anggota Tim/i).length).toBeGreaterThan(0)
    // 17 tugas pada seed data: 4 fase utama + 13 sub-tugas
    expect(screen.getByText(/4 fase utama/i)).toBeTruthy()
  })

  it('navigates across every view without crashing', () => {
    render(<App />)

    clickNav('Gantt')
    expect(screen.getByRole('heading', { name: /Gantt Chart/i })).toBeTruthy()
    expect(screen.getByText(/Tugas jalur kritis/i)).toBeTruthy()

    clickNav('Tugas')
    expect(screen.getByRole('heading', { name: /Manajemen Tugas/i })).toBeTruthy()

    clickNav('Tim')
    expect(screen.getByRole('heading', { name: /Manajemen Tim/i })).toBeTruthy()

    clickNav('Kalender')
    expect(screen.getByRole('heading', { name: /Kalender Proyek/i })).toBeTruthy()
    expect(screen.getByText(/Hari Kerja Bulan Ini/i)).toBeTruthy()

    clickNav('Analisis')
    expect(screen.getByRole('heading', { name: /Analisis Proyek/i })).toBeTruthy()
    expect(screen.getByText(/Jalur Kritis \(Critical Path\)/i)).toBeTruthy()
    expect(screen.getByText(/Diagram Jaringan PERT/i)).toBeTruthy()
  })

  it('validates the quick-add task form', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Tugas Baru/i }))

    const dialog = screen.getByRole('dialog', { name: /Tugas Baru/i })
    expect(dialog).toBeTruthy()

    // Submit kosong -> pesan validasi muncul
    fireEvent.click(within(dialog).getByRole('button', { name: /Tambah Tugas/i }))
    expect(within(dialog).getByText(/Nama tugas wajib diisi/i)).toBeTruthy()

    // Isi nama terlalu pendek
    fireEvent.change(within(dialog).getByLabelText(/Nama Tugas/i), {
      target: { value: 'ab' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /Tambah Tugas/i }))
    expect(within(dialog).getByText(/Minimal 3 karakter/i)).toBeTruthy()

    // Nama valid -> tugas baru tersimpan
    fireEvent.change(within(dialog).getByLabelText(/Nama Tugas/i), {
      target: { value: 'Tugas Uji Otomatis' },
    })
    fireEvent.change(within(dialog).getByLabelText(/Durasi/i), { target: { value: '7' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Tambah Tugas/i }))

    expect(screen.queryByRole('dialog', { name: /Tugas Baru/i })).toBeNull()
    clickNav('Tugas')
    expect(screen.getByText('Tugas Uji Otomatis')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: /navigasi utama/i })
    expect(within(nav).getByRole('button', { name: /Tugas\s*19/ })).toBeTruthy()
  })

  it('tetap berjalan saat localStorage berisi data rusak', () => {
    // Sebelum perbaikan, tugas tanpa startDate membuat schedule() melempar error
    // dan seluruh aplikasi gagal dirender.
    localStorage.setItem(
      'gantt.pm.data.v1',
      JSON.stringify({
        seedVersion: SEED_VERSION,
        tasks: [{ id: 'x1', name: 'Tugas Hasil Perbaikan' }],
        resources: [],
        dependencies: [],
        calendar: {},
      }),
    )

    render(<App />)
    expect(screen.getByRole('heading', { name: /Proyek Tanpa Nama/i })).toBeTruthy()

    clickNav('Tugas')
    expect(screen.getByText('Tugas Hasil Perbaikan')).toBeTruthy()
  })

  it('persists changes to localStorage', () => {
    render(<App />)
    clickNav('Tugas')
    fireEvent.click(screen.getByRole('button', { name: /Tambah Tugas/i }))
    const dialog = screen.getByRole('dialog', { name: /Tugas Baru/i })
    fireEvent.change(within(dialog).getByLabelText(/Nama Tugas/i), {
      target: { value: 'Tugas Persisten' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /Tambah Tugas/i }))

    const raw = localStorage.getItem('gantt.pm.data.v1')
    expect(raw).toBeTruthy()
    expect(raw).toContain('Tugas Persisten')
  })
})
