import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRightLeft,
  CalendarCheck,
  GitBranch,
  Layers,
  Link2,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { addWorkingDays, formatLong } from '../lib/dateUtils'
import { createsCycle } from '../lib/scheduling'
import { useProject } from '../store/projectContext'
import { useUi } from '../store/uiContext'
import {
  DEFAULT_COLORS,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type DependencyType,
  type Priority,
  type Task,
  type TaskStatus,
} from '../types'
import { Avatar, Modal } from './ui'

interface FormState {
  name: string
  description: string
  startDate: string
  durationDays: string
  priority: Priority
  color: string
  progress: string
  status: TaskStatus
  parentId: string
  assigneeIds: string[]
  optimistic: string
  mostLikely: string
  pessimistic: string
}

function toForm(task: Task | null): FormState {
  return {
    name: task?.name ?? '',
    description: task?.description ?? '',
    startDate: task?.startDate ?? new Date().toISOString().slice(0, 10),
    durationDays: String(task?.durationDays ?? 5),
    priority: task?.priority ?? 'medium',
    color: task?.color ?? DEFAULT_COLORS[0],
    progress: String(task?.progress ?? 0),
    status: task?.status ?? 'todo',
    parentId: task?.parentId ?? '',
    assigneeIds: task?.assigneeIds ?? [],
    optimistic: task?.optimistic != null ? String(task.optimistic) : '',
    mostLikely: task?.mostLikely != null ? String(task.mostLikely) : '',
    pessimistic: task?.pessimistic != null ? String(task.pessimistic) : '',
  }
}

