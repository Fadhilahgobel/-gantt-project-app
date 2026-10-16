import { useState } from 'react'
import {
  AlertCircle,
  BadgeDollarSign,
  Briefcase,
  Mail,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { formatIDR, formatLong } from '../lib/dateUtils'
import { useProject } from '../store/projectContext'
import { useUi } from '../store/uiContext'
import type { Resource } from '../types'
import { Avatar, EmptyState, Modal, ProgressBar, StatCard } from '../components/ui'

interface MemberForm {
  name: string
  email: string
  role: string
  salary: string
}

const EMPTY: MemberForm = { name: '', email: '', role: '', salary: '0' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function TeamPage() {
  const { data, schedule, addResource, updateResource, deleteResource } = useProject()
  const { toast, confirm } = useUi()
  const [editing, setEditing] = useState<Resource | null>(null)
  const [open, setOpen] = useState(false)

  const payroll = data.resources.reduce((a, r) => a + r.salary, 0)
  const avg = data.resources.length ? Math.round(payroll / data.resources.length) : 0

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (r: Resource) => {
    setEditing(r)
    setOpen(true)
  }

  const handleDelete = async (r: Resource) => {
    const assigned = data.tasks.filter((t) => t.assigneeIds.includes(r.id))
    const ok = await confirm({
      title: 'Hapus anggota tim?',
      message:
        assigned.length > 0
          ? `${r.name} masih dialokasikan pada ${assigned.length} tugas. Alokasi tersebut akan dilepas dan data anggota dihapus.`
          : `${r.name} akan dihapus dari daftar anggota tim.`,
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!ok) return
    deleteResource(r.id)
    toast({ variant: 'success', message: 'Anggota tim dihapus.' })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Manajemen Tim &amp; Resource</h2>
          <p>Daftarkan anggota tim, atur peran dan gaji, lalu alokasikan ke tugas tertentu.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openNew}>
          <UserPlus size={16} />
          Tambah Anggota
        </button>
      </div>

      <div className="grid grid--stats list-enter">
        <StatCard
          icon={<Users size={19} />}
          label="Total Anggota"
          value={data.resources.length}
          hint={`${new Set(data.tasks.flatMap((t) => t.assigneeIds)).size} teralokasi ke tugas`}
          accent
        />
        <StatCard
          icon={<BadgeDollarSign size={19} />}
          label="Total Gaji / Bulan"
          value={formatIDR(payroll)}
          hint="Akumulasi seluruh anggota tim"
        />
        <StatCard
          icon={<Briefcase size={19} />}
          label="Rata-rata Gaji"
          value={formatIDR(avg)}
          hint="Per anggota tim"
        />
        <StatCard
          icon={<Plus size={19} />}
          label="Tugas Belum Diisi"
          value={data.tasks.filter((t) => t.assigneeIds.length === 0).length}
          hint="Tugas tanpa penanggung jawab"
        />
      </div>

      {data.resources.length === 0 ? (
        <EmptyState
          icon={<Users size={34} />}
          title="Belum ada anggota tim"
          description="Tambahkan anggota tim terlebih dahulu agar setiap tugas punya penanggung jawab yang jelas dan beban kerja dapat dianalisis."
          action={
            <button type="button" className="btn btn--primary" onClick={openNew}>
              <UserPlus size={16} />
              Tambah anggota pertama
            </button>
          }
        />
      ) : (
        <div className="grid grid--cards list-enter">
          {data.resources.map((r) => {
            const assigned = data.tasks.filter((t) => t.assigneeIds.includes(r.id))
            const load = assigned.length
              ? Math.round(assigned.reduce((a, t) => a + t.progress, 0) / assigned.length)
              : 0
            const workDays = assigned.reduce((a, t) => a + t.durationDays, 0)
            return (
              <div key={r.id} className="card card--hover">
                <div className="card__head">
                  <Avatar name={r.name} size={44} />
                  <div className="member-row__info">
                    <div className="member-row__name">{r.name}</div>
                    <div className="tiny muted">{r.role || 'Tanpa peran'}</div>
                  </div>
                  <div className="task-card__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      aria-label={`Edit ${r.name}`}
                      title="Edit anggota"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      aria-label={`Hapus ${r.name}`}
                      title="Hapus anggota"
                      onClick={() => handleDelete(r)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="task-card__meta" style={{ marginBottom: 10 }}>
                  <span>
                    <Mail size={12} />
                    {r.email || '—'}
                  </span>
                  <span>
                    <BadgeDollarSign size={12} />
                    {formatIDR(r.salary)}/bulan
                  </span>
                </div>

                <div className="progress-row" style={{ marginBottom: 8 }}>
                  <ProgressBar value={load} />
                  <span className="tiny mono muted">{load}%</span>
                </div>

                <div className="tiny muted" style={{ marginBottom: 8 }}>
                  {assigned.length} tugas · {workDays} hari kerja dialokasikan
                </div>

                <div className="tags">
                  {assigned.length === 0 ? (
                    <span className="badge badge--ghost">Belum ada alokasi</span>
                  ) : (
                    assigned.map((t) => (
                      <span
                        key={t.id}
                        className="badge"
                        style={{
                          background: 'var(--bg-3)',
                          color: 'var(--text-1)',
                          borderColor: t.color,
                        }}
                        title={`${formatLong(schedule.byId[t.id]?.start ?? t.startDate)} → ${formatLong(
                          schedule.byId[t.id]?.end ?? t.startDate,
                        )}`}
                      >
                        <span className="gantt-label__dot" style={{ background: t.color, width: 8, height: 8 }} />
                        {t.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <MemberModal
          resource={editing}
          onClose={() => setOpen(false)}
          onSave={(form) => {
            const payload = {
              name: form.name.trim(),
              email: form.email.trim(),
              role: form.role.trim(),
              salary: Math.max(0, Math.round(Number(form.salary) || 0)),
            }
            if (editing) {
              updateResource(editing.id, payload)
              toast({ variant: 'success', message: `${payload.name} diperbarui.` })
            } else {
              addResource(payload)
              toast({ variant: 'success', message: `${payload.name} ditambahkan ke tim.` })
            }
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function MemberModal({
  resource,
  onClose,
  onSave,
}: {
  resource: Resource | null
  onClose: () => void
  onSave: (form: MemberForm) => void
}) {
  const [form, setForm] = useState<MemberForm>(
    resource
      ? {
          name: resource.name,
          email: resource.email,
          role: resource.role,
          salary: String(resource.salary),
        }
      : EMPTY,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: keyof MemberForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!e[key]) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  const submit = () => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Nama wajib diisi.'
    else if (form.name.trim().length < 3) next.name = 'Minimal 3 karakter.'
    if (!form.email.trim()) next.email = 'Email wajib diisi.'
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Format email tidak valid.'
    if (!form.role.trim()) next.role = 'Peran wajib diisi.'
    const salary = Number(form.salary)
    if (!Number.isFinite(salary) || salary < 0) next.salary = 'Gaji harus angka ≥ 0.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSave(form)
  }

  const err = (key: string) =>
    errors[key] ? (
      <span className="field__error">
        <AlertCircle size={12} />
        {errors[key]}
      </span>
    ) : null

  return (
    <Modal
      title={resource ? 'Edit Anggota Tim' : 'Anggota Tim Baru'}
      icon={<UserPlus size={18} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn btn--primary" onClick={submit}>
            <Save size={15} />
            {resource ? 'Simpan' : 'Tambah'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="m-name">Nama Lengkap *</label>
        <input
          id="m-name"
          className="input"
          value={form.name}
          aria-invalid={!!errors.name}
          placeholder="mis. Sari Wulandari"
          onChange={(e) => set('name', e.target.value)}
        />
        {err('name')}
      </div>
      <div className="field">
        <label htmlFor="m-email">Email *</label>
        <input
          id="m-email"
          className="input"
          value={form.email}
          aria-invalid={!!errors.email}
          placeholder="nama@perusahaan.id"
          onChange={(e) => set('email', e.target.value)}
        />
        {err('email')}
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="m-role">Peran *</label>
          <input
            id="m-role"
            className="input"
            value={form.role}
            aria-invalid={!!errors.role}
            placeholder="mis. Frontend Engineer"
            onChange={(e) => set('role', e.target.value)}
          />
          {err('role')}
        </div>
        <div className="field">
          <label htmlFor="m-salary">Gaji / Bulan (Rp) *</label>
          <input
            id="m-salary"
            type="number"
            min={0}
            step={100000}
            className="input"
            value={form.salary}
            aria-invalid={!!errors.salary}
            onChange={(e) => set('salary', e.target.value)}
          />
          {err('salary')}
          <span className="field__hint">
            Setara {formatIDR(Number(form.salary) || 0)} per bulan.
          </span>
        </div>
      </div>
    </Modal>
  )
}
