import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Flame,
  Layers,
  ListChecks,
  Timer,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { countWorkingDaysInclusive, formatIDR, formatLong, toISO } from '../lib/dateUtils'
import { useProject } from '../store/projectContext'
import { PRIORITY_LABEL, STATUS_LABEL, type ViewKey } from '../types'
import {
  Avatar,
  AvatarStack,
  EmptyState,
  PriorityBadge,
  ProgressBar,
  StatCard,
} from '../components/ui'

const PRIORITY_ICON = {
  high: <ArrowUp size={12} />,
  medium: <ArrowRight size={12} />,
  low: <ArrowDown size={12} />,
}

export function Dashboard({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { data, schedule } = useProject()
  const today = toISO(new Date())

  /*
   * Statistik proyek hanya dihitung dari tugas daun. Fase induk hanyalah label
   * pengelompok, jadi ikut menghitungnya akan menghitung pekerjaan dua kali.
   */
  const leafIds = new Set(schedule.leafIds)
  const leafTasks = data.tasks.filter((t) => leafIds.has(t.id))
  const total = leafTasks.length
  const done = leafTasks.filter((t) => t.status === 'done').length
  const progress = total
    ? Math.round(leafTasks.reduce((a, t) => a + t.progress, 0) / total)
    : 0

  const remainingDays =
    schedule.projectEnd && today <= schedule.projectEnd
      ? countWorkingDaysInclusive(today, schedule.projectEnd, data.calendar)
      : 0

  const payroll = data.resources.reduce((a, r) => a + r.salary, 0)
  const criticalTasks = schedule.criticalPath
  const criticalChain = schedule.criticalChain
  const parallelCritical = criticalTasks.filter((id) => !criticalChain.includes(id))
  const blocked = leafTasks.filter((t) => t.status === 'blocked')
  const overdue = schedule.tasks.filter(
    (s) => !s.isParent && s.end < today && s.task.status !== 'done',
  )

  const roots = data.tasks.filter((t) => t.parentId === null)
  const upcoming = [...schedule.tasks]
    .filter((s) => !s.isParent && s.task.status !== 'done')
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .slice(0, 6)

  if (data.tasks.length === 0) {
    return (
      <EmptyState
        icon={<Layers size={34} />}
        title="Proyek masih kosong"
        description="Tambahkan tugas pertama Anda untuk mulai membuat jadwal Gantt, mengalokasikan tim, dan menganalisis jalur kritis."
        action={
          <button type="button" className="btn btn--primary" onClick={() => onNavigate('tasks')}>
            <ListChecks size={16} />
            Mulai kelola tugas
          </button>
        }
      />
    )
  }

  return (
    <>
      <div className="grid grid--stats list-enter">
        <StatCard
          icon={<ListChecks size={19} />}
          label="Total Tugas"
          value={total}
          hint={`${roots.length} fase utama · ${total} tugas daun`}
          accent
          onClick={() => onNavigate('tasks')}
          ctaLabel="Buka halaman Tugas"
        />
        <StatCard
          icon={<TrendingUp size={19} />}
          label="Progres Proyek"
          value={`${progress}%`}
          hint={`${done} tugas daun selesai dari ${total} (fase induk tidak dihitung)`}
          onClick={() => onNavigate('tasks')}
          ctaLabel="Lihat progres di halaman Tugas"
        >
          <ProgressBar value={progress} />
        </StatCard>
        <StatCard
          icon={<Timer size={19} />}
          label="Hari Kerja Tersisa"
          value={remainingDays}
          suffix="hari"
          hint={`Tenggat ${formatLong(schedule.projectEnd)} · ${schedule.durationWorkingDays} hari kerja total`}
          onClick={() => onNavigate('gantt')}
          ctaLabel="Buka halaman Gantt"
        >
          <ProgressBar
            value={
              schedule.durationWorkingDays
                ? 100 - (remainingDays / schedule.durationWorkingDays) * 100
                : 0
            }
          />
        </StatCard>
        <StatCard
          icon={<Users size={19} />}
          label="Anggota Tim"
          value={data.resources.length}
          hint={`Beban gaji ${formatIDR(payroll)}/bulan`}
          onClick={() => onNavigate('team')}
          ctaLabel="Buka halaman Tim"
        />
      </div>

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head">
            <span className="section-title">
              <Activity size={14} />
              Progres per Fase
            </span>
          </div>
          <div className="task-list">
            {roots.map((r) => {
              const sc = schedule.byId[r.id]
              const children = data.tasks.filter((t) => t.parentId === r.id)
              // Fase induk memakai progres gulungan (rata-rata berbobot durasi anak).
              const avg = sc?.rolledUpProgress ?? r.progress
              return (
                <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span
                        className="gantt-label__dot"
                        style={{ background: r.color, width: 10, height: 10 }}
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.name}
                      </span>
                    </span>
                    <span
                      className="tiny muted mono"
                      title={`Rata-rata berbobot durasi dari ${children.length} sub-tugas`}
                    >
                      {avg}%
                    </span>
                  </div>
                  <ProgressBar value={avg} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <span className="section-title">
              <Flame size={14} />
              Jalur Kritis
            </span>
            <span className="badge badge--critical" style={{ marginLeft: 'auto' }}>
              {criticalTasks.length} tugas
            </span>
          </div>
          {criticalTasks.length === 0 ? (
            <p className="muted tiny">Tidak ada tugas kritis terdeteksi.</p>
          ) : (
            <>
              <div className="chain">
                {criticalChain.slice(0, 10).map((id, i) => {
                  const s = schedule.byId[id]
                  if (!s) return null
                  return (
                    <span
                      key={id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      {i > 0 && <span className="chain__sep">→</span>}
                      <span className="chain__node">
                        <span
                          className="gantt-label__dot"
                          style={{ background: s.task.color, width: 8, height: 8 }}
                        />
                        {s.task.name}
                      </span>
                    </span>
                  )
                })}
                {criticalChain.length > 10 && (
                  <span className="chain__sep">+{criticalChain.length - 10} lainnya</span>
                )}
              </div>
              {parallelCritical.length > 0 && (
                <p className="tiny muted" style={{ marginTop: 8 }}>
                  Rantai kritis di atas berurutan (jumlah Te-nya dipakai sebagai durasi PERT).{' '}
                  {parallelCritical.length} tugas kritis lain berjalan paralel:{' '}
                  {parallelCritical.map((id) => schedule.byId[id]?.task.name).filter(Boolean).join(', ')}
                  .
                </p>
              )}
            </>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 14,
            }}
          >
            <button
              type="button"
              className="pert-metric pert-metric--clickable"
              onClick={() => onNavigate('analysis')}
              aria-label="Buka halaman Analisis (durasi CPM)"
              title="Buka halaman Analisis"
            >
              <span className="pert-metric__label">Durasi CPM</span>
              <span className="pert-metric__value">
                {schedule.durationWorkingDays}
                <small className="tiny muted"> hari kerja</small>
              </span>
            </button>
            <button
              type="button"
              className="pert-metric pert-metric--neon pert-metric--clickable"
              onClick={() => onNavigate('analysis')}
              aria-label="Buka halaman Analisis (ekspektasi PERT)"
              title="Buka halaman Analisis"
            >
              <span className="pert-metric__label">Ekspektasi PERT</span>
              <span className="pert-metric__value">
                {schedule.pertDuration.toFixed(1)}
                <small className="tiny muted"> hari</small>
              </span>
            </button>
          </div>
        </div>
      </div>

      {(overdue.length > 0 || blocked.length > 0) && (
        <div className="card" style={{ borderColor: 'rgba(255,77,106,0.4)' }}>
          <div className="card__head">
            <span className="section-title" style={{ color: 'var(--danger)' }}>
              <AlertTriangle size={14} />
              Perlu Perhatian
            </span>
          </div>
          <div className="tags">
            {overdue.map((s) => (
              <span key={s.task.id} className="badge badge--blocked">
                <CalendarClock size={11} />
                {s.task.name} · lewat {formatLong(s.end)}
              </span>
            ))}
            {blocked.map((t) => (
              <span key={t.id} className="badge badge--blocked">
                <AlertTriangle size={11} />
                {t.name} · terhambat
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head">
            <span className="section-title">
              <CalendarClock size={14} />
              Tugas Terdekat
            </span>
          </div>
          <div className="task-list">
            {upcoming.map((s) => (
              <div
                key={s.task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 11px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-1)',
                }}
              >
                <span
                  className="gantt-label__dot"
                  style={{ background: s.task.color, width: 12, height: 12, borderRadius: 4 }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 700,
                      fontSize: 12.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.task.name}
                  </span>
                  <span className="tiny muted">
                    {formatLong(s.start)} → {formatLong(s.end)}
                  </span>
                </span>
                <PriorityBadge priority={s.task.priority} />
                <AvatarStack
                  names={s.task.assigneeIds
                    .map((id) => data.resources.find((r) => r.id === id)?.name ?? '')
                    .filter(Boolean)}
                  size={24}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <span className="section-title">
              <Wallet size={14} />
              Beban Anggota Tim
            </span>
          </div>
          <div className="task-list">
            {data.resources.map((r) => {
              const assigned = leafTasks.filter((t) => t.assigneeIds.includes(r.id))
              const load = assigned.length
                ? Math.round(assigned.reduce((a, t) => a + t.progress, 0) / assigned.length)
                : 0
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <Avatar name={r.name} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontWeight: 700,
                        fontSize: 12.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.name}
                    </span>
                    <span className="tiny muted">
                      {r.role} · {assigned.length} tugas
                    </span>
                    <ProgressBar value={load} height={6} />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="section-title">
            <CheckCircle2 size={14} />
            Ringkasan Status
          </span>
        </div>
        <div className="tags">
          {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => {
            const count = leafTasks.filter((t) => t.status === s).length
            return (
              <span key={s} className={`badge badge--${s}`} style={{ padding: '6px 12px' }}>
                {STATUS_LABEL[s]}: {count}
              </span>
            )
          })}
          {(['high', 'medium', 'low'] as const).map((p) => (
            <span key={p} className={`badge badge--${p}`} style={{ padding: '6px 12px' }}>
              {PRIORITY_ICON[p]}
              {PRIORITY_LABEL[p]}: {leafTasks.filter((t) => t.priority === p).length}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
