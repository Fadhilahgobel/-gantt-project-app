import type { CalendarConfig, Dependency, ProjectData, Task } from '../types'
import {
  addDaysISO,
  diffDays,
  isWorkingDay,
  nextWorkingDay,
} from './dateUtils'

/**
 * Kalender hari kerja: kumpulan hari kerja dalam satu rentang,
 * dengan pemetaan bolak-balik antara tanggal ISO dan indeks hari kerja.
 */
export class WorkingCalendar {
  readonly days: string[]
  private readonly indexByDay: Map<string, number>

  constructor(cal: CalendarConfig, fromIso: string, toIso: string) {
    this.days = []
    this.indexByDay = new Map()
    const total = diffDays(fromIso, toIso)
    for (let i = 0; i <= total; i += 1) {
      const iso = addDaysISO(fromIso, i)
      if (isWorkingDay(iso, cal)) {
        this.indexByDay.set(iso, this.days.length)
        this.days.push(iso)
      }
    }
  }

  get length(): number {
    return this.days.length
  }

  /** Indeks hari kerja tepat untuk `iso`, atau -1 bila bukan hari kerja. */
  exactIndexOf(iso: string): number {
    const idx = this.indexByDay.get(iso)
    return idx === undefined ? -1 : idx
  }

  /** Indeks hari kerja pertama pada/ setelah `iso` (di-snap ke hari kerja). */
  indexOf(iso: string): number {
    const exact = this.exactIndexOf(iso)
    if (exact >= 0) return exact
    for (let i = 0; i < this.days.length; i += 1) {
      if (this.days[i] >= iso) return i
    }
    return Math.max(0, this.days.length - 1)
  }

  dateAt(index: number): string {
    return this.days[index] ?? this.days[this.days.length - 1] ?? ''
  }
}

export interface PertEstimate {
  optimistic: number
  mostLikely: number
  pessimistic: number
  /** Durasi harapan (o + 4m + p) / 6, hari kerja. */
  expected: number
  /** Variansi ((p - o) / 6)^2. */
  variance: number
}

export interface ScheduledTask {
  task: Task
  /** Tanggal mulai terhitung (hasil penjadwalan). */
  start: string
  /** Tanggal selesai terhitung, inklusif. */
  end: string
  esIndex: number
  efIndex: number
  lsIndex: number
  lfIndex: number
  /** Total float (slack) dalam hari kerja. */
  totalFloat: number
  /** Free float dalam hari kerja. */
  freeFloat: number
  isCritical: boolean
  level: number
  pert: PertEstimate
  /**
   * true bila tugas ini fase induk (punya sub-tugas). Fase induk bukan node PERT:
   * jadwal, float, dan status kritisnya hanya gulungan dari sub-tugasnya.
   */
  isParent: boolean
  /** Id sub-tugas langsung (kosong untuk tugas daun). */
  childIds: string[]
  /**
   * Lama rentang hari kerja yang dipakai untuk menggambar tugas.
   * Daun: sama dengan durasinya. Fase induk: rentang anak paling awal → paling akhir.
   */
  workingDays: number
  /**
   * Progres hasil gulung: daun memakai progres tugasnya, fase induk memakai
   * rata-rata berbobot durasi anak-anaknya.
   */
  rolledUpProgress: number
}

export interface ScheduleResult {
  tasks: ScheduledTask[]
  byId: Record<string, ScheduledTask>
  projectStart: string
  projectEnd: string
  /** Durasi proyek dalam hari kerja. */
  durationWorkingDays: number
  /**
   * Seluruh tugas daun yang kritis, terurut berdasarkan mulai tercepat.
   * Bisa memuat cabang paralel, jadi bukan urutan rantai yang bisa dijumlahkan.
   */
  criticalPath: string[]
  /** Satu rantai kritis yang benar-benar berurutan (dipakai untuk total Te PERT). */
  criticalChain: string[]
  /** Id tugas yang terlibat siklus dependensi tak valid. */
  cycleIds: string[]
  /** Estimasi durasi PERT: jumlah Te sepanjang satu rantai kritis (hari kerja). */
  pertDuration: number
  /** Standar deviasi rantai kritis (akar jumlah variansi sepanjang rantai itu). */
  pertStdDev: number
  /** Id tugas daun (tanpa fase induk), terurut seperti data masukan. */
  leafIds: string[]
}

