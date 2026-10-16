import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SEED_VERSION, createSeedData } from '../data/seed'
import { parseISO, toISO } from '../lib/dateUtils'
import { schedule as buildSchedule } from '../lib/scheduling'
import { DEFAULT_COLORS } from '../types'
import type {
  Dependency,
  Priority,
  ProjectData,
  Resource,
  Task,
  TaskStatus,
} from '../types'
import {
  ProjectContext,
  type DependencyInput,
  type ProjectApi,
  type ResourceInput,
  type TaskInput,
} from './projectContext'

export const STORAGE_KEY = 'gantt.pm.data.v1'

export function uid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9)
  return `${prefix}_${rand}${Date.now().toString(36).slice(-3)}`
}

const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high']
const STATUSES: readonly TaskStatus[] = ['todo', 'in-progress', 'blocked', 'done']

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/**
 * Tanggal mulai wajib ISO `YYYY-MM-DD` dan benar-benar ada (bukan `2026-13-45`).
 * Nilai rusak diganti hari ini agar tugas tetap tampil dan bisa diperbaiki pengguna.
 */
function repairStartDate(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (toISO(parseISO(value)) === value) return value
  }
  return toISO(new Date())
}

/** Pastikan data dari localStorage berbentuk valid. */
function normalize(raw: unknown): ProjectData | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<ProjectData>
  if (!Array.isArray(obj.tasks) || !Array.isArray(obj.resources)) return null
  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Proyek Tanpa Nama',
    tasks: obj.tasks
      .filter((t): t is Task => !!t && typeof t.id === 'string')
      .map((t) => ({
        ...t,
        name: typeof t.name === 'string' && t.name.trim() ? t.name : 'Tugas Tanpa Nama',
        startDate: repairStartDate(t.startDate),
        assigneeIds: Array.isArray(t.assigneeIds)
          ? t.assigneeIds.filter((a): a is string => typeof a === 'string')
          : [],
        description: typeof t.description === 'string' ? t.description : '',
        priority: pick(t.priority, PRIORITIES, 'medium'),
        status: pick(t.status, STATUSES, 'todo'),
        color: typeof t.color === 'string' && t.color ? t.color : DEFAULT_COLORS[0],
        parentId: typeof t.parentId === 'string' ? t.parentId : null,
        progress: Math.min(100, Math.max(0, Number(t.progress) || 0)),
        durationDays: Math.max(1, Math.round(Number(t.durationDays) || 1)),
        optimistic: t.optimistic ?? null,
        mostLikely: t.mostLikely ?? null,
        pessimistic: t.pessimistic ?? null,
      })),
    dependencies: Array.isArray(obj.dependencies)
      ? obj.dependencies.filter(
          (d): d is Dependency =>
            !!d && typeof d.id === 'string' && typeof d.predecessorId === 'string',
        )
      : [],
    resources: obj.resources.filter(
      (r): r is Resource => !!r && typeof r.id === 'string' && typeof r.name === 'string',
    ),
    calendar: {
      weekendDays: Array.isArray(obj.calendar?.weekendDays)
        ? obj.calendar.weekendDays
        : [0, 6],
      holidays: Array.isArray(obj.calendar?.holidays) ? obj.calendar.holidays : [],
    },
  }
}

/** Data tersimpan = ProjectData + penanda versi seed yang menyimpannya. */
type StoredData = ProjectData & { seedVersion?: number }

function loadInitial(): ProjectData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredData | null
      // Versi seed tidak ada atau berbeda -> data lama diganti seed terbaru
      // supaya contoh data yang baru ikut terpakai.
      if (parsed?.seedVersion === SEED_VERSION) {
        const normalized = normalize(parsed)
        if (normalized) return normalized
      }
    }
  } catch {
    /* data rusak -> pakai seed */
  }
  return createSeedData()
}

