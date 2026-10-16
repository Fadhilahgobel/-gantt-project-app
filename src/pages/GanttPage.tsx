import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarRange,
  Flame,
  GanttChartSquare,
  Layers,
  Minus,
  MoveHorizontal,
  Plus,
  Ruler,
  Zap,
} from 'lucide-react'
import {
  addDaysISO,
  addWorkingDays,
  diffDays,
  eachDay,
  formatLong,
  isHoliday,
  isWeekend,
  parseISO,
  toISO,
} from '../lib/dateUtils'
import { computeMovePreview, computeResizePreview, isDragMoved } from '../lib/ganttDrag'
import { useProject } from '../store/projectContext'
import { useUi } from '../store/uiContext'
import { DAY_LABEL, DAY_LABEL_FULL, PRIORITY_LABEL, STATUS_LABEL, type Task } from '../types'
import { EmptyState, Tooltip, type TooltipState } from '../components/ui'

const ROW_H = 44

type Zoom = 'day' | 'week' | 'month'

const ZOOM_CONF: Record<Zoom, { dayW: number; label: string }> = {
  day: { dayW: 44, label: 'Hari' },
  week: { dayW: 15, label: 'Minggu' },
  month: { dayW: 5, label: 'Bulan' },
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

/** Urutkan tugas secara hierarkis: induk lalu seluruh sub-tugasnya. */
function hierarchical(tasks: Task[]): Task[] {
  const byParent = new Map<string | null, Task[]>()
  tasks.forEach((t) => {
    const key = t.parentId && tasks.some((p) => p.id === t.parentId) ? t.parentId : null
    const list = byParent.get(key) ?? []
    list.push(t)
    byParent.set(key, list)
  })
  const out: Task[] = []
  const visited = new Set<string>()
  const walk = (parentId: string | null) => {
    for (const t of byParent.get(parentId) ?? []) {
      if (visited.has(t.id)) continue
      visited.add(t.id)
      out.push(t)
      walk(t.id)
    }
  }
  walk(null)
  tasks.forEach((t) => {
    if (!visited.has(t.id)) out.push(t)
  })
  return out
}

interface DragState {
  id: string
  mode: 'move' | 'resize'
  startX: number
  origStart: string
  origDuration: number
  previewStart: string
  previewDuration: number
  moved: boolean
}

export function GanttPage({
  selectedId,
  onSelect,
  onEdit,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
  onEdit: (task: Task) => void
}) {
  const { data, schedule, updateTask } = useProject()
  const { toast } = useUi()
  const [zoom, setZoom] = useState<Zoom>('day')
  const [tip, setTip] = useState<TooltipState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dayW = ZOOM_CONF[zoom].dayW

  const rows = useMemo(() => hierarchical(data.tasks), [data.tasks])
  const today = toISO(new Date())

  const range = useMemo(() => {
    const sched = rows.map((r) => schedule.byId[r.id]).filter(Boolean)
    if (sched.length === 0) return null
    const starts = sched.map((s) => s.start).sort()
    const ends = sched.map((s) => s.end).sort()
    const from = addDaysISO(starts[0], -2)
    const to = addDaysISO(ends[ends.length - 1], 3)
    return { from, to, days: eachDay(from, to) }
  }, [rows, schedule])

  const leftOf = (iso: string) => diffDays(range?.from ?? iso, iso) * dayW
  const widthOf = (startIso: string, endIso: string) =>
    (diffDays(startIso, endIso) + 1) * dayW

  const setDragState = (next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }

  /* ---------------- Drag & resize via pointer events ---------------- */
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const deltaX = e.clientX - d.startX
      const moved = d.moved || isDragMoved(deltaX)
      if (d.mode === 'move') {
        const snapped = computeMovePreview({
          origStart: d.origStart,
          deltaX,
          dayW,
          calendar: data.calendar,
        })
        if (snapped === d.previewStart && moved === d.moved) return
        setDragState({ ...d, previewStart: snapped, moved })
      } else {
        const dur = computeResizePreview({
          origStart: d.origStart,
          origDuration: d.origDuration,
          deltaX,
          dayW,
          calendar: data.calendar,
        })
        if (dur === d.previewDuration && moved === d.moved) return
        setDragState({ ...d, previewDuration: dur, moved })
      }
    }

    const onUp = () => {
      const d = dragRef.current
      setDragState(null)
      if (!d) return
      if (!d.moved) {
        onSelect(d.id)
        return
      }
      if (d.mode === 'move' && d.previewStart !== d.origStart) {
        updateTask(d.id, { startDate: d.previewStart })
        toast({
          variant: 'success',
          message: `Tanggal mulai diperbarui ke ${formatLong(d.previewStart)}.`,
        })
      } else if (d.mode === 'resize' && d.previewDuration !== d.origDuration) {
        updateTask(d.id, { durationDays: d.previewDuration })
        toast({
          variant: 'success',
          message: `Durasi diperbarui menjadi ${d.previewDuration} hari kerja.`,
        })
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, dayW, data.calendar])

  if (!range) {
    return (
      <EmptyState
        icon={<GanttChartSquare size={34} />}
        title="Belum ada tugas untuk digambar"
        description="Tambahkan tugas terlebih dahulu, lalu kembali ke halaman Gantt untuk melihat timeline, dependensi, dan jalur kritisnya."
      />
    )
  }

  const totalWidth = range.days.length * dayW + 24
  const laneHeight = rows.length * ROW_H
  const rowIndex = new Map(rows.map((t, i) => [t.id, i]))

  const todayX = diffDays(range.from, today) * dayW
  const showToday = todayX >= 0 && todayX <= totalWidth

  /* ---------------- Header ticks ---------------- */
  const ticks: { key: string; left: number; width: number; label: string; sub: string; cls: string }[] =
    []
  if (zoom === 'day') {
    range.days.forEach((iso) => {
      const weekend = isWeekend(iso, data.calendar)
      const holiday = isHoliday(iso, data.calendar)
      ticks.push({
        key: iso,
        left: leftOf(iso),
        width: dayW,
        label: String(parseISO(iso).getDate()),
        sub: DAY_LABEL[parseISO(iso).getDay()],
        cls: holiday ? 'is-holiday' : weekend ? 'is-weekend' : iso === today ? 'is-today' : '',
      })
    })
  } else if (zoom === 'week') {
    range.days.forEach((iso) => {
      if (parseISO(iso).getDay() !== 1) return
      ticks.push({
        key: iso,
        left: leftOf(iso),
        width: 7 * dayW,
        label: `${parseISO(iso).getDate()} ${MONTHS[parseISO(iso).getMonth()]}`,
        sub: '',
        cls: '',
      })
    })
  } else {
    const seen = new Set<string>()
    range.days.forEach((iso) => {
      const d = parseISO(iso)
      if (d.getDate() !== 1) return
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (seen.has(key)) return
      seen.add(key)
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const span = diffDays(iso, toISO(nextMonth))
      ticks.push({
        key,
        left: leftOf(iso),
        width: span * dayW,
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        sub: '',
        cls: '',
      })
    })
  }

  const monthMarks: { key: string; left: number; label: string }[] = []
  if (zoom !== 'month') {
    const seen = new Set<string>()
    range.days.forEach((iso) => {
      const d = parseISO(iso)
      if (d.getDate() !== 1) return
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (seen.has(key)) return
      seen.add(key)
      monthMarks.push({
        key,
        left: leftOf(iso),
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      })
    })
  }

  /* ---------------- Bars ---------------- */
  const barRect = (taskId: string) => {
    const sc = schedule.byId[taskId]
    if (!sc) return null
    const isDragged = drag?.id === taskId && !sc.isParent
    const start = isDragged && drag ? drag.previewStart : sc.start
    // Fase induk memakai rentang anak (sc.end), tugas daun memakai durasinya sendiri.
    const end =
      isDragged && drag
        ? addWorkingDays(drag.previewStart, drag.previewDuration, data.calendar)
        : sc.end
    return { left: leftOf(start), width: Math.max(12, widthOf(start, end)), sc }
  }

  /* ---------------- Dependency arrows ---------------- */
  const arrows = data.dependencies
    .map((dep) => {
      const pIdx = rowIndex.get(dep.predecessorId)
      const sIdx = rowIndex.get(dep.successorId)
      const pred = schedule.byId[dep.predecessorId]
      const succ = schedule.byId[dep.successorId]
      if (pIdx === undefined || sIdx === undefined || !pred || !succ) return null
      const y1 = pIdx * ROW_H + ROW_H / 2
      const y2 = sIdx * ROW_H + ROW_H / 2
      const predW = Math.max(12, widthOf(pred.start, pred.end))
      const x1 =
        dep.type === 'FS' ? leftOf(pred.start) + predW : leftOf(pred.start) + 2
      const x2 = leftOf(succ.start) - 1
      const active = selectedId === dep.predecessorId || selectedId === dep.successorId

      let path: string
      const startPad = 12
      if (x2 >= x1 + startPad + 10) {
        const midX = x1 + startPad
        path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
      } else {
        const midX = x1 + startPad
        const leftX = x2 - startPad
        const viaY = y2 > y1 ? y2 - 16 : y2 + 16
        path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${viaY} L ${leftX} ${viaY} L ${leftX} ${y2} L ${x2} ${y2}`
      }

      return { dep, path, x2, y2, active }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)

  const showTip = (task: Task, e: React.MouseEvent) => {
    const sc = schedule.byId[task.id]
    const names = task.assigneeIds
      .map((id) => data.resources.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(', ')
    setTip({
      x: e.clientX,
      y: e.clientY,
      content: (
        <>
          <div className="tooltip__title">{task.name}</div>
          <div className="tooltip__row">
            <span>Mulai</span>
            <b>{formatLong(sc?.start ?? task.startDate)}</b>
          </div>
          <div className="tooltip__row">
            <span>Selesai</span>
            <b>{formatLong(sc?.end ?? task.startDate)}</b>
          </div>
          <div className="tooltip__row">
            <span>{sc?.isParent ? 'Durasi gabungan sub-tugas' : 'Durasi'}</span>
            <b>{(sc?.workingDays ?? task.durationDays)} hari kerja</b>
          </div>
          {sc?.isParent && (
            <div className="tooltip__row">
              <span>Jenis</span>
              <b>Fase induk · mulai/selesai dari sub-tugas</b>
            </div>
          )}
          {sc?.isParent && (
            <div className="tooltip__row">
              <span>Progres gabungan sub-tugas</span>
              <b>{sc.rolledUpProgress}%</b>
            </div>
          )}
          <div className="tooltip__row">
            <span>Penanggung jawab</span>
            <b>{names || '—'}</b>
          </div>
          <div className="tooltip__row">
            <span>Prioritas</span>
            <b>{PRIORITY_LABEL[task.priority]}</b>
          </div>
          <div className="tooltip__row">
            <span>Status</span>
            <b>{STATUS_LABEL[task.status]}</b>
          </div>
          <div className="tooltip__row">
            <span>Total float</span>
            <b>
              {sc?.totalFloat ?? 0} hari {sc?.isCritical ? '(kritis)' : ''}
            </b>
          </div>
        </>
      ),
    })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Gantt Chart</h2>
          <p>
            Geser bar untuk mengubah tanggal mulai, tarik sisi kanan untuk mengubah durasi. Semua
            perhitungan memakai hari kerja.
          </p>
        </div>
      </div>

      <div className="gantt-shell">
        <div className="gantt-toolbar">
          <span className="section-title">
            <GanttChartSquare size={14} />
            Timeline
          </span>
          <span className="seg" role="group" aria-label="Tingkat zoom">
            {(Object.keys(ZOOM_CONF) as Zoom[]).map((z) => (
              <button
                key={z}
                type="button"
                className={zoom === z ? 'is-active' : ''}
                aria-pressed={zoom === z}
                onClick={() => setZoom(z)}
              >
                {ZOOM_CONF[z].label}
              </button>
            ))}
          </span>
          <div className="gantt-toolbar__spacer" />
          <span className="tiny muted" style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MoveHorizontal size={13} /> drag / resize
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Ruler size={13} /> {schedule.durationWorkingDays} hari kerja
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Flame size={13} color="var(--neon)" /> {schedule.criticalPath.length} tugas kritis
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Layers size={13} /> bar bergaris = fase induk (gabungan sub-tugas)
            </span>
          </span>
          <span className="seg">
            <button
              type="button"
              aria-label="Perkecil skala"
              onClick={() =>
                setZoom((z) => (z === 'day' ? 'week' : z === 'week' ? 'month' : 'month'))
              }
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              aria-label="Perbesar skala"
              onClick={() => setZoom((z) => (z === 'month' ? 'week' : z === 'week' ? 'day' : 'day'))}
            >
              <Plus size={13} />
            </button>
          </span>
        </div>

        <div className="gantt-scroll">
          <div className="gantt-inner">
            {/* -------- Panel kiri: daftar tugas -------- */}
            <div className="gantt-left">
              <div className="gantt-head">Tugas &amp; Fase</div>
              {rows.map((task) => {
                const sc = schedule.byId[task.id]
                const isChild = task.parentId !== null
                return (
                  <div
                    key={task.id}
                    className={`gantt-row ${selectedId === task.id ? 'is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="gantt-label"
                      onClick={() => onSelect(selectedId === task.id ? null : task.id)}
                      onDoubleClick={() => onEdit(task)}
                      title={task.name}
                    >
                      <span
                        className="gantt-label__dot"
                        style={{ background: task.color, marginLeft: isChild ? 14 : 0 }}
                      />
                      <span className={`gantt-label__text ${isChild ? 'is-child' : ''}`}>
                        {task.name}
                      </span>
                      {sc?.isCritical && <Zap size={12} className="gantt-label__crit" fill="currentColor" />}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* -------- Panel kanan: timeline -------- */}
            <div className="gantt-right" style={{ width: totalWidth }}>
              <div className="gantt-head" style={{ width: totalWidth, position: 'relative' }}>
                {ticks.map((t) => (
                  <div
                    key={t.key}
                    className={`gantt-tick ${t.cls}`}
                    style={{ left: t.left, width: t.width }}
                  >
                    <div style={{ fontWeight: 800 }}>{t.label}</div>
                    {t.sub && <div style={{ fontSize: 9, opacity: 0.75 }}>{t.sub}</div>}
                  </div>
                ))}
                {monthMarks.map((m) => (
                  <div key={m.key} className="gantt-month" style={{ left: m.left + 6 }}>
                    {m.label}
                  </div>
                ))}
              </div>

              <div
                className="gantt-lanes"
                style={{ position: 'relative', height: laneHeight, width: totalWidth }}
              >
                {/* Latar kolom hari */}
                <div className="gantt-grid-bg">
                  {range.days.map((iso) => {
                    const holiday = isHoliday(iso, data.calendar)
                    const weekend = isWeekend(iso, data.calendar)
                    const cls = [
                      'gantt-col',
                      holiday ? 'is-holiday' : weekend ? 'is-weekend' : '',
                      iso === today ? 'is-today' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    return (
                      <div
                        key={iso}
                        className={cls}
                        style={{ left: leftOf(iso), width: dayW }}
                      />
                    )
                  })}
                </div>

                {/* Baris latar */}
                {rows.map((task, i) => (
                  <div
                    key={task.id}
                    className={`gantt-row ${selectedId === task.id ? 'is-selected' : ''}`}
                    style={{
                      position: 'absolute',
                      top: i * ROW_H,
                      left: 0,
                      width: totalWidth,
                    }}
                  />
                ))}

                {/* Panah dependensi */}
                <svg
                  className="gantt-svg"
                  width={totalWidth}
                  height={laneHeight}
                  aria-hidden="true"
                >
                  {arrows.map((a) => (
                    <g key={a.dep.id}>
                      <path
                        className={`dep-path ${a.active ? 'is-active' : ''}`}
                        d={a.path}
                        strokeDasharray={a.dep.type === 'SS' ? '4 3' : undefined}
                      />
                      <path
                        className={`dep-arrow ${a.active ? 'is-active' : ''}`}
                        d={`M ${a.x2} ${a.y2} l -7 -4 l 0 8 z`}
                      />
                      {a.dep.lagDays !== 0 && (
                        <text className="dep-label-text" x={a.x2 - 16} y={a.y2 - 6}>
                          {a.dep.lagDays > 0 ? `+${a.dep.lagDays}` : a.dep.lagDays}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>

                {/* Garis hari ini */}
                {showToday && <div className="gantt-today-line" style={{ left: todayX }} />}

                {/* Bar tugas */}
                {rows.map((task, i) => {
                  const rect = barRect(task.id)
                  if (!rect) return null
                  const { sc } = rect
                  const isDragged = drag?.id === task.id && !sc.isParent
                  const duration = isDragged && drag ? drag.previewDuration : sc.workingDays
                  const progress = sc.rolledUpProgress
                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${task.name}, ${formatLong(sc.start)} sampai ${formatLong(sc.end)}, ${sc.workingDays} hari kerja${sc.isParent ? ', fase induk' : ''}`}
                      className={[
                        'bar',
                        sc.isCritical ? 'is-critical' : '',
                        sc.isParent ? 'is-summary' : '',
                        selectedId === task.id ? 'is-selected' : '',
                        isDragged ? 'is-dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        left: rect.left,
                        width: rect.width,
                        top: i * ROW_H + 9,
                        background: sc.isParent
                          ? `repeating-linear-gradient(45deg, ${task.color}, ${task.color} 7px, ${task.color}bb 7px, ${task.color}bb 14px)`
                          : `linear-gradient(180deg, ${task.color}, ${task.color}cc)`,
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        // Fase induk tidak dijadwalkan dari durasinya sendiri,
                        // jadi bar-nya tidak bisa digeser atau di-resize.
                        if (sc.isParent) return
                        e.preventDefault()
                        setDragState({
                          id: task.id,
                          mode: 'move',
                          startX: e.clientX,
                          origStart: sc.start,
                          origDuration: Math.max(1, Math.round(sc.task.durationDays)),
                          previewStart: sc.start,
                          previewDuration: Math.max(1, Math.round(sc.task.durationDays)),
                          moved: false,
                        })
                      }}
                      onClick={() => {
                        if (sc.isParent) onSelect(selectedId === task.id ? null : task.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelect(task.id)
                        }
                      }}
                      onMouseEnter={(e) => showTip(task, e)}
                      onMouseMove={(e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                      onMouseLeave={() => setTip(null)}
                    >
                      <span className="bar__progress" style={{ width: `${progress}%` }} />
                      <span className="bar__label">
                        {progress}% · {duration} hari{sc.isParent ? ' (fase)' : ''}
                      </span>
                      {!sc.isParent && (
                        <span
                          className="bar__handle"
                          title="Tarik untuk mengubah durasi"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            setDragState({
                              id: task.id,
                              mode: 'resize',
                              startX: e.clientX,
                              origStart: sc.start,
                              origDuration: Math.max(1, Math.round(sc.task.durationDays)),
                              previewStart: sc.start,
                              previewDuration: Math.max(1, Math.round(sc.task.durationDays)),
                              moved: false,
                            })
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="legend">
          <span>
            <span className="legend__swatch" style={{ background: 'var(--neon)' }} />
            Tugas jalur kritis
          </span>
          <span>
            <span className="legend__swatch" style={{ background: 'var(--warn)' }} />
            Prioritas tinggi
          </span>
          <span>
            <span
              className="legend__swatch"
              style={{
                background:
                  'repeating-linear-gradient(45deg, rgba(255,255,255,0.15), rgba(255,255,255,0.15) 3px, transparent 3px, transparent 6px)',
              }}
            />
            Akhir pekan
          </span>
          <span>
            <span className="legend__swatch" style={{ background: 'var(--warn-dim)' }} />
            Hari libur
          </span>
          <span>
            <CalendarRange size={13} /> {formatLong(range.from)} – {formatLong(range.to)}
          </span>
          <span className="tiny">
            {DAY_LABEL_FULL[0]}–{DAY_LABEL_FULL[6]} · {data.calendar.holidays.length} hari libur
          </span>
        </div>
      </div>

      <Tooltip state={tip} />
    </>
  )
}
