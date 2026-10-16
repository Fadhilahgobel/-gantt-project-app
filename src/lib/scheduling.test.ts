import { describe, expect, it } from 'vitest'
import type { Dependency, ProjectData, Task } from '../types'
import { buildPert, computeLevels, createsCycle, schedule } from './scheduling'

const ALL_DAYS = { weekendDays: [], holidays: [] }

function task(id: string, durationDays: number, startDate = '2026-01-01'): Task {
  return {
    id,
    name: id,
    description: '',
    startDate,
    durationDays,
    priority: 'medium',
    color: '#DFFF00',
    progress: 0,
    status: 'todo',
    parentId: null,
    assigneeIds: [],
    optimistic: null,
    mostLikely: null,
    pessimistic: null,
  }
}

function dep(
  id: string,
  predecessorId: string,
  successorId: string,
  type: Dependency['type'] = 'FS',
  lagDays = 0,
): Dependency {
  return { id, predecessorId, successorId, type, lagDays }
}

function project(tasks: Task[], dependencies: Dependency[] = []): ProjectData {
  return {
    name: 'test',
    tasks,
    dependencies,
    resources: [],
    calendar: ALL_DAYS,
  }
}

describe('schedule - forward pass', () => {
  it('chains a Finish-to-Start dependency', () => {
    const data = project([task('A', 3), task('B', 2)], [dep('d1', 'A', 'B')])
    const res = schedule(data)
    expect(res.byId.A.esIndex).toBe(0)
    expect(res.byId.A.efIndex).toBe(2)
    expect(res.byId.B.esIndex).toBe(3)
    expect(res.byId.B.efIndex).toBe(4)
    expect(res.projectEnd).toBe('2026-01-05')
    expect(res.durationWorkingDays).toBe(5)
  })

  it('respects the task start date as an earliest-start constraint', () => {
    const data = project([task('A', 2), task('B', 2, '2026-01-10')], [dep('d1', 'A', 'B')])
    const res = schedule(data)
    expect(res.byId.A.esIndex).toBe(0)
    expect(res.byId.B.esIndex).toBe(9)
  })

  it('applies finish-to-start lag', () => {
    const data = project([task('A', 2), task('B', 2)], [dep('d1', 'A', 'B', 'FS', 2)])
    const res = schedule(data)
    expect(res.byId.A.efIndex).toBe(1)
    // 1 (akhir A) + 2 lag + 1 = 4
    expect(res.byId.B.esIndex).toBe(4)
  })

  it('applies start-to-start lag', () => {
    const data = project([task('A', 4), task('B', 2)], [dep('d1', 'A', 'B', 'SS', 1)])
    const res = schedule(data)
    expect(res.byId.B.esIndex).toBe(1)
    expect(res.byId.B.efIndex).toBe(2)
    expect(res.projectEnd).toBe('2026-01-04')
  })
})

describe('schedule - critical path & float', () => {
  it('marks the longest chain as critical', () => {
    // A -> B (4 hari) vs A -> C -> D (6 hari)
    const data = project(
      [task('A', 2), task('B', 2), task('C', 2), task('D', 2)],
      [dep('d1', 'A', 'B'), dep('d2', 'A', 'C'), dep('d3', 'C', 'D')],
    )
    const res = schedule(data)
    expect(res.criticalPath).toEqual(['A', 'C', 'D'])
    expect(res.byId.B.isCritical).toBe(false)
    expect(res.byId.B.totalFloat).toBe(2)
    expect(res.byId.A.totalFloat).toBe(0)
    expect(res.byId.D.totalFloat).toBe(0)
  })

  it('computes free float for parallel branches', () => {
    const data = project(
      [task('A', 2), task('B', 2), task('C', 2), task('D', 2)],
      [dep('d1', 'A', 'B'), dep('d2', 'A', 'C'), dep('d3', 'C', 'D')],
    )
    const res = schedule(data)
    expect(res.byId.B.freeFloat).toBe(2)
    expect(res.byId.C.freeFloat).toBe(0)
  })

  it('marks everything critical for a fully serial project', () => {
    const data = project([task('A', 2), task('B', 2)], [dep('d1', 'A', 'B')])
    const res = schedule(data)
    expect(res.criticalPath).toEqual(['A', 'B'])
  })
})

