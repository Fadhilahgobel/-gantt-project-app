// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { createSeedData } from '../data/seed'
import { formatLong } from '../lib/dateUtils'
import { schedule } from '../lib/scheduling'

/* --- Oracle: jadwal seed dihitung lewat mesin penjadwalan sungguhan --- */
const seed = createSeedData()
const sched = schedule(seed)
const leafCount = sched.leafIds.length
const PHASE_NAMES = seed.tasks
  .filter((t) => seed.tasks.some((c) => c.parentId === t.id))
  .map((t) => t.name)

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

const openAnalysis = () => {
  render(<App />)
  const nav = screen.getByRole('navigation', { name: /navigasi utama/i })
  fireEvent.click(within(nav).getByRole('button', { name: /Analisis/i }))
  expect(screen.getByRole('heading', { name: /Analisis Proyek/i })).toBeTruthy()
}

const legend = () => screen.getByRole('group', { name: /Legenda diagram PERT/i })
const nodeNames = () =>
  [...document.querySelectorAll('.pert-node__name')].map((el) => el.textContent ?? '')

describe('AnalysisPage — legenda diagram PERT', () => {
  it('menjelaskan ES, EF, LS, LF, Float, Te, dan CP dengan tooltip', () => {
    openAnalysis()
    const box = legend()

    ;['ES', 'EF', 'LS', 'LF', 'Float', 'Te', 'CP'].forEach((key) => {
      expect(within(box).getByText(key)).toBeTruthy()
    })
    expect(within(box).getByText(/Mulai paling awal/)).toBeTruthy()
    expect(within(box).getByText(/Selesai paling awal/)).toBeTruthy()
    expect(within(box).getByText(/Jalur kritis/)).toBeTruthy()
    expect(within(box).getByText(/Durasi harapan PERT/)).toBeTruthy()
    expect(within(box).getByText(/hari kerja ke-N \(mulai dari 1\)/)).toBeTruthy()

    // Setiap item punya tooltip penjelasan.
    const items = [...box.querySelectorAll('.pert-legend__item')]
    expect(items.length).toBe(10)
    items.forEach((item) => {
      expect((item.getAttribute('title') ?? '').length).toBeGreaterThan(20)
    })
    const esItem = within(box).getByText(/Mulai paling awal/).closest('.pert-legend__item')
    expect(esItem?.getAttribute('title')).toMatch(/Earliest Start/)
  })
})

describe('AnalysisPage — diagram PERT', () => {
  it('hanya memakai tugas daun sebagai node; fase induk jadi label pengelompok', () => {
    openAnalysis()

    const nodes = document.querySelectorAll('.pert-node')
    expect(nodes.length).toBe(leafCount)
    expect(leafCount).toBeLessThan(seed.tasks.length)

    // Fase induk bukan node PERT.
    const names = nodeNames()
    PHASE_NAMES.forEach((name) => expect(names).not.toContain(name))
    // ... tetapi tetap muncul sebagai label pengelompok di atas node anaknya.
    expect(document.querySelectorAll('.pert-node__phase').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fase Perencanaan & Riset').length).toBeGreaterThan(0)

    // Hanya tugas daun yang bisa kritis dan muncul di badge jalur kritis.
    const criticalNodes = document.querySelectorAll('.pert-node.is-critical')
    expect(criticalNodes.length).toBe(sched.criticalPath.length)
  })

  it('menampilkan tanggal sebagai angka utama dan indeks "Hari ke-1 s/d ke-N"', () => {
    openAnalysis()

    const t2 = sched.byId.t2
    expect(
      screen.getByText(`${formatLong(t2.start)} → ${formatLong(t2.end)}`),
    ).toBeTruthy()
    expect(document.querySelectorAll('.pert-node__dates').length).toBe(leafCount)

    // Indeks 1-based: tugas paling awal mulai pada hari ke-1, bukan ke-0.
    expect(t2.esIndex).toBe(0)
    const dayRanges = [...document.querySelectorAll('.pert-node__days')].map(
      (el) => el.textContent ?? '',
    )
    expect(dayRanges).toContain(`Hari ke-1 s/d ke-${t2.efIndex + 1}`)
    dayRanges.forEach((text) => expect(text).toMatch(/^Hari ke-[1-9]\d* s\/d ke-[1-9]\d*$/))
    const nodeTexts = [...document.querySelectorAll('.pert-node')].map(
      (el) => el.textContent ?? '',
    )
    expect(nodeTexts.some((text) => text.includes('ES Hari ke-1'))).toBe(true)
    // Tidak ada penulisan hari ke-0.
    expect(document.body.textContent).not.toMatch(/Hari ke-0\b/)
  })

  it('menggambar panah dependensi SVG dengan label FS/SS + lag', () => {
    openAnalysis()

    const links = document.querySelectorAll('.pert-link')
    expect(links.length).toBe(seed.dependencies.length)

    // dep6 t7 -> t8 adalah Start-to-Start dengan lag 2.
    expect(screen.getByText('SS +2')).toBeTruthy()
    // dep14 t16 -> t17 adalah Finish-to-Start dengan lag 1.
    expect(screen.getByText('FS +1')).toBeTruthy()
    expect(screen.getAllByText('FS').length).toBeGreaterThan(3)

    // Panah & node jalur kritis disorot kuning neon.
    expect(document.querySelectorAll('.pert-link.is-critical').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('.pert-link__label.is-critical').length).toBeGreaterThan(0)
  })

  it('menjumlahkan Te sepanjang satu rantai kritis berurutan di statistik', () => {
    openAnalysis()

    const chainTe = sched.criticalChain.reduce(
      (a, id) => a + sched.byId[id].pert.expected,
      0,
    )
    expect(sched.pertDuration).toBeCloseTo(chainTe, 5)
    expect(document.body.textContent).toMatch(
      new RegExp(`Total Te rantai kritis = ${sched.pertDuration.toFixed(2)} hari`),
    )
    expect(document.body.textContent).toContain(
      `standar deviasi ${sched.pertStdDev.toFixed(2)} hari`,
    )
    // Penjelasan kenapa Te bisa lebih panjang dari CPM selalu tersedia saat itu terjadi.
    if (sched.pertDuration > sched.durationWorkingDays) {
      expect(screen.getByText(/lebih panjang dari durasi CPM/i)).toBeTruthy()
    }
  })
})
