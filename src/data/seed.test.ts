import { describe, expect, it } from 'vitest'
import { countWorkingDaysInclusive, isWorkingDay, parseISO } from '../lib/dateUtils'
import { schedule } from '../lib/scheduling'
import { createSeedData } from './seed'

const data = createSeedData()
const result = schedule(data)

/** Fase induk pada seed: tugas yang punya sub-tugas. */
const PHASE_IDS = ['t1', 't5', 't9', 't14']
const childrenOf = (id: string) =>
  data.tasks.filter((t) => t.parentId === id).map((t) => result.byId[t.id])

describe('seed data', () => {
  it('berisi 18 tugas, 6 anggota tim, dan 15 dependensi', () => {
    expect(data.tasks).toHaveLength(18)
    expect(data.resources).toHaveLength(6)
    expect(data.dependencies).toHaveLength(15)
  })

  it('memuat minimal satu tugas untuk tiap prioritas', () => {
    ;(['high', 'medium', 'low'] as const).forEach((p) => {
      expect(data.tasks.filter((t) => t.priority === p).length).toBeGreaterThan(0)
    })
  })

  it('memiliki id unik dan referensi yang valid', () => {
    const ids = data.tasks.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    data.tasks.forEach((t) => {
      expect(t.durationDays).toBeGreaterThanOrEqual(1)
      expect(t.progress).toBeGreaterThanOrEqual(0)
      expect(t.progress).toBeLessThanOrEqual(100)
      if (t.parentId) expect(ids).toContain(t.parentId)
      t.assigneeIds.forEach((a) => {
        expect(data.resources.map((r) => r.id)).toContain(a)
      })
    })
    data.dependencies.forEach((d) => {
      expect(ids).toContain(d.predecessorId)
      expect(ids).toContain(d.successorId)
      expect(d.predecessorId).not.toBe(d.successorId)
    })
    ;[...data.calendar.holidays, ...data.tasks.map((t) => t.startDate)].forEach((iso) => {
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('terjadwal tanpa siklus dependensi', () => {
    expect(result.cycleIds).toHaveLength(0)
    expect(result.tasks).toHaveLength(18)
  })

  it('menempatkan setiap tugas mulai pada hari kerja', () => {
    result.tasks.forEach((s) => {
      expect(isWorkingDay(s.start, data.calendar)).toBe(true)
      expect(isWorkingDay(s.end, data.calendar)).toBe(true)
    })
  })

  it('menghitung durasi tepat sama dengan durasi hari kerja tugas daun', () => {
    result.tasks
      .filter((s) => !s.isParent)
      .forEach((s) => {
        expect(countWorkingDaysInclusive(s.start, s.end, data.calendar)).toBe(
          s.task.durationDays,
        )
        expect(s.workingDays).toBe(s.task.durationDays)
      })
  })

  it('menggulung fase induk dari sub-tugas, bukan dari durasinya sendiri', () => {
    expect(result.tasks.filter((s) => s.isParent).map((s) => s.task.id)).toEqual(PHASE_IDS)

    PHASE_IDS.forEach((id) => {
      const p = result.byId[id]
      const children = childrenOf(id)
      expect(children.length).toBeGreaterThan(0)
      expect(p.start).toBe([...children.map((c) => c.start)].sort()[0])
      expect(p.end).toBe([...children.map((c) => c.end)].sort().at(-1))
      expect(p.esIndex).toBe(Math.min(...children.map((c) => c.esIndex)))
      expect(p.efIndex).toBe(Math.max(...children.map((c) => c.efIndex)))
      expect(p.lsIndex).toBe(Math.min(...children.map((c) => c.lsIndex)))
      expect(p.lfIndex).toBe(Math.max(...children.map((c) => c.lfIndex)))
      expect(p.totalFloat).toBe(Math.min(...children.map((c) => c.totalFloat)))
      expect(p.isCritical).toBe(children.some((c) => c.isCritical))
      expect(p.workingDays).toBe(p.efIndex - p.esIndex + 1)
      // panjang gulungan tidak harus sama dengan durasi yang diisi pengguna
      expect(p.childIds).toEqual(children.map((c) => c.task.id))
    })

    // Fase Perencanaan & Riset: mulai bersama anak pertamanya, selesai bersama
    // anak terakhirnya (t4) — bukan 10 hari kerja durasinya sendiri.
    expect(result.byId.t1.start).toBe(result.byId.t2.start)
    expect(result.byId.t1.end).toBe(result.byId.t4.end)
    expect(result.byId.t1.workingDays).toBeLessThan(result.byId.t1.task.durationDays)
  })

  it('menghitung progres fase induk sebagai rata-rata berbobot durasi anak', () => {
    const children = childrenOf('t5')
    const weight = children.reduce((a, c) => a + c.workingDays, 0)
    const expected = Math.round(
      children.reduce((a, c) => a + c.workingDays * c.task.progress, 0) / weight,
    )
    expect(result.byId.t5.rolledUpProgress).toBe(expected)
    // t6 100% (4 hari), t7 60% (6 hari), t8 20% (5 hari)
    expect(result.byId.t5.rolledUpProgress).toBe(57)
  })

  it('tidak menjadikan fase induk sebagai tugas kritis maupun node PERT', () => {
    PHASE_IDS.forEach((id) => {
      expect(result.criticalPath).not.toContain(id)
      expect(result.criticalChain).not.toContain(id)
    })
    expect(result.criticalPath).toEqual(
      result.criticalPath.filter((id) => !PHASE_IDS.includes(id)),
    )
    expect(result.leafIds).toEqual(
      data.tasks.filter((t) => !PHASE_IDS.includes(t.id)).map((t) => t.id),
    )
  })

  it('menerapkan jeda Start-to-Start dengan benar (t7 -> t8, lag 2)', () => {
    const t7 = result.byId.t7
    const t8 = result.byId.t8
    expect(t8.esIndex - t7.esIndex).toBe(2)
  })

  it('menerapkan jeda Finish-to-Start dengan benar (t16 -> t17, lag 1)', () => {
    const t16 = result.byId.t16
    const t17 = result.byId.t17
    // 1 hari kerja setelah akhir t16, ditambah 1 hari lag
    expect(t17.esIndex - t16.efIndex).toBe(2)
  })

  it('menghasilkan jalur kritis yang konsisten dan maju', () => {
    expect(result.criticalPath.length).toBeGreaterThan(3)
    const indices = result.criticalPath.map((id) => result.byId[id].esIndex)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    result.criticalPath.forEach((id) => expect(result.byId[id].totalFloat).toBe(0))
    expect(result.criticalPath[result.criticalPath.length - 1]).toBe('t17')
  })

  it('menghitung durasi proyek yang wajar', () => {
    expect(result.durationWorkingDays).toBeGreaterThan(30)
    // t18 (Rendah, tanpa penerus) tidak menggeser tenggat proyek, tapi punya float.
    expect(result.durationWorkingDays).toBe(53)
    expect(result.byId.t18.totalFloat).toBeGreaterThan(0)
    expect(result.projectStart).toBe('2026-10-05')
    expect(parseISO(result.projectEnd) > parseISO(result.projectStart)).toBe(true)
    // tidak ada tugas non-kritis yang punya float negatif
    result.tasks.forEach((s) => {
      expect(s.totalFloat).toBeGreaterThanOrEqual(0)
      expect(s.freeFloat).toBeGreaterThanOrEqual(0)
      expect(s.freeFloat).toBeLessThanOrEqual(s.totalFloat)
    })
  })

  it('menjumlahkan Te hanya sepanjang satu rantai kritis yang berurutan', () => {
    expect(result.criticalChain.length).toBeGreaterThan(3)

    // Rantai harus benar-benar berurutan lewat dependensi nyata, tidak melompat.
    for (let i = 1; i < result.criticalChain.length; i += 1) {
      const from = result.criticalChain[i - 1]
      const to = result.criticalChain[i]
      expect(
        data.dependencies.some((d) => d.predecessorId === from && d.successorId === to),
      ).toBe(true)
      expect(result.byId[to].esIndex).toBeGreaterThanOrEqual(result.byId[from].esIndex)
      expect(result.byId[to].totalFloat).toBe(0)
    }

    const chainTe = result.criticalChain.reduce(
      (a, id) => a + result.byId[id].pert.expected,
      0,
    )
    expect(result.pertDuration).toBeCloseTo(chainTe, 5)

    // Tanpa cabang kritis paralel, rantai = semua tugas kritis pada seed ini.
    const allCriticalTe = result.criticalPath.reduce(
      (a, id) => a + result.byId[id].pert.expected,
      0,
    )
    expect(result.pertDuration).toBeLessThanOrEqual(allCriticalTe)
  })

  it('memberi estimasi PERT yang lebih lama dari CPM pada kasus pesimistis', () => {
    const chainTe = result.criticalChain.reduce(
      (a, id) => a + result.byId[id].pert.expected,
      0,
    )
    expect(result.pertDuration).toBeGreaterThan(result.durationWorkingDays)
    expect(result.pertStdDev).toBeGreaterThan(0)
    // Selisihnya hanya karena Te = nilai harapan, bukan karena tugas paralel
    // dihitung dua kali: totalnya tetap sebanding dengan durasi proyek.
    expect(result.pertDuration / result.durationWorkingDays).toBeLessThan(1.2)
    expect(result.pertStdDev).toBeCloseTo(
      Math.sqrt(
        result.criticalChain.reduce((a, id) => a + result.byId[id].pert.variance, 0),
      ),
      5,
    )
    expect(chainTe).toBeGreaterThan(0)
  })
})