interface Edge {
  dependency: Dependency
  from: string
  to: string
}

/** Kedalaman hierarki parent-child untuk indentasi. */
export function computeLevels(tasks: Task[]): Record<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const levels: Record<string, number> = {}
  const resolve = (id: string, seen: Set<string>): number => {
    if (levels[id] !== undefined) return levels[id]
    if (seen.has(id)) return 0
    seen.add(id)
    const t = byId.get(id)
    if (!t || !t.parentId || !byId.has(t.parentId)) {
      levels[id] = 0
      return 0
    }
    levels[id] = resolve(t.parentId, seen) + 1
    return levels[id]
  }
  tasks.forEach((t) => resolve(t.id, new Set()))
  return levels
}

function topoOrder(ids: string[], edges: Edge[]): { order: string[]; cycleIds: string[] } {
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  ids.forEach((id) => {
    indeg.set(id, 0)
    adj.set(id, [])
  })
  const valid = edges.filter((e) => indeg.has(e.from) && indeg.has(e.to) && e.from !== e.to)
  valid.forEach((e) => {
    adj.get(e.from)?.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  })

  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift() as string
    order.push(id)
    for (const next of adj.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1
      indeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }

  const cycleIds = ids.filter((id) => !order.includes(id))
  // Tugas dalam siklus tetap diproses (abaikan sisi balik) supaya UI tidak kosong.
  return { order: [...order, ...cycleIds], cycleIds }
}

export function buildPert(task: Task): PertEstimate {
  const dur = Math.max(1, Math.round(task.durationDays))
  const o = task.optimistic ?? Math.max(1, Math.round(dur * 0.8))
  const m = task.mostLikely ?? dur
  const p = task.pessimistic ?? Math.max(1, Math.round(dur * 1.3))
  const expected = (o + 4 * m + p) / 6
  const variance = Math.pow((p - o) / 6, 2)
  return { optimistic: o, mostLikely: m, pessimistic: p, expected, variance }
}

/**
 * Peta induk → sub-tugas langsung, plus daftar tugas daun (tugas tanpa sub-tugas).
 * Tugas yang parentId-nya menggantung (induknya tidak ada) dianggap tugas daun.
 */
function buildHierarchy(tasks: Task[]): {
  childIds: Map<string, string[]>
  leafIds: string[]
} {
  const ids = new Set(tasks.map((t) => t.id))
  const childIds = new Map<string, string[]>()
  tasks.forEach((t) => {
    if (!t.parentId || !ids.has(t.parentId)) return
    const list = childIds.get(t.parentId) ?? []
    list.push(t.id)
    childIds.set(t.parentId, list)
  })
  return {
    childIds,
    leafIds: tasks.filter((t) => !childIds.has(t.id)).map((t) => t.id),
  }
}

/**
 * Susun satu rantai kritis yang berurutan: mulai dari tugas kritis paling awal,
 * lalu telusuri penerus kritis lewat dependensi (FS/SS) sampai buntu. Bila ada
 * cabang kritis paralel, dipilih cabang dengan total Te terbesar.
 *
 * Total durasi PERT dihitung dari rantai ini saja — bukan dari semua tugas
 * kritis — supaya tugas kritis yang berjalan bersamaan (mis. Start-to-Start)
 * tidak dihitung dua kali dan nilainya tetap sebanding dengan durasi proyek.
 */