/** Semua keturunan (sub-tugas) dari sebuah id, termasuk dirinya sendiri. */
function collectSubtree(tasks: Task[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const t of tasks) {
      if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) {
        ids.add(t.id)
        changed = true
      }
    }
  }
  return ids
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProjectData>(loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...data, seedVersion: SEED_VERSION }),
      )
    } catch {
      /* kuota penuh / mode privat: abaikan */
    }
  }, [data])

  const schedule = useMemo(() => buildSchedule(data), [data])

  const addTask = useCallback<ProjectApi['addTask']>((input: TaskInput) => {
    const id = uid('t')
    setData((d) => ({ ...d, tasks: [...d.tasks, { ...input, id }] }))
    return id
  }, [])

  const updateTask = useCallback<ProjectApi['updateTask']>((id, patch) => {
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }, [])

  const deleteTask = useCallback<ProjectApi['deleteTask']>((id) => {
    setData((d) => {
      const doomed = collectSubtree(d.tasks, id)
      return {
        ...d,
        tasks: d.tasks
          .filter((t) => !doomed.has(t.id))
          .map((t) => (t.parentId && doomed.has(t.parentId) ? { ...t, parentId: null } : t)),
        dependencies: d.dependencies.filter(
          (dep) => !doomed.has(dep.predecessorId) && !doomed.has(dep.successorId),
        ),
      }
    })
  }, [])

  const addDependency = useCallback<ProjectApi['addDependency']>(
    (input: DependencyInput) => {
      setData((d) => ({
        ...d,
        dependencies: [...d.dependencies, { ...input, id: uid('dep') }],
      }))
    },
    [],
  )

  const updateDependency = useCallback<ProjectApi['updateDependency']>((id, patch) => {
    setData((d) => ({
      ...d,
      dependencies: d.dependencies.map((dep) => (dep.id === id ? { ...dep, ...patch } : dep)),
    }))
  }, [])

  const deleteDependency = useCallback<ProjectApi['deleteDependency']>((id) => {
    setData((d) => ({ ...d, dependencies: d.dependencies.filter((dep) => dep.id !== id) }))
  }, [])

  const addResource = useCallback<ProjectApi['addResource']>((input: ResourceInput) => {
    setData((d) => ({ ...d, resources: [...d.resources, { ...input, id: uid('r') }] }))
  }, [])

  const updateResource = useCallback<ProjectApi['updateResource']>((id, patch) => {
    setData((d) => ({
      ...d,
      resources: d.resources.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))
  }, [])

  const deleteResource = useCallback<ProjectApi['deleteResource']>((id) => {
    setData((d) => ({
      ...d,
      resources: d.resources.filter((r) => r.id !== id),
      tasks: d.tasks.map((t) =>
        t.assigneeIds.includes(id)
          ? { ...t, assigneeIds: t.assigneeIds.filter((a) => a !== id) }
          : t,
      ),
    }))
  }, [])

  const updateCalendar = useCallback<ProjectApi['updateCalendar']>((patch) => {
    setData((d) => ({ ...d, calendar: { ...d.calendar, ...patch } }))
  }, [])

  const renameProject = useCallback<ProjectApi['renameProject']>((name) => {
    setData((d) => ({ ...d, name }))
  }, [])

  const resetToSeed = useCallback(() => {
    setData(createSeedData())
  }, [])

  const importData = useCallback<ProjectApi['importData']>((next: ProjectData) => {
    setData(normalize(next) ?? createSeedData())
  }, [])

  const value = useMemo<ProjectApi>(
    () => ({
      data,
      schedule,
      addTask,
      updateTask,
      deleteTask,
      addDependency,
      updateDependency,
      deleteDependency,
      addResource,
      updateResource,
      deleteResource,
      updateCalendar,
      renameProject,
      resetToSeed,
      importData,
    }),
    [
      data,
      schedule,
      addTask,
      updateTask,
      deleteTask,
      addDependency,
      updateDependency,
      deleteDependency,
      addResource,
      updateResource,
      deleteResource,
      updateCalendar,
      renameProject,
      resetToSeed,
      importData,
    ],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}
