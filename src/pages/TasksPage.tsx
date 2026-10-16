import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Filter,
  GitBranch,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Timer,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { formatLong } from '../lib/dateUtils'
import { useProject } from '../store/projectContext'
import { useUi } from '../store/uiContext'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Priority,
  type Task,
  type TaskStatus,
} from '../types'
import {
  AvatarStack,
  EmptyState,
  PriorityBadge,
  ProgressBar,
  StatusBadge,
} from '../components/ui'

export function TasksPage({
  onOpenForm,
  selectedId,
  onSelect,
}: {
  onOpenForm: (task: Task | null, parentId?: string | null) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { data, schedule, deleteTask } = useProject()
  const { toast, confirm } = useUi()

  const leafTasks = useMemo(() => {
    const ids = new Set(schedule.leafIds)
    return data.tasks.filter((t) => ids.has(t.id))
  }, [data.tasks, schedule.leafIds])

  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState<'all' | Priority>('all')
  const [status, setStatus] = useState<'all' | TaskStatus>('all')
  const [assignee, setAssignee] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.tasks.filter((t) => {
      if (q && !`${t.name} ${t.description}`.toLowerCase().includes(q)) return false
      if (priority !== 'all' && t.priority !== priority) return false
      if (status !== 'all' && t.status !== status) return false
      if (assignee !== 'all' && !t.assigneeIds.includes(assignee)) return false
      return true
    })
  }, [data.tasks, query, priority, status, assignee])

  const flatFiltered = query.trim() !== '' || priority !== 'all' || status !== 'all' || assignee !== 'all'

  const visibleTree = useMemo(() => {
    if (flatFiltered) {
      return filtered.map((t) => ({ task: t, children: [] as Task[] }))
    }
    const roots = filtered.filter((t) => t.parentId === null)
    const rootsWithChildren = roots.map((r) => ({
      task: r,
      children: filtered.filter((c) => c.parentId === r.id),
    }))
    // Sub-tugas yang induknya tersaring keluar tetap ditampilkan.
    const shown = new Set(roots.map((r) => r.id))
    const orphans = filtered.filter((t) => t.parentId !== null && !shown.has(t.parentId))
    return [...rootsWithChildren, ...orphans.map((t) => ({ task: t, children: [] }))]
  }, [filtered, flatFiltered])

  const resetFilters = () => {
    setQuery('')
    setPriority('all')
    setStatus('all')
    setAssignee('all')
  }

  const handleDelete = async (task: Task) => {
    const children = data.tasks.filter((t) => t.parentId === task.id)
    const ok = await confirm({
      title: 'Hapus tugas?',
      message:
        children.length > 0
          ? `"${task.name}" beserta ${children.length} sub-tugas dan seluruh dependensinya akan dihapus.`
          : `"${task.name}" dan seluruh dependensinya akan dihapus.`,
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!ok) return
    deleteTask(task.id)
    if (selectedId === task.id) onSelect(null)
    toast({ variant: 'success', message: 'Tugas dihapus.' })
  }

  const renderCard = (task: Task, child: boolean) => {
    const sc = schedule.byId[task.id]
    // Fase induk memakai progres & panjang gulungan dari sub-tugasnya.
    const progress = sc?.rolledUpProgress ?? task.progress
    const workingDays = sc?.workingDays ?? task.durationDays
    const assignees = task.assigneeIds
      .map((id) => data.resources.find((r) => r.id === id)?.name ?? '')
      .filter(Boolean)
    const deps = data.dependencies.filter(
      (d) => d.predecessorId === task.id || d.successorId === task.id,
    )
    const subs = data.tasks.filter((t) => t.parentId === task.id).length

    return (
      <div
        key={task.id}
        className={`card card--hover task-card ${selectedId === task.id ? 'stat--accent' : ''}`}
      >
        <span
          className="task-card__stripe"
          style={{ background: PRIORITY_COLOR[task.priority] }}
        />
        <div className="task-card__body">
          <div className="task-card__top">
            <span
              className="task-card__phase-dot"
              style={{ background: task.color }}
              title="Warna fase tugas"
            />
            <button
              type="button"
              className={`task-card__name ${child ? 'is-child' : ''}`}
              onClick={() => onSelect(selectedId === task.id ? null : task.id)}
              style={{ background: 'none', textAlign: 'left' }}
              title="Klik untuk menyorot di Gantt"
            >
              {child && <span className="muted">↳ </span>}
              {task.name}
            </button>
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            {sc?.isCritical && <span className="badge badge--critical">Kritis</span>}
            {subs > 0 && (
              <span className="badge badge--ghost">
                <ListChecks size={11} />
                {subs} sub
              </span>
            )}
          </div>

          {task.description && <p className="task-card__desc">{task.description}</p>}

          <div className="task-card__meta">
            <span>
              <CalendarDays size={12} />
              {formatLong(sc?.start ?? task.startDate)} → {formatLong(sc?.end ?? task.startDate)}
            </span>
            <span title={sc?.isParent ? 'Rentang anak paling awal → paling akhir' : undefined}>
              <Timer size={12} />
              {workingDays} hari kerja{sc?.isParent ? ' (gabungan sub-tugas)' : ''}
            </span>
            <span>
              <GitBranch size={12} />
              Float {sc?.totalFloat ?? 0} hari
            </span>
            {deps.length > 0 && (
              <span>
                <Link2 size={12} />
                {deps.length} dependensi
              </span>
            )}
            <span>
              <UserPlus size={12} />
              <AvatarStack names={assignees} size={22} />
            </span>
          </div>

          <div className="progress-row">
            <ProgressBar value={progress} />
            <span
              className="tiny muted mono"
              style={{ minWidth: 34, textAlign: 'right' }}
              title={
                sc?.isParent
                  ? 'Rata-rata berbobot durasi dari sub-tugas (progres fase induk)'
                  : undefined
              }
            >
              {progress}%
            </span>
          </div>
        </div>

        <div className="task-card__side">
          <div className="task-card__actions">
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              title="Tambah sub-tugas"
              aria-label={`Tambah sub-tugas untuk ${task.name}`}
              onClick={() => onOpenForm(null, task.id)}
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              title="Edit tugas"
              aria-label={`Edit ${task.name}`}
              onClick={() => onOpenForm(task)}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              title="Hapus tugas"
              aria-label={`Hapus ${task.name}`}
              onClick={() => handleDelete(task)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Manajemen Tugas</h2>
          <p>
            {leafTasks.length} tugas daun · {leafTasks.filter((t) => t.status === 'done').length}{' '}
            selesai. Durasi dihitung dalam hari kerja saja; fase induk hanya gabungan sub-tugas.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => onOpenForm(null)}>
          <Plus size={16} />
          Tambah Tugas
        </button>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="section-title">
            <Filter size={14} />
            Filter &amp; Pencarian
          </span>
          {flatFiltered && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ marginLeft: 'auto' }}
              onClick={resetFilters}
            >
              <X size={13} />
              Bersihkan
            </button>
          )}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="f-q">
              <Search size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              Cari
            </label>
            <input
              id="f-q"
              className="input"
              placeholder="Nama atau deskripsi tugas…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-p">Prioritas</label>
            <select
              id="f-p"
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'all' | Priority)}
            >
              <option value="all">Semua prioritas</option>
              {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-s">Status</label>
            <select
              id="f-s"
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'all' | TaskStatus)}
            >
              <option value="all">Semua status</option>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-a">Anggota</label>
            <select
              id="f-a"
              className="select"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="all">Semua anggota</option>
              {data.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="legend prio-legend">
        <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>Prioritas:</span>
        {(['high', 'medium', 'low'] as Priority[]).map((p) => (
          <span key={p}>
            <i className="legend__swatch" style={{ background: PRIORITY_COLOR[p] }} />
            {PRIORITY_LABEL[p]}
          </span>
        ))}
      </div>

      {visibleTree.length === 0 ? (
        <EmptyState
          icon={<Search size={32} />}
          title="Tidak ada tugas yang cocok"
          description="Coba ubah kata kunci atau bersihkan filter untuk melihat seluruh daftar tugas."
          action={
            <button type="button" className="btn" onClick={resetFilters}>
              <X size={15} />
              Bersihkan filter
            </button>
          }
        />
      ) : (
        <div className="task-tree list-enter">
          {visibleTree.map(({ task, children }) => (
            <div key={task.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {renderCard(task, false)}
              {children.length > 0 && (
                <div className="task-tree__child" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {children.map((c) => renderCard(c, true))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card__head">
          <span className="section-title">
            <CheckCircle2 size={14} />
            Tips Cepat
          </span>
        </div>
        <ul className="tiny muted" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>• Klik nama tugas untuk menyorotnya di Gantt Chart.</li>
          <li>• Gunakan tombol + pada kartu untuk langsung menambah sub-tugas (parent-child).</li>
          <li>• Ubah warna indikator agar bar di Gantt mudah dibedakan antar fase.</li>
          <li>• Dependensi FS/SS beserta jeda (lag) diatur di dalam form edit tugas.</li>
        </ul>
      </div>
    </>
  )
}