function buildCriticalChain(critical: ScheduledTask[], edges: Edge[]): string[] {
  if (critical.length === 0) return []

  const critById = new Map(critical.map((s) => [s.task.id, s]))
  const successors = new Map<string, string[]>()
  const hasCriticalPredecessor = new Set<string>()
  edges.forEach((e) => {
    if (e.from === e.to) return
    if (!critById.has(e.from) || !critById.has(e.to)) return
    const list = successors.get(e.from) ?? []
    if (!list.includes(e.to)) list.push(e.to)
    successors.set(e.from, list)
    hasCriticalPredecessor.add(e.to)
  })

  const teOf = (id: string) => critById.get(id)?.pert.expected ?? 0
  const totalTe = (chain: string[]) => chain.reduce((a, id) => a + teOf(id), 0)
  const memo = new Map<string, string[]>()
  const walking = new Set<string>()

  /** Rantai terpanjang (total Te terbesar) yang dimulai dari `id`. */
  const chainFrom = (id: string): string[] => {
    const cached = memo.get(id)
    if (cached) return cached
    if (walking.has(id)) return []
    walking.add(id)
    let best: string[] = []
    for (const next of successors.get(id) ?? []) {
      const tail = chainFrom(next)
      if (tail.length === 0) continue
      if (
        tail.length > best.length ||
        (tail.length === best.length && totalTe(tail) > totalTe(best))
      ) {
        best = tail
      }
    }
    walking.delete(id)
    const chain = [id, ...best]
    memo.set(id, chain)
    return chain
  }

  // Mulai dari tugas kritis yang tidak punya pendahulu kritis (titik masuk),
  // lalu pilih yang paling awal. Bila semua saling terkait, pakai semua kandidat.
  const entries = critical.filter((s) => !hasCriticalPredecessor.has(s.task.id))
  const roots = entries.length > 0 ? entries : critical
  return roots.reduce<string[]>((best, s) => {
    const chain = chainFrom(s.task.id)
    if (best.length === 0) return chain
    const bestStart = critById.get(best[0])?.esIndex ?? 0
    if (s.esIndex < bestStart) return chain
    if (s.esIndex > bestStart) return best
    return totalTe(chain) > totalTe(best) ? chain : best
  }, [])
}

/**
 * Penjadwalan proyek: forward/backward pass (CPM) pada graf dependensi
 * dengan dukungan Finish-to-Start dan Start-to-Start beserta lag hari kerja.
 *
 * Hanya tugas daun yang dijadwalkan. Fase induk (tugas yang punya sub-tugas)
 * tidak pernah dijadwalkan dari durasinya sendiri: tanggal mulai = mulai paling
 * awal anak, tanggal selesai = selesai paling akhir anak, float & status kritis
 * diturunkan dari anak, dan progresnya rata-rata berbobot durasi anak.
 */
