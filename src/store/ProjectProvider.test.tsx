// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { SEED_VERSION, createSeedData } from '../data/seed'
import {
  countWorkingDaysInclusive,
  isWorkingDay,
  nextWorkingDay,
  parseISO,
  toISO,
} from '../lib/dateUtils'
import type { ProjectData, Task } from '../types'
import { ProjectProvider, STORAGE_KEY, uid } from './ProjectProvider'
import {
  useProject,
  type ProjectApi,
  type TaskInput,
} from './projectContext'

/** Mount store asli; `result.current` selalu berisi snapshot render terbaru. */
const mount = () => renderHook(() => useProject(), { wrapper: ProjectProvider })

const PHASE_IDS = ['t1', 't5', 't9', 't14']

const taskInput = (over: Partial<Task> = {}): TaskInput => ({
  name: 'Tugas Uji Store',
  description: '',
  startDate: '2026-10-05',
  durationDays: 2,
  priority: 'medium',
  color: '#DFFF00',
  progress: 0,
  status: 'todo',
  parentId: null,
  assigneeIds: [],
  optimistic: null,
  mostLikely: null,
  pessimistic: null,
  ...over,
})

const stored = (): ProjectData =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as ProjectData

/** Invarian yang harus dipenuhi hasil penjadwalan apa pun kalender dan datanya. */
function expectScheduleConsistent(api: ProjectApi) {
  expect(api.schedule.cycleIds).toEqual([])
  expect(api.schedule.tasks).toHaveLength(api.data.tasks.length)
  api.schedule.tasks.forEach((s) => {
    expect(isWorkingDay(s.start, api.data.calendar)).toBe(true)
    expect(isWorkingDay(s.end, api.data.calendar)).toBe(true)
    if (s.isParent) {
      // Fase induk tidak dijadwalkan dari durasinya sendiri: rentangnya adalah
      // gabungan sub-tugasnya.
      const children = api.data.tasks
        .filter((t) => t.parentId === s.task.id)
        .map((t) => api.schedule.byId[t.id])
      expect(children.length).toBeGreaterThan(0)
      expect(s.start).toBe([...children.map((c) => c.start)].sort()[0])
      expect(s.end).toBe([...children.map((c) => c.end)].sort().at(-1))
    } else {
      expect(countWorkingDaysInclusive(s.start, s.end, api.data.calendar)).toBe(
        s.task.durationDays,
      )
    }
  })
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

describe('ProjectProvider — pemuatan data awal', () => {
  it('memakai seed saat localStorage kosong', () => {
    const { result } = mount()
    const seed = createSeedData()
    expect(result.current.data.name).toBe(seed.name)
    expect(result.current.data.tasks).toHaveLength(18)
    expect(result.current.data.resources).toHaveLength(6)
    expect(result.current.data.dependencies).toHaveLength(15)
    expect(
      result.current.data.tasks.filter((t) => t.parentId === null).map((t) => t.id),
    ).toEqual(PHASE_IDS)
  })

  it('memuat data tersimpan dari localStorage apa adanya bila versi seed sama', () => {
    const saved = createSeedData()
    saved.name = 'Proyek Dari Storage'
    saved.tasks = saved.tasks.slice(0, 3)
    saved.dependencies = []
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...saved, seedVersion: SEED_VERSION }),
    )

    const { result } = mount()
    expect(result.current.data.name).toBe('Proyek Dari Storage')
    expect(result.current.data.tasks).toHaveLength(3)
    expect(result.current.schedule.tasks).toHaveLength(3)
  })

  it('jatuh kembali ke seed saat JSON rusak', () => {
    localStorage.setItem(STORAGE_KEY, '{bukan json sama sekali')
    const { result } = mount()
    expect(result.current.data.tasks).toHaveLength(18)
  })

  it('jatuh kembali ke seed saat bentuk data tidak dikenali', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Rusak', tasks: 'bukan array', resources: null }),
    )
    const { result } = mount()
    expect(result.current.data.tasks).toHaveLength(18)
    expect(result.current.data.resources).toHaveLength(6)
  })

  it('mengganti data localStorage versi lama dengan seed baru', () => {
    const legacy = createSeedData()
    legacy.name = 'Proyek Versi Lama'
    legacy.tasks = legacy.tasks.slice(0, 3)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...legacy, seedVersion: SEED_VERSION - 1 }),
    )

    const { result } = mount()
    expect(result.current.data.name).toBe(createSeedData().name)
    expect(result.current.data.tasks).toHaveLength(18)
  })
})