describe('schedule - working calendar integration', () => {
  it('excludes weekends from computed dates', () => {
    const data: ProjectData = {
      name: 'test',
      tasks: [
        { ...task('A', 3, '2026-10-09') },
        { ...task('B', 2, '2026-10-09') },
      ],
      dependencies: [dep('d1', 'A', 'B')],
      resources: [],
      calendar: { weekendDays: [0, 6], holidays: [] },
    }
    const res = schedule(data)
    // Jumat 9 Okt + 3 hari kerja => Selasa 13 Okt
    expect(res.byId.A.start).toBe('2026-10-09')
    expect(res.byId.A.end).toBe('2026-10-13')
    expect(res.byId.B.start).toBe('2026-10-14')
  })
})

describe('schedule - cycles', () => {
  it('reports cyclical dependencies without crashing', () => {
    const data = project(
      [task('A', 2), task('B', 2)],
      [dep('d1', 'A', 'B'), dep('d2', 'B', 'A')],
    )
    const res = schedule(data)
    expect(res.cycleIds.length).toBeGreaterThan(0)
    expect(res.tasks).toHaveLength(2)
  })

  it('createsCycle detects indirect loops', () => {
    const deps = [dep('d1', 'A', 'B'), dep('d2', 'B', 'C')]
    expect(createsCycle(deps, 'C', 'A')).toBe(true)
    expect(createsCycle(deps, 'A', 'C')).toBe(false)
    expect(createsCycle(deps, 'A', 'A')).toBe(true)
  })
})

describe('computeLevels', () => {
  it('derives nesting depth for subtasks', () => {
    const child = { ...task('B', 1), parentId: 'A' }
    const grandChild = { ...task('C', 1), parentId: 'B' }
    const levels = computeLevels([task('A', 1), child, grandChild])
    expect(levels).toEqual({ A: 0, B: 1, C: 2 })
  })
})

describe('buildPert', () => {
  it('derives defaults from duration when estimates are missing', () => {
    const est = buildPert(task('A', 10))
    expect(est.optimistic).toBe(8)
    expect(est.mostLikely).toBe(10)
    expect(est.pessimistic).toBe(13)
    expect(est.expected).toBeCloseTo((8 + 40 + 13) / 6, 5)
  })

  it('uses explicit estimates', () => {
    const t: Task = { ...task('A', 6), optimistic: 4, mostLikely: 6, pessimistic: 14 }
    const est = buildPert(t)
    expect(est.expected).toBeCloseTo((4 + 24 + 14) / 6, 5)
    expect(est.variance).toBeCloseTo(Math.pow(10 / 6, 2), 5)
  })
})