export function schedule(data: ProjectData): ScheduleResult {
  const { tasks, dependencies, calendar } = data
  const levels = computeLevels(tasks)
  const { childIds, leafIds } = buildHierarchy(tasks)
  const durOf = (t: Task) => Math.max(1, Math.round(t.durationDays))

  if (tasks.length === 0) {
    return {
      tasks: [],
      byId: {},
      projectStart: '',
      projectEnd: '',
      durationWorkingDays: 0,
      criticalPath: [],
      criticalChain: [],
      cycleIds: [],
      pertDuration: 0,
      pertStdDev: 0,
      leafIds: [],
    }
  }

  // Rentang kalender yang cukup luas untuk seluruh penjadwalan.
  const starts = tasks.map((t) => nextWorkingDay(t.startDate, calendar))
  const minStart = starts.reduce((a, b) => (a < b ? a : b))
  const maxStart = starts.reduce((a, b) => (a > b ? a : b))
  const horizon = tasks.reduce((a, t) => a + durOf(t), 0) + 120
  const cal = new WorkingCalendar(calendar, minStart, addDaysISO(maxStart, horizon + 40))

  const taskById = new Map(tasks.map((t) => [t.id, t]))

  // Fase induk tidak dijadwalkan; hanya tugas daun yang menjadi node CPM/PERT.
  // Fallback ke semua tugas bila hierarki tidak menyisakan satu daun pun.
  const scheduledIds = leafIds.length > 0 ? leafIds : tasks.map((t) => t.id)
  const leafSet = new Set(scheduledIds)

  /** Seluruh tugas daun di bawah sebuah tugas (dirinya sendiri bila sudah daun). */
  const leavesOf = (id: string): string[] => {
    if (leafSet.has(id)) return [id]
    const out: string[] = []
    const stack = [...(childIds.get(id) ?? [])]
    const seen = new Set<string>([id])
    while (stack.length > 0) {
      const cur = stack.pop() as string
      if (seen.has(cur)) continue
      seen.add(cur)
      if (leafSet.has(cur)) out.push(cur)
      else stack.push(...(childIds.get(cur) ?? []))
    }
    return out
  }

  /*
   * Dependensi yang menyentuh fase induk diterapkan ke setiap sub-tugas daunnya,
   * karena fase induk hanya label pengelompok. Pasangan duplikat dibuang.
   */
  const edges: Edge[] = []
  const seenEdge = new Set<string>()
  dependencies.forEach((d) => {
    leavesOf(d.predecessorId).forEach((from) => {
      leavesOf(d.successorId).forEach((to) => {
        if (from === to) return
        const key = `${from}->${to}`
        if (seenEdge.has(key)) return
        seenEdge.add(key)
        edges.push({ dependency: d, from, to })
      })
    })
  })

  const { order, cycleIds } = topoOrder(scheduledIds, edges)
  const position = new Map(order.map((id, i) => [id, i]))
  const cycleSet = new Set(cycleIds)

  const isBackEdge = (e: Edge) =>
    cycleSet.has(e.from) &&
    cycleSet.has(e.to) &&
    (position.get(e.from) ?? 0) >= (position.get(e.to) ?? 0)

  const es = new Map<string, number>()
  const ef = new Map<string, number>()

  // Forward pass.
  for (const id of order) {
    const t = taskById.get(id)
    if (!t) continue
    let start = cal.indexOf(nextWorkingDay(t.startDate, calendar))
    for (const e of edges) {
      if (e.to !== id || isBackEdge(e)) continue
      const predEs = es.get(e.from)
      const predEf = ef.get(e.from)
      if (predEs === undefined || predEf === undefined) continue
      if (e.dependency.type === 'FS') {
        start = Math.max(start, predEf + e.dependency.lagDays + 1)
      } else {
        start = Math.max(start, predEs + e.dependency.lagDays)
      }
    }
    const finish = start + durOf(t) - 1
    es.set(id, start)
    ef.set(id, finish)
  }

  const projectEndIndex = Math.max(...order.map((id) => ef.get(id) ?? 0))
  const projectStartIndex = Math.min(...order.map((id) => es.get(id) ?? 0))

  const ls = new Map<string, number>()
  const lf = new Map<string, number>()

  // Backward pass.
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const id = order[i]
    const t = taskById.get(id)
    if (!t) continue
    const dur = durOf(t)
    let latest = projectEndIndex - dur + 1
    for (const e of edges) {
      if (e.from !== id || isBackEdge(e)) continue
      const succLs = ls.get(e.to)
      if (succLs === undefined) continue
      if (e.dependency.type === 'FS') {
        latest = Math.min(latest, succLs - e.dependency.lagDays - dur)
      } else {
        latest = Math.min(latest, succLs - e.dependency.lagDays)
      }
    }
    const earliest = es.get(id) ?? 0
    latest = Math.max(latest, earliest)
    ls.set(id, latest)
    lf.set(id, latest + dur - 1)
  }

  const leafResults: ScheduledTask[] = order.map((id) => {
    const t = taskById.get(id) as Task
    const esIndex = es.get(id) ?? 0
    const efIndex = ef.get(id) ?? 0
    const lsIndex = ls.get(id) ?? 0
    const lfIndex = lf.get(id) ?? 0
    const totalFloat = lsIndex - esIndex
    const pert = buildPert(t)

    let freeFloat = projectEndIndex - efIndex
    for (const e of edges) {
      if (e.from !== id || isBackEdge(e)) continue
      const succEs = es.get(e.to)
      if (succEs === undefined) continue
      const candidate =
        e.dependency.type === 'FS'
          ? succEs - (efIndex + e.dependency.lagDays + 1)
          : succEs - (esIndex + e.dependency.lagDays)
      freeFloat = Math.min(freeFloat, candidate)
    }

    return {
      task: t,
      start: cal.dateAt(esIndex),
      end: cal.dateAt(efIndex),
      esIndex,
      efIndex,
      lsIndex,
      lfIndex,
      totalFloat,
      freeFloat: Math.max(0, freeFloat),
      isCritical: totalFloat === 0,
      level: levels[id] ?? 0,
      pert,
      isParent: false,
      childIds: [],
      workingDays: durOf(t),
      rolledUpProgress: Math.round(t.progress),
    }
  })

  const byId: Record<string, ScheduledTask> = {}
  leafResults.forEach((s) => {
    byId[s.task.id] = s
  })

  /*
   * Gulung fase induk dari sub-tugasnya, dari yang terdalam ke yang terluar.
   * Fase induk tidak punya durasi, float, atau status kritis sendiri: semuanya
   * diturunkan dari anak-anaknya, dan progresnya rata-rata berbobot durasi anak.
   */
  const parents = tasks
    .filter((t) => childIds.has(t.id))
    .sort((a, b) => (levels[b.id] ?? 0) - (levels[a.id] ?? 0))
  parents.forEach((t) => {
    const children = (childIds.get(t.id) ?? [])
      .map((id) => byId[id])
      .filter(Boolean)
    if (children.length === 0) return

    const esIndex = Math.min(...children.map((c) => c.esIndex))
    const efIndex = Math.max(...children.map((c) => c.efIndex))
    const weight = children.reduce((a, c) => a + c.workingDays, 0)
    const rolledUpProgress =
      weight > 0
        ? Math.round(
            children.reduce((a, c) => a + c.workingDays * c.rolledUpProgress, 0) / weight,
          )
        : Math.round(
            children.reduce((a, c) => a + c.rolledUpProgress, 0) / children.length,
          )

    const summary: ScheduledTask = {
      task: t,
      start: cal.dateAt(esIndex),
      end: cal.dateAt(efIndex),
      esIndex,
      efIndex,
      lsIndex: Math.min(...children.map((c) => c.lsIndex)),
      lfIndex: Math.max(...children.map((c) => c.lfIndex)),
      totalFloat: Math.min(...children.map((c) => c.totalFloat)),
      freeFloat: Math.min(...children.map((c) => c.freeFloat)),
      isCritical: children.some((c) => c.isCritical),
      level: levels[t.id] ?? 0,
      pert: buildPert(t),
      isParent: true,
      childIds: children.map((c) => c.task.id),
      workingDays: efIndex - esIndex + 1,
      rolledUpProgress,
    }
    byId[t.id] = summary
  })

  // Urutkan ulang sesuai urutan input (stabil) agar tampilan konsisten.
  const ordered = tasks.map((t) => byId[t.id]).filter(Boolean)

  const criticalLeaves = leafResults
    .filter((s) => s.isCritical)
    .sort((a, b) => a.esIndex - b.esIndex || a.efIndex - b.efIndex)
  const criticalPath = criticalLeaves.map((s) => s.task.id)
  const criticalChain = buildCriticalChain(criticalLeaves, edges)

  const pertDuration = criticalChain.reduce((a, id) => a + (byId[id]?.pert.expected ?? 0), 0)
  const pertVariance = criticalChain.reduce(
    (a, id) => a + (byId[id]?.pert.variance ?? 0),
    0,
  )

  return {
    tasks: ordered,
    byId,
    projectStart: cal.dateAt(projectStartIndex),
    projectEnd: cal.dateAt(projectEndIndex),
    durationWorkingDays: projectEndIndex - projectStartIndex + 1,
    criticalPath,
    criticalChain,
    cycleIds,
    pertDuration,
    pertStdDev: Math.sqrt(pertVariance),
    leafIds: ordered.filter((s) => !s.isParent).map((s) => s.task.id),
  }
}

/** Deteksi apakah menambahkan dependensi akan membentuk siklus. */
export function createsCycle(
  dependencies: Dependency[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true
  const adj = new Map<string, string[]>()
  dependencies.forEach((d) => {
    const list = adj.get(d.predecessorId) ?? []
    list.push(d.successorId)
    adj.set(d.predecessorId, list)
  })
  const stack = [to]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const cur = stack.pop() as string
    if (cur === from) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const next of adj.get(cur) ?? []) stack.push(next)
  }
  return false
}
