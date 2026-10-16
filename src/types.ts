export type Priority = 'low' | 'medium' | 'high'

export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done'

export type DependencyType = 'FS' | 'SS'

export interface Task {
  id: string
  name: string
  description: string
  /** Tanggal mulai (format ISO `YYYY-MM-DD`). Dipakai sebagai batas paling awal. */
  startDate: string
  /** Durasi dalam HARI KERJA (weekend & hari libur tidak dihitung). */
  durationDays: number
  priority: Priority
  /** Warna indikator bar Gantt (hex). */
  color: string
  /** Progres 0-100. */
  progress: number
  status: TaskStatus
  /** id tugas induk, null jika tugas tingkat teratas (sub-tugas parent-child). */
  parentId: string | null
  /** id anggota tim yang dialokasikan. */
  assigneeIds: string[]
  /** Estimasi PERT (hari kerja). null = pakai durationDays. */
  optimistic: number | null
  mostLikely: number | null
  pessimistic: number | null
}

export interface Dependency {
  id: string
  predecessorId: string
  successorId: string
  /** FS = Finish-to-Start, SS = Start-to-Start. */
  type: DependencyType
  /** Jeda / lag dalam hari kerja. */
  lagDays: number
}

export interface Resource {
  id: string
  name: string
  email: string
  role: string
  /** Gaji bulanan (IDR). */
  salary: number
}

export interface CalendarConfig {
  /** Hari akhir pekan, mengikuti Date.getDay(): 0=Minggu ... 6=Sabtu. */
  weekendDays: number[]
  /** Daftar hari libur khusus (ISO `YYYY-MM-DD`). */
  holidays: string[]
}

export interface ProjectData {
  name: string
  tasks: Task[]
  dependencies: Dependency[]
  resources: Resource[]
  calendar: CalendarConfig
}

export type ViewKey =
  | 'dashboard'
  | 'gantt'
  | 'tasks'
  | 'team'
  | 'calendar'
  | 'analysis'

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
}

/**
 * Warna indikator prioritas (nilainya di index.css). Kuning neon sengaja tidak
 * dipakai agar badge prioritas tidak tertukar dengan penanda jalur kritis.
 */
export const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--prio-high)',
  medium: 'var(--prio-medium)',
  low: 'var(--prio-low)',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Belum Mulai',
  'in-progress': 'Berjalan',
  blocked: 'Terhambat',
  done: 'Selesai',
}

export const DAY_LABEL = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
export const DAY_LABEL_FULL = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
]

export const DEFAULT_COLORS = [
  '#DFFF00',
  '#FFE600',
  '#5CC8FF',
  '#3DDC84',
  '#FF8A65',
  '#B388FF',
  '#FF5566',
  '#FFB020',
]
