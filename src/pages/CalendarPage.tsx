import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react'
import {
  addDaysISO,
  countWorkingDaysInclusive,
  diffDays,
  eachDay,
  formatIDR,
  formatLong,
  isHoliday,
  isWeekend,
  parseISO,
  toISO,
} from '../lib/dateUtils'
import { useProject } from '../store/projectContext'
import { useUi } from '../store/uiContext'
import { DAY_LABEL, DAY_LABEL_FULL } from '../types'
import { EmptyState, StatCard } from '../components/ui'

export function CalendarPage() {
  const { data, schedule, updateCalendar } = useProject()
  const { toast, confirm } = useUi()
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [newHoliday, setNewHoliday] = useState('')
  const today = toISO(now)

  const first = toISO(new Date(cursor.y, cursor.m, 1))
  const last = toISO(new Date(cursor.y, cursor.m + 1, 0))
  const gridStart = addDaysISO(first, -parseISO(first).getDay())
  const gridEnd = addDaysISO(last, 6 - parseISO(last).getDay())
  const gridDays = eachDay(gridStart, gridEnd)

  const workingInMonth = countWorkingDaysInclusive(first, last, data.calendar)
  const calendarDaysInMonth = diffDays(first, last) + 1
  const holidaysThisMonth = data.calendar.holidays.filter(
    (h) => h >= first && h <= last,
  ).length

  const monthLabel = useMemo(() => {
    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ]
    return `${months[cursor.m]} ${cursor.y}`
  }, [cursor])

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const toggleWeekend = (day: number) => {
    const set = new Set(data.calendar.weekendDays)
    if (set.has(day)) set.delete(day)
    else set.add(day)
    updateCalendar({ weekendDays: [...set].sort() })
    toast({ variant: 'info', message: 'Pengaturan akhir pekan diperbarui.' })
  }

  const addHoliday = () => {
    if (!newHoliday) {
      toast({ variant: 'error', message: 'Pilih tanggal hari libur terlebih dahulu.' })
      return
    }
    if (data.calendar.holidays.includes(newHoliday)) {
      toast({ variant: 'error', message: 'Tanggal tersebut sudah terdaftar sebagai hari libur.' })
      return
    }
    updateCalendar({ holidays: [...data.calendar.holidays, newHoliday].sort() })
    setNewHoliday('')
    toast({ variant: 'success', message: `Hari libur ${formatLong(newHoliday)} ditambahkan.` })
  }

  const removeHoliday = async (date: string) => {
    const ok = await confirm({
      title: 'Hapus hari libur?',
      message: `${formatLong(date)} akan dihitung sebagai hari kerja lagi dan seluruh durasi tugas dijadwalkan ulang.`,
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!ok) return
    updateCalendar({ holidays: data.calendar.holidays.filter((h) => h !== date) })
    toast({ variant: 'success', message: 'Hari libur dihapus.' })
  }

  const markAsHoliday = (iso: string) => {
    if (data.calendar.holidays.includes(iso)) return
    updateCalendar({ holidays: [...data.calendar.holidays, iso].sort() })
    toast({ variant: 'success', message: `${formatLong(iso)} ditandai sebagai hari libur.` })
  }

  if (data.tasks.length === 0 && data.calendar.holidays.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays size={34} />}
        title="Kalender belum dikonfigurasi"
        description="Atur akhir pekan dan tambahkan hari libur khusus. Semua perhitungan durasi tugas akan otomatis mengikuti kalender ini."
      />
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Kalender Proyek</h2>
          <p>
            Durasi tugas hanya menghitung hari kerja. Akhir pekan dan hari libur khusus otomatis
            dilewati oleh penjadwalan.
          </p>
        </div>
      </div>

      <div className="grid grid--stats list-enter">
        <StatCard
          icon={<CalendarDays size={19} />}
          label="Hari Kerja Bulan Ini"
          value={workingInMonth}
          suffix={`/ ${calendarDaysInMonth} hari`}
          hint={monthLabel}
          accent
        />
        <StatCard
          icon={<CalendarOff size={19} />}
          label="Hari Libur Bulan Ini"
          value={holidaysThisMonth}
          hint="Di luar akhir pekan rutin"
        />
        <StatCard
          icon={<CalendarOff size={19} />}
          label="Total Hari Libur"
          value={data.calendar.holidays.length}
          hint="Sepanjang proyek"
        />
        <StatCard
          icon={<Info size={19} />}
          label="Durasi Proyek"
          value={schedule.durationWorkingDays}
          suffix="hari kerja"
          hint={schedule.projectEnd ? `Selesai ${formatLong(schedule.projectEnd)}` : '—'}
        />
      </div>

      <div className="grid grid--2">
        {/* ------------------ Pengaturan akhir pekan ------------------ */}
        <div className="card">
          <div className="card__head">
            <span className="section-title">
              <Wand2 size={14} />
              Akhir Pekan
            </span>
          </div>
          <p className="tiny muted" style={{ marginBottom: 12 }}>
            Pilih hari yang dianggap bukan hari kerja. Default: Sabtu &amp; Minggu.
          </p>
          <div className="chips">
            {DAY_LABEL_FULL.map((label, index) => {
              const on = data.calendar.weekendDays.includes(index)
              return (
                <button
                  key={label}
                  type="button"
                  className={`check ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleWeekend(index)}
                >
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>{DAY_LABEL[index]}</span>
                  <span className="tiny muted">{label}</span>
                </button>
              )
            })}
          </div>
          {data.calendar.weekendDays.length === 0 && (
            <p className="field__hint" style={{ color: 'var(--warn)', marginTop: 10 }}>
              Tidak ada akhir pekan — semua hari dihitung sebagai hari kerja.
            </p>
          )}
        </div>

        {/* ------------------ Hari libur khusus ------------------ */}
        <div className="card">
          <div className="card__head">
            <span className="section-title">
              <CalendarOff size={14} />
              Hari Libur Khusus
            </span>
            <span className="badge badge--ghost" style={{ marginLeft: 'auto' }}>
              {data.calendar.holidays.length}
            </span>
          </div>

          <div className="btn-row" style={{ marginBottom: 12, alignItems: 'center' }}>
            <input
              type="date"
              className="input"
              style={{ flex: 1, minWidth: 150 }}
              value={newHoliday}
              aria-label="Tanggal hari libur baru"
              onChange={(e) => setNewHoliday(e.target.value)}
            />
            <button type="button" className="btn btn--primary" onClick={addHoliday}>
              <Plus size={15} />
              Tambah
            </button>
          </div>

          {data.calendar.holidays.length === 0 ? (
            <p className="field__hint">Belum ada hari libur khusus.</p>
          ) : (
            <div className="tags">
              {[...data.calendar.holidays]
                .sort()
                .map((h) => (
                  <span key={h} className="badge badge--medium" style={{ paddingRight: 4 }}>
                    <CalendarOff size={11} />
                    {formatLong(h)}
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      style={{ padding: 3 }}
                      aria-label={`Hapus hari libur ${h}`}
                      onClick={() => removeHoliday(h)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ------------------ Kalender bulanan ------------------ */}
      <div className="card">
        <div className="card__head">
          <span className="section-title">
            <CalendarDays size={14} />
            Kalender {monthLabel}
          </span>
          <span className="btn-row" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Bulan sebelumnya"
              onClick={() => shift(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}
            >
              Hari ini
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Bulan berikutnya"
              onClick={() => shift(1)}
            >
              <ChevronRight size={16} />
            </button>
          </span>
        </div>

        <div className="cal-grid" role="grid" aria-label={`Kalender ${monthLabel}`}>
          {DAY_LABEL_FULL.map((d) => (
            <div key={d} className="cal-dow">
              {d.slice(0, 3)}
            </div>
          ))}
          {gridDays.map((iso) => {
            const holiday = isHoliday(iso, data.calendar)
            const weekend = isWeekend(iso, data.calendar)
            const out = iso < first || iso > last
            const tasksHere = schedule.tasks.filter((s) => iso >= s.start && iso <= s.end)
            const cls = [
              'cal-day',
              out ? 'is-out' : '',
              weekend && !holiday ? 'is-weekend' : '',
              holiday ? 'is-holiday' : '',
              iso === today ? 'is-today' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                style={{ textAlign: 'left', cursor: holiday ? 'pointer' : 'default' }}
                title={
                  holiday
                    ? `${formatLong(iso)} — hari libur (klik ikon untuk hapus dari daftar)`
                    : `${formatLong(iso)}${weekend ? ' — akhir pekan' : ''}`
                }
                onClick={() => {
                  if (!out && !holiday && !weekend) markAsHoliday(iso)
                }}
              >
                <span className="cal-day__num">{parseISO(iso).getDate()}</span>
                {holiday && <span className="cal-day__tag">Libur</span>}
                {iso === today && !holiday && <span className="cal-day__tag" style={{ color: 'var(--neon)' }}>Hari ini</span>}
                <span className="cal-day__tasks">
                  {tasksHere.slice(0, 4).map((s) => (
                    <span
                      key={s.task.id}
                      className="cal-dot"
                      style={{ background: s.task.color }}
                      title={s.task.name}
                    />
                  ))}
                  {tasksHere.length > 4 && (
                    <span className="tiny muted">+{tasksHere.length - 4}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <p className="tiny muted" style={{ marginTop: 12 }}>
          Klik tanggal pada kalender untuk menjadikannya hari libur. Hari kerja pada bulan ini:{' '}
          <b style={{ color: 'var(--neon)' }}>{workingInMonth} hari</b>. Setiap perubahan kalender
          langsung menjadwalkan ulang seluruh tugas beserta jalur kritisnya.
        </p>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="section-title">
            <Info size={14} />
            Ringkasan Jadwal
          </span>
        </div>
        <div className="task-card__meta">
          <span>Mulai proyek: {schedule.projectStart ? formatLong(schedule.projectStart) : '—'}</span>
          <span>Selesai proyek: {schedule.projectEnd ? formatLong(schedule.projectEnd) : '—'}</span>
          <span>Total hari kerja: {schedule.durationWorkingDays}</span>
          <span>Tugas kritis: {schedule.criticalPath.length}</span>
          <span>Nilai gaji tim: {formatIDR(data.resources.reduce((a, r) => a + r.salary, 0))}/bulan</span>
        </div>
      </div>
    </>
  )
}