describe('ProjectProvider — persistensi localStorage', () => {
  it('menyimpan setiap perubahan ke key storage', () => {
    const { result } = mount()
    act(() => {
      result.current.addTask(taskInput({ name: 'Tugas Persisten Store' }))
    })

    const raw = stored()
    expect(raw.tasks).toHaveLength(19)
    expect(raw.tasks.at(-1)?.name).toBe('Tugas Persisten Store')

    act(() => {
      result.current.renameProject('Nama Proyek Baru')
    })
    expect(stored().name).toBe('Nama Proyek Baru')
  })
})

describe('ProjectProvider — normalisasi data eksternal', () => {
  it('memperbaiki nilai yang tidak masuk akal pada importData', () => {
    const { result } = mount()
    const messy = {
      name: '   ',
      calendar: { holidays: ['2026-12-25'] },
      resources: [{ id: 'rA', name: 'Andi Uji' }, { name: 'tanpa id' }, null],
      dependencies: 'bukan array',
      tasks: [
        {
          id: 'x1',
          name: 'Progres 250 & durasi 0',
          startDate: '2026-10-05',
          durationDays: 0,
          progress: 250,
          priority: 'low',
          color: '#DFFF00',
          status: 'todo',
          parentId: null,
        },
        {
          id: 'x2',
          name: '   ',
          startDate: 'bukan tanggal',
          durationDays: 'abc',
          progress: -20,
          priority: 'urgent',
          status: 'selesai',
          color: '',
          parentId: 1234,
        },
        { id: 'x3', name: 'Tanggal mustahil', startDate: '2026-13-45', durationDays: 2 },
        { name: 'tanpa id' },
        null,
      ],
    }

    act(() => {
      result.current.importData(messy as unknown as ProjectData)
    })

    const today = toISO(new Date())
    const data = result.current.data
    expect(data.name).toBe('Proyek Tanpa Nama')
    expect(data.tasks.map((t) => t.id)).toEqual(['x1', 'x2', 'x3'])
    expect(data.tasks[0].progress).toBe(100)
    expect(data.tasks[1].progress).toBe(0)
    expect(data.tasks[0].durationDays).toBe(1)
    expect(data.tasks[1].durationDays).toBe(1)
    expect(data.tasks[0].description).toBe('')
    expect(data.tasks[0].assigneeIds).toEqual([])
    expect(data.tasks[0].optimistic).toBeNull()
    // tanggal rusak / mustahil diganti hari ini, bukan membuat aplikasi crash
    expect(data.tasks[0].startDate).toBe('2026-10-05')
    expect(data.tasks[1].startDate).toBe(today)
    expect(data.tasks[2].startDate).toBe(today)
    expect(data.tasks.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.startDate))).toBe(true)
    expect(data.tasks[1].name).toBe('Tugas Tanpa Nama')
    expect(data.tasks[1].priority).toBe('medium')
    expect(data.tasks[1].status).toBe('todo')
    expect(data.tasks[1].color).toBe('#DFFF00')
    expect(data.tasks[1].parentId).toBeNull()
    // data hasil perbaikan tetap bisa dijadwalkan
    expectScheduleConsistent(result.current)
    expect(data.resources).toHaveLength(1)
    expect(data.dependencies).toEqual([])
    expect(data.calendar.weekendDays).toEqual([0, 6])
    expect(data.calendar.holidays).toEqual(['2026-12-25'])
  })

  it('memakai seed saat payload sama sekali tidak valid', () => {
    const { result } = mount()
    act(() => {
      result.current.importData(null as unknown as ProjectData)
    })
    expect(result.current.data.tasks).toHaveLength(18)
  })
})