describe('schedule - fase induk (parent-child)', () => {
  it('menjadwalkan fase induk dari sub-tugas, bukan dari durasinya sendiri', () => {
    const parent = task('P', 30)
    const kidA = { ...task('A', 2), parentId: 'P' }
    const kidB = { ...task('B', 3), parentId: 'P' }
    const res = schedule(project([parent, kidA, kidB], [dep('d1', 'A', 'B')]))
    const p = res.byId.P

    expect(p.isParent).toBe(true)
    expect(p.childIds).toEqual(['A', 'B'])
    expect(p.start).toBe(res.byId.A.start)
    expect(p.end).toBe(res.byId.B.end)
    expect(p.workingDays).toBe(5)
    // Durasi 30 hari yang diisi pengguna tidak dipakai sama sekali.
    expect(p.workingDays).toBeLessThan(p.task.durationDays)
    expect(res.durationWorkingDays).toBe(5)
    expect(res.projectEnd).toBe(res.byId.B.end)
    expect(res.leafIds).toEqual(['A', 'B'])
    // Fase induk bukan node PERT: tidak pernah muncul di jalur kritis.
    expect(res.criticalPath).toEqual(['A', 'B'])
    expect(res.criticalChain).toEqual(['A', 'B'])
  })

  it('menurunkan float dan status kritis fase induk dari anaknya', () => {
    const p = task('P', 9)
    const q = task('Q', 9)
    const criticalKid = { ...task('A', 4), parentId: 'P' }
    const slackKid = { ...task('C', 2), parentId: 'Q' }
    const res = schedule(project([p, q, criticalKid, slackKid]))

    expect(res.byId.P.isCritical).toBe(true)
    expect(res.byId.P.totalFloat).toBe(0)
    expect(res.byId.Q.isCritical).toBe(false)
    expect(res.byId.Q.totalFloat).toBe(2)
    expect(res.byId.P.workingDays).toBe(4)
    expect(res.byId.Q.workingDays).toBe(2)
    expect(res.criticalPath).toEqual(['A'])
  })

  it('memakai rata-rata berbobot durasi anak untuk progres fase induk', () => {
    const parent = { ...task('P', 5), progress: 10 }
    const kidA = { ...task('A', 4), parentId: 'P', progress: 100 }
    const kidB = { ...task('B', 1), parentId: 'P', progress: 0 }
    const res = schedule(project([parent, kidA, kidB]))

    // (4 hari × 100%) + (1 hari × 0%) dibagi 5 hari = 80%
    expect(res.byId.P.rolledUpProgress).toBe(80)
    // Tugas daun tetap memakai progresnya sendiri.
    expect(res.byId.A.rolledUpProgress).toBe(100)
  })

  it('menerapkan dependensi yang menyentuh fase induk ke sub-tugasnya', () => {
    const x = task('X', 3)
    const parent = task('P', 9)
    const kidA = { ...task('A', 2), parentId: 'P' }
    const res = schedule(project([x, parent, kidA], [dep('d1', 'X', 'P')]))

    // X selesai pada hari ke-3, jadi anak fase P mulai setelah itu.
    expect(res.byId.X.efIndex).toBe(2)
    expect(res.byId.A.esIndex).toBe(3)
    expect(res.byId.P.esIndex).toBe(3)
    expect(res.byId.P.start).toBe(res.byId.A.start)
  })

  it('tidak menganggap fase induk sebagai node yang bisa dikritisi sendiri', () => {
    const parent = task('P', 2)
    const kid = { ...task('A', 5), parentId: 'P' }
    const res = schedule(project([parent, kid]))
    // Proyek mengikuti anak (5 hari), bukan durasi induk (2 hari).
    expect(res.durationWorkingDays).toBe(5)
    expect(res.projectEnd).toBe(res.byId.A.end)
  })
})

describe('schedule - pert roll-up', () => {
  it('menjumlahkan Te hanya pada satu rantai kritis berurutan', () => {
    const a = task('A', 2)
    const b = task('B', 3)
    const c = task('C', 3)
    const d = task('D', 2)
    const res = schedule(
      project(
        [a, b, c, d],
        [dep('d1', 'A', 'B'), dep('d2', 'A', 'C'), dep('d3', 'B', 'D'), dep('d4', 'C', 'D')],
      ),
    )

    // B dan C sama-sama kritis dan berjalan paralel.
    expect(res.criticalPath).toEqual(['A', 'B', 'C', 'D'])
    expect(res.criticalChain).toEqual(['A', 'B', 'D'])
    expect(res.durationWorkingDays).toBe(7)

    const chainTe = ['A', 'B', 'D'].reduce((s, id) => s + res.byId[id].pert.expected, 0)
    expect(res.pertDuration).toBeCloseTo(chainTe, 5)

    // Semua tugas kritis dijumlahkan akan menghitung cabang paralel dua kali.
    const allCriticalTe = res.criticalPath.reduce(
      (s, id) => s + res.byId[id].pert.expected,
      0,
    )
    expect(res.pertDuration).toBeLessThan(allCriticalTe)
    expect(res.pertDuration).toBeLessThan(res.durationWorkingDays * 1.1)

    const chainVariance = ['A', 'B', 'D'].reduce(
      (s, id) => s + res.byId[id].pert.variance,
      0,
    )
    expect(res.pertStdDev).toBeCloseTo(Math.sqrt(chainVariance), 5)
  })

  it('sums expected durations and variances along the critical path', () => {
    const a: Task = { ...task('A', 4), optimistic: 2, mostLikely: 4, pessimistic: 12 }
    const b: Task = { ...task('B', 4), optimistic: 3, mostLikely: 4, pessimistic: 11 }
    const res = schedule(project([a, b], [dep('d1', 'A', 'B')]))
    expect(res.pertDuration).toBeCloseTo((2 + 16 + 12) / 6 + (3 + 16 + 11) / 6, 5)
    expect(res.pertStdDev).toBeGreaterThan(0)
  })

  it('handles an empty project', () => {
    const res = schedule(project([]))
    expect(res.tasks).toHaveLength(0)
    expect(res.criticalPath).toHaveLength(0)
  })
})
