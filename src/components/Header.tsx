import { useEffect, useState } from 'react'
import { CalendarRange, CheckCircle2, Menu, Pencil, Plus, RotateCcw, Users } from 'lucide-react'
import { formatLong } from '../lib/dateUtils'
import { useProject } from '../store/projectContext'
import { useUi } from '../store/uiContext'

export function Header({
  onToggleNav,
  onQuickAdd,
}: {
  onToggleNav: () => void
  onQuickAdd: () => void
}) {
  const { data, schedule, renameProject, resetToSeed } = useProject()
  const { toast, confirm } = useUi()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.name)

  useEffect(() => {
    setDraft(data.name)
  }, [data.name])

  // Statistik hanya menghitung tugas daun agar fase induk tidak dihitung dua kali.
  const leafIds = new Set(schedule.leafIds)
  const leafTasks = data.tasks.filter((t) => leafIds.has(t.id))
  const done = leafTasks.filter((t) => t.status === 'done').length
  const progress = leafTasks.length
    ? Math.round(leafTasks.reduce((a, t) => a + t.progress, 0) / leafTasks.length)
    : 0

  const commitName = () => {
    const next = draft.trim()
    if (!next) {
      setDraft(data.name)
      setEditing(false)
      toast({ variant: 'error', message: 'Nama proyek tidak boleh kosong.' })
      return
    }
    if (next !== data.name) {
      renameProject(next)
      toast({ variant: 'success', message: 'Nama proyek diperbarui.' })
    }
    setEditing(false)
  }

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset ke data contoh?',
      message:
        'Seluruh tugas, dependensi, anggota tim, dan pengaturan kalender akan diganti dengan data contoh. Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Ya, reset sekarang',
      danger: true,
    })
    if (!ok) return
    resetToSeed()
    toast({ variant: 'success', message: 'Data berhasil direset ke contoh.' })
  }

  return (
    <header className="header">
      <button
        type="button"
        className="btn btn--ghost btn--icon hamburger"
        onClick={onToggleNav}
        aria-label="Buka menu navigasi"
      >
        <Menu size={20} />
      </button>

      <div className="header__title">
        {editing ? (
          <input
            className="input"
            style={{ fontSize: 17, fontWeight: 700, padding: '4px 8px' }}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') {
                setDraft(data.name)
                setEditing(false)
              }
            }}
            aria-label="Nama proyek"
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <h1 title={data.name}>{data.name}</h1>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Ganti nama proyek"
              title="Ganti nama proyek"
              onClick={() => setEditing(true)}
            >
              <Pencil size={13} />
            </button>
          </div>
        )}
        <div className="header__meta">
          <span>
            <CalendarRange size={13} />
            {schedule.projectStart ? formatLong(schedule.projectStart) : '—'} →{' '}
            {schedule.projectEnd ? formatLong(schedule.projectEnd) : '—'}
          </span>
          <span title="Hanya tugas daun yang dihitung">
            <CheckCircle2 size={13} />
            {done}/{leafTasks.length} tugas daun selesai · {progress}%
          </span>
          <span>
            <Users size={13} />
            {data.resources.length} anggota tim
          </span>
        </div>
      </div>

      <div className="header__actions">
        <button type="button" className="btn btn--primary" onClick={onQuickAdd}>
          <Plus size={16} />
          <span className="nav__label">Tugas Baru</span>
        </button>
        <button type="button" className="btn" onClick={handleReset} title="Reset ke data contoh">
          <RotateCcw size={16} />
        </button>
      </div>
    </header>
  )
}