describe('ProjectProvider — hapus tugas berjenjang', () => {
  it('menghapus fase peluncuran beserta seluruh sub-tugas dan dependensinya', () => {
    const { result } = mount()
    act(() => {
      result.current.deleteTask('t14')
    })

    expect(result.current.data.tasks.map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
      't4',
      't5',
      't6',
      't7',
      't8',
      't9',
      't10',
      't11',
      't12',
      't13',
    ])
    // dep12 (t13->t15), dep13 (t15->t16), dep14 (t16->t17) menyentuh tugas yang ikut terhapus
    expect(result.current.data.dependencies.map((d) => d.id)).toEqual([
      'dep1',
      'dep2',
      'dep3',
      'dep4',
      'dep5',
      'dep6',
      'dep7',
      'dep8',
      'dep9',
      'dep10',
      'dep11',
    ])
    expect(result.current.schedule.tasks).toHaveLength(13)
    expect(Object.keys(result.current.schedule.byId)).not.toContain('t15')
    expect(result.current.schedule.cycleIds).toEqual([])
    // t13 (anak t9) sekarang menjadi tugas terakhir yang dijadwalkan.
    expect(result.current.schedule.leafIds).not.toContain('t14')
    expect(result.current.schedule.projectEnd).toBe(result.current.schedule.byId.t13.end)
  })

  it('menghapus fase perencanaan beserta dependensi yang menyentuh anaknya', () => {
    const { result } = mount()
    act(() => {
      result.current.deleteTask('t1')
    })

    expect(result.current.data.tasks.map((t) => t.id)).toEqual([
      't5',
      't6',
      't7',
      't8',
      't9',
      't10',
      't11',
      't12',
      't13',
      't14',
      't15',
      't16',
      't17',
      't18',
    ])
    // dep1..dep4 menyentuh t2/t3/t4
    expect(result.current.data.dependencies.map((d) => d.id)).toEqual([
      'dep5',
      'dep6',
      'dep7',
      'dep8',
      'dep9',
      'dep10',
      'dep11',
      'dep12',
      'dep13',
      'dep14',
      'dep15',
    ])
  })

  it('tidak menyisakan parentId menggantung atau dependensi yatim', () => {
    const { result } = mount()
    act(() => {
      result.current.deleteTask('t9')
    })

    const ids = result.current.data.tasks.map((t) => t.id)
    result.current.data.tasks.forEach((t) => {
      if (t.parentId) expect(ids).toContain(t.parentId)
    })
    result.current.data.dependencies.forEach((d) => {
      expect(ids).toContain(d.predecessorId)
      expect(ids).toContain(d.successorId)
    })
    expect(result.current.schedule.cycleIds).toEqual([])
  })
})

describe('ProjectProvider — hapus anggota tim', () => {
  it('melepas alokasi anggota dari semua tugas', () => {
    const { result } = mount()
    expect(result.current.data.tasks.some((t) => t.assigneeIds.includes('r1'))).toBe(true)

    act(() => {
      result.current.deleteResource('r1')
    })

    expect(result.current.data.resources.map((r) => r.id)).not.toContain('r1')
    expect(result.current.data.resources).toHaveLength(5)
    result.current.data.tasks.forEach((t) => {
      expect(t.assigneeIds).not.toContain('r1')
    })
    stored().tasks.forEach((t) => {
      expect(t.assigneeIds).not.toContain('r1')
    })
  })
})