export function TaskForm({
  task,
  defaultParentId = null,
  onClose,
}: {
  task: Task | null
  defaultParentId?: string | null
  onClose: () => void
}) {
  const {
    data,
    addTask,
    updateTask,
    deleteTask,
    addDependency,
    deleteDependency,
    updateDependency,
    schedule,
  } = useProject()
  const { toast, confirm } = useUi()

  const [form, setForm] = useState<FormState>(() =>
    task ? toForm(task) : { ...toForm(null), parentId: defaultParentId ?? '' },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Dependensi: pendahulu (predecessor) dan penerus (successor) dari tugas ini.
  const predecessors = task
    ? data.dependencies.filter((d) => d.successorId === task.id)
    : []
  const successors = task ? data.dependencies.filter((d) => d.predecessorId === task.id) : []

  const [depFrom, setDepFrom] = useState('')
  const [depTo, setDepTo] = useState('')
  const [depType, setDepType] = useState<DependencyType>('FS')
  const [depLag, setDepLag] = useState('0')

  const taskById = useMemo(
    () => Object.fromEntries(data.tasks.map((t) => [t.id, t])),
    [data.tasks],
  )

  const parentOptions = data.tasks.filter((t) => !task || t.id !== task.id)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }

  const duration = Number(form.durationDays)
  const previewEnd =
    form.startDate && Number.isFinite(duration) && duration >= 1
      ? addWorkingDays(form.startDate, Math.round(duration), data.calendar)
      : null

  const numeric = (v: string) => (v.trim() === '' ? null : Number(v))

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Nama tugas wajib diisi.'
    else if (form.name.trim().length < 3) next.name = 'Minimal 3 karakter.'
    if (!form.startDate) next.startDate = 'Tanggal mulai wajib diisi.'
    if (!Number.isFinite(duration) || duration < 1)
      next.durationDays = 'Durasi minimal 1 hari kerja.'
    else if (duration > 500) next.durationDays = 'Durasi maksimal 500 hari kerja.'
    const progress = Number(form.progress)
    if (!Number.isFinite(progress) || progress < 0 || progress > 100)
      next.progress = 'Progres harus 0–100.'
    const o = numeric(form.optimistic)
    const m = numeric(form.mostLikely)
    const p = numeric(form.pessimistic)
    if (o !== null && (o < 1 || !Number.isFinite(o))) next.optimistic = 'Minimal 1 hari.'
    if (m !== null && (m < 1 || !Number.isFinite(m))) next.mostLikely = 'Minimal 1 hari.'
    if (p !== null && (p < 1 || !Number.isFinite(p))) next.pessimistic = 'Minimal 1 hari.'
    if (o !== null && m !== null && o > m)
      next.optimistic = 'Optimis tidak boleh lebih besar dari paling mungkin.'
    if (m !== null && p !== null && m > p)
      next.pessimistic = 'Pesimis tidak boleh lebih kecil dari paling mungkin.'
    if (form.parentId === task?.id) next.parentId = 'Tugas tidak bisa menjadi induk dirinya sendiri.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) {
      toast({ variant: 'error', message: 'Periksa kembali kolom yang ditandai merah.' })
      return
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      startDate: form.startDate,
      durationDays: Math.round(duration),
      priority: form.priority,
      color: form.color,
      progress: Math.round(Number(form.progress)),
      status: form.status,
      parentId: form.parentId || null,
      assigneeIds: form.assigneeIds,
      optimistic: numeric(form.optimistic),
      mostLikely: numeric(form.mostLikely),
      pessimistic: numeric(form.pessimistic),
    }
    if (task) {
      updateTask(task.id, payload)
      toast({ variant: 'success', message: `Tugas "${payload.name}" diperbarui.` })
    } else {
      addTask(payload)
      toast({ variant: 'success', message: `Tugas "${payload.name}" ditambahkan.` })
    }
    onClose()
  }

  const remove = async () => {
    if (!task) return
    const children = data.tasks.filter((t) => t.parentId === task.id)
    const ok = await confirm({
      title: 'Hapus tugas ini?',
      message:
        children.length > 0
          ? `Tugas "${task.name}" beserta ${children.length} sub-tugas dan seluruh dependensinya akan dihapus permanen.`
          : `Tugas "${task.name}" dan seluruh dependensinya akan dihapus permanen.`,
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!ok) return
    deleteTask(task.id)
    toast({ variant: 'success', message: 'Tugas dihapus.' })
    onClose()
  }

  const addDep = () => {
    if (!task) return
    if (!depFrom) {
      toast({ variant: 'error', message: 'Pilih tugas pendahulu terlebih dahulu.' })
      return
    }
    if (depFrom === task.id) {
      toast({ variant: 'error', message: 'Tugas tidak dapat bergantung pada dirinya sendiri.' })
      return
    }
    if (createsCycle(data.dependencies, depFrom, task.id)) {
      toast({
        variant: 'error',
        message: 'Dependensi ini membentuk siklus. Hubungan dibatalkan.',
      })
      return
    }
    if (data.dependencies.some((d) => d.predecessorId === depFrom && d.successorId === task.id)) {
      toast({ variant: 'error', message: 'Dependensi tersebut sudah ada.' })
      return
    }
    const lag = Number(depLag)
    addDependency({
      predecessorId: depFrom,
      successorId: task.id,
      type: depType,
      lagDays: Number.isFinite(lag) ? Math.round(lag) : 0,
    })
    setDepFrom('')
    setDepLag('0')
    toast({ variant: 'success', message: 'Dependensi ditambahkan.' })
  }

  const addSuccessorDep = () => {
    if (!task) return
    if (!depTo) {
      toast({ variant: 'error', message: 'Pilih tugas penerus terlebih dahulu.' })
      return
    }
    if (depTo === task.id) {
      toast({ variant: 'error', message: 'Tugas tidak dapat bergantung pada dirinya sendiri.' })
      return
    }
    if (createsCycle(data.dependencies, task.id, depTo)) {
      toast({ variant: 'error', message: 'Dependensi ini membentuk siklus. Hubungan dibatalkan.' })
      return
    }
    if (data.dependencies.some((d) => d.predecessorId === task.id && d.successorId === depTo)) {
      toast({ variant: 'error', message: 'Dependensi tersebut sudah ada.' })
      return
    }
    const lag = Number(depLag)
    addDependency({
      predecessorId: task.id,
      successorId: depTo,
      type: depType,
      lagDays: Number.isFinite(lag) ? Math.round(lag) : 0,
    })
    setDepTo('')
    setDepLag('0')
    toast({ variant: 'success', message: 'Dependensi ditambahkan.' })
  }

  const errorOf = (key: string) =>
    errors[key] ? (
      <span className="field__error">
        <AlertCircle size={12} />
        {errors[key]}
      </span>
    ) : null

  return (
    <Modal
      title={task ? 'Edit Tugas' : 'Tugas Baru'}
      icon={task ? <Layers size={18} /> : <Plus size={18} />}
      onClose={onClose}
      size="wide"
      footer={
        <>
          {task && (
            <button
              type="button"
              className="btn btn--danger"
              style={{ marginRight: 'auto' }}
              onClick={remove}
            >
              <Trash2 size={15} />
              Hapus
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn btn--primary" onClick={submit}>
            <Save size={15} />
            {task ? 'Simpan Perubahan' : 'Tambah Tugas'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="tf-name">Nama Tugas *</label>
          <input
            id="tf-name"
            className="input"
            value={form.name}
            aria-invalid={!!errors.name}
            placeholder="mis. Pengembangan Frontend"
            onChange={(e) => set('name', e.target.value)}
          />
          {errorOf('name')}
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="tf-desc">Deskripsi</label>
          <textarea
            id="tf-desc"
            className="textarea"
            value={form.description}
            placeholder="Rincian singkat pekerjaan…"
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="tf-start">Tanggal Mulai *</label>
          <input
            id="tf-start"
            type="date"
            className="input"
            value={form.startDate}
            aria-invalid={!!errors.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
          {errorOf('startDate')}
        </div>

        <div className="field">
          <label htmlFor="tf-dur">Durasi (hari kerja) *</label>
          <input
            id="tf-dur"
            type="number"
            min={1}
            max={500}
            className="input"
            value={form.durationDays}
            aria-invalid={!!errors.durationDays}
            onChange={(e) => set('durationDays', e.target.value)}
          />
          {errorOf('durationDays')}
          {previewEnd && (
            <span className="field__hint">
              <CalendarCheck size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              Selesai {formatLong(previewEnd)} (weekend &amp; hari libur dilewati)
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="tf-prio">Prioritas</label>
          <select
            id="tf-prio"
            className="select"
            value={form.priority}
            onChange={(e) => set('priority', e.target.value as Priority)}
          >
            {(['high', 'medium', 'low'] as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="tf-status">Status</label>
          <select
            id="tf-status"
            className="select"
            value={form.status}
            onChange={(e) => set('status', e.target.value as TaskStatus)}
          >
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="tf-progress">Progres (%)</label>
          <input
            id="tf-progress"
            type="number"
            min={0}
            max={100}
            className="input"
            value={form.progress}
            aria-invalid={!!errors.progress}
            onChange={(e) => set('progress', e.target.value)}
          />
          {errorOf('progress')}
        </div>

        <div className="field">
          <label htmlFor="tf-parent">Sub-tugas dari</label>
          <select
            id="tf-parent"
            className="select"
            value={form.parentId}
            onChange={(e) => set('parentId', e.target.value)}
          >
            <option value="">— Tugas utama (tanpa induk) —</option>
            {parentOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.parentId ? '↳ ' : ''}
                {t.name}
              </option>
            ))}
          </select>
          {errorOf('parentId')}
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Warna Indikator</label>
          <div className="color-swatches">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${form.color === c ? 'is-active' : ''}`}
                style={{ background: c }}
                aria-label={`Warna ${c}`}
                onClick={() => set('color', c)}
              />
            ))}
            <input
              type="color"
              className="swatch"
              style={{ padding: 0, background: 'transparent' }}
              value={form.color}
              aria-label="Warna khusus"
              onChange={(e) => set('color', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ---------- Estimasi PERT ---------- */}
      <div className="card" style={{ background: 'var(--bg-0)' }}>
        <div className="card__head">
          <span className="section-title">
            <GitBranch size={14} />
            Estimasi PERT (opsional)
          </span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tf-o">Optimis (hari)</label>
            <input
              id="tf-o"
              type="number"
              min={1}
              className="input"
              placeholder={`${Math.max(1, Math.round(duration * 0.8))}`}
              value={form.optimistic}
              aria-invalid={!!errors.optimistic}
              onChange={(e) => set('optimistic', e.target.value)}
            />
            {errorOf('optimistic')}
          </div>
          <div className="field">
            <label htmlFor="tf-m">Paling Mungkin</label>
            <input
              id="tf-m"
              type="number"
              min={1}
              className="input"
              placeholder={`${Number.isFinite(duration) ? duration : 1}`}
              value={form.mostLikely}
              aria-invalid={!!errors.mostLikely}
              onChange={(e) => set('mostLikely', e.target.value)}
            />
            {errorOf('mostLikely')}
          </div>
          <div className="field">
            <label htmlFor="tf-p">Pesimis (hari)</label>
            <input
              id="tf-p"
              type="number"
              min={1}
              className="input"
              placeholder={`${Math.max(1, Math.round(duration * 1.3))}`}
              value={form.pessimistic}
              aria-invalid={!!errors.pessimistic}
              onChange={(e) => set('pessimistic', e.target.value)}
            />
            {errorOf('pessimistic')}
          </div>
        </div>
        <p className="field__hint" style={{ marginTop: 8 }}>
          Kosongkan untuk memakai perkiraan otomatis (0,8× / 1× / 1,3× durasi). Nilai ini
          memengaruhi diagram dan simulasi PERT di halaman Analisis.
        </p>
      </div>

      {/* ---------- Alokasi anggota ---------- */}
      <div className="field">
        <label>
          <Users size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
          Alokasi Anggota Tim ({form.assigneeIds.length} dipilih)
        </label>
        {data.resources.length === 0 ? (
          <p className="field__hint">Belum ada anggota tim. Tambahkan di halaman Tim.</p>
        ) : (
          <div className="chips">
            {data.resources.map((r) => {
              const on = form.assigneeIds.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`check ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      'assigneeIds',
                      on
                        ? form.assigneeIds.filter((a) => a !== r.id)
                        : [...form.assigneeIds, r.id],
                    )
                  }
                >
                  <Avatar name={r.name} size={22} />
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{r.name}</span>
                  {on && <X size={12} />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- Dependensi ---------- */}
      {task ? (
        <div className="card" style={{ background: 'var(--bg-0)' }}>
          <div className="card__head">
            <span className="section-title">
              <Link2 size={14} />
              Dependensi
            </span>
          </div>

          <div className="field">
            <label>Pendahulu (Finish-to-Start / Start-to-Start)</label>
            {predecessors.length === 0 ? (
              <p className="field__hint">Belum ada pendahulu.</p>
            ) : (
              <ul className="task-list">
                {predecessors.map((d) => (
                  <li
                    key={d.id}
                    className="check is-on"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>
                      {taskById[d.predecessorId]?.name ?? d.predecessorId}
                    </span>
                    <span className="btn-row" style={{ alignItems: 'center' }}>
                      <select
                        className="select"
                        style={{ width: 128 }}
                        value={d.type}
                        aria-label="Jenis dependensi"
                        onChange={(e) =>
                          updateDependency(d.id, { type: e.target.value as DependencyType })
                        }
                      >
                        <option value="FS">Finish → Start</option>
                        <option value="SS">Start → Start</option>
                      </select>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 82 }}
                        value={d.lagDays}
                        aria-label="Jeda hari kerja"
                        onChange={(e) =>
                          updateDependency(d.id, {
                            lagDays: Number.isFinite(Number(e.target.value))
                              ? Math.round(Number(e.target.value))
                              : 0,
                          })
                        }
                      />
                      <span className="tiny muted">hari</span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        aria-label="Hapus dependensi"
                        onClick={() => {
                          deleteDependency(d.id)
                          toast({ variant: 'info', message: 'Dependensi dihapus.' })
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Tambah pendahulu baru</label>
            <div className="btn-row" style={{ alignItems: 'center' }}>
              <select
                className="select"
                style={{ flex: 1, minWidth: 150 }}
                value={depFrom}
                aria-label="Tugas pendahulu"
                onChange={(e) => setDepFrom(e.target.value)}
              >
                <option value="">— Pilih tugas —</option>
                {data.tasks
                  .filter((t) => t.id !== task.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <select
                className="select"
                style={{ width: 140 }}
                value={depType}
                aria-label="Jenis dependensi baru"
                onChange={(e) => setDepType(e.target.value as DependencyType)}
              >
                <option value="FS">Finish → Start</option>
                <option value="SS">Start → Start</option>
              </select>
              <input
                type="number"
                className="input"
                style={{ width: 82 }}
                value={depLag}
                aria-label="Jeda hari kerja"
                onChange={(e) => setDepLag(e.target.value)}
              />
              <button type="button" className="btn" onClick={addDep}>
                <Plus size={14} />
                Tambah
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Jadikan pendahulu untuk… (penerus)</label>
            {successors.length === 0 ? (
              <p className="field__hint">Tugas ini belum menjadi pendahulu apa pun.</p>
            ) : (
              <div className="tags">
                {successors.map((d) => (
                  <span key={d.id} className="badge badge--ghost">
                    <ArrowRightLeft size={11} />
                    {taskById[d.successorId]?.name ?? d.successorId} · {d.type} · lag {d.lagDays}
                  </span>
                ))}
              </div>
            )}
            <div className="btn-row" style={{ alignItems: 'center', marginTop: 8 }}>
              <select
                className="select"
                style={{ flex: 1, minWidth: 150 }}
                value={depTo}
                aria-label="Tugas penerus"
                onChange={(e) => setDepTo(e.target.value)}
              >
                <option value="">— Pilih tugas penerus —</option>
                {data.tasks
                  .filter((t) => t.id !== task.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn" onClick={addSuccessorDep}>
                <Plus size={14} />
                Tambah
              </button>
            </div>
          </div>

          <p className="field__hint" style={{ marginTop: 10 }}>
            Perubahan tanggal &amp; durasi mengikuti kalender proyek —{' '}
            {schedule.cycleIds.length > 0 ? (
              <span style={{ color: 'var(--danger)' }}>
                Terdeteksi siklus dependensi, periksa kembali hubungan antar tugas.
              </span>
            ) : (
              'hasil penjadwalan diperbarui otomatis.'
            )}
          </p>
        </div>
      ) : (
        <p className="field__hint">
          Dependensi dapat ditambahkan setelah tugas disimpan.
        </p>
      )}
    </Modal>
  )
}