describe('ProjectProvider — operasi CRUD', () => {
  it('addTask mengembalikan id unik dan tugas baru ikut terjadwal', () => {
    const { result } = mount()
    let id = ''
    act(() => {
      id = result.current.addTask(taskInput({ startDate: '2026-10-05', durationDays: 3 }))
    })

    expect(id).not.toBe('')
    expect(result.current.data.tasks).toHaveLength(19)
    expect(result.current.data.tasks.filter((t) => t.id === id)).toHaveLength(1)
    const scheduled = result.current.schedule.byId[id]
    expect(scheduled.start).toBe('2026-10-05')
    expect(
      countWorkingDaysInclusive(scheduled.start, scheduled.end, result.current.data.calendar),
    ).toBe(3)
  })

  it('updateTask hanya mengubah tugas yang dituju dan jadwal ikut menyesuaikan', () => {
    const { result } = mount()
    const before = result.current.schedule.byId.t2.end

    act(() => {
      result.current.updateTask('t2', { name: 'Riset (revisi)', durationDays: 9 })
    })

    const t2 = result.current.data.tasks.find((t) => t.id === 't2') as Task
    expect(t2.name).toBe('Riset (revisi)')
    expect(t2.durationDays).toBe(9)
    expect(result.current.schedule.byId.t2.end > before).toBe(true)
    expect(result.current.data.tasks.find((t) => t.id === 't3')?.name).toBe(
      'Analisis Kompetitor',
    )
  })

  it('dependensi bisa ditambah, diubah, dan dihapus', () => {
    const { result } = mount()

    act(() => {
      result.current.addDependency({
        predecessorId: 't2',
        successorId: 't8',
        type: 'FS',
        lagDays: 3,
      })
    })
    const deps = result.current.data.dependencies
    expect(deps).toHaveLength(16)
    const added = deps.at(-1)
    expect(added?.predecessorId).toBe('t2')
    expect(added?.successorId).toBe('t8')
    expect(added?.type).toBe('FS')
    expect(added?.lagDays).toBe(3)
    expect(new Set(deps.map((d) => d.id)).size).toBe(16)
    const addedId = (added as { id: string }).id

    act(() => {
      result.current.updateDependency(addedId, { lagDays: 0, type: 'SS' })
    })
    const updated = result.current.data.dependencies.find((d) => d.id === addedId)
    expect(updated?.lagDays).toBe(0)
    expect(updated?.type).toBe('SS')

    act(() => {
      result.current.deleteDependency(addedId)
    })
    expect(result.current.data.dependencies).toHaveLength(15)
  })

  it('anggota tim bisa ditambah, diubah, dan dihapus', () => {
    const { result } = mount()

    act(() => {
      result.current.addResource({
        name: 'Nadia Uji',
        email: 'nadia@kilat.id',
        role: 'Analis',
        salary: 9_000_000,
      })
    })
    expect(result.current.data.resources).toHaveLength(7)
    const addedId = (result.current.data.resources.at(-1) as { id: string }).id
    expect(result.current.data.resources.at(-1)?.email).toBe('nadia@kilat.id')
    expect(new Set(result.current.data.resources.map((r) => r.id)).size).toBe(7)

    act(() => {
      result.current.updateResource(addedId, { role: 'Lead Analis' })
    })
    expect(result.current.data.resources.at(-1)?.role).toBe('Lead Analis')

    act(() => {
      result.current.deleteResource(addedId)
    })
    expect(result.current.data.resources).toHaveLength(6)
  })

  it('resetToSeed mengembalikan seluruh data setelah diubah', () => {
    const { result } = mount()
    act(() => {
      result.current.renameProject('Proyek Rusak')
      result.current.addTask(taskInput({ name: 'Sampah' }))
      result.current.deleteResource('r1')
      result.current.updateCalendar({ holidays: ['2026-08-17'] })
    })
    expect(result.current.data.tasks).toHaveLength(19)

    act(() => {
      result.current.resetToSeed()
    })

    expect(result.current.data).toEqual(createSeedData())
    expect(stored().name).toBe(createSeedData().name)
  })

  it('uid menghasilkan id unik dengan prefix yang jelas', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => uid('t')))
    expect(ids.size).toBe(2000)
    expect(uid('t').startsWith('t_')).toBe(true)
    expect(uid('dep').startsWith('dep_')).toBe(true)
  })
})

describe('ProjectProvider — kalender reaktif', () => {
  it('menambah hari libur menggeser jadwal dan menjaga invarian hari kerja', () => {
    const { result } = mount()
    expect(result.current.data.calendar.holidays).not.toContain('2026-10-05')
    expect(result.current.schedule.byId.t2.start).toBe('2026-10-05')

    act(() => {
      result.current.updateCalendar({
        holidays: [...result.current.data.calendar.holidays, '2026-10-05'],
      })
    })

    expect(isWorkingDay('2026-10-05', result.current.data.calendar)).toBe(false)
    expect(result.current.schedule.byId.t2.start).toBe(
      nextWorkingDay('2026-10-05', result.current.data.calendar),
    )
    expect(result.current.schedule.byId.t2.start).toBe('2026-10-06')
    expectScheduleConsistent(result.current)
  })

  it('mengubah akhir pekan dihormati oleh setiap tanggal mulai dan selesai', () => {
    const { result } = mount()
    const seedEnd = result.current.schedule.projectEnd

    // Jumat & Sabtu jadi akhir pekan (bukan Sabtu & Minggu)
    act(() => {
      result.current.updateCalendar({ weekendDays: [5, 6] })
    })

    expect(result.current.data.calendar.weekendDays).toEqual([5, 6])
    expectScheduleConsistent(result.current)
    expect(
      result.current.schedule.tasks.every(
        (s) => !result.current.data.calendar.weekendDays.includes(parseISO(s.start).getDay()),
      ),
    ).toBe(true)
    expect(result.current.schedule.projectEnd).not.toBe(seedEnd)
  })
})
