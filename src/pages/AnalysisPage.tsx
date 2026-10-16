import { useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Flame,
  GitBranch,
  Info,
  Layers,
  Sigma,
  Target,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { formatLong } from '../lib/dateUtils'
import { useProject } from '../store/projectContext'
import type { ScheduledTask } from '../lib/scheduling'
import type { DependencyType } from '../types'
import { EmptyState, ProgressBar, StatCard } from '../components/ui'

/** Aproksimasi erf untuk menghitung CDF distribusi normal. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/* ------------------------------------------------------------------ Legenda */
interface LegendItem {
  key: string
  label: string
  tooltip: string
}

/** Legenda diagram PERT dengan bahasa sederhana + tooltip penjelasan. */
const PERT_LEGEND: LegendItem[] = [
  {
    key: 'ES',
    label: 'Mulai paling awal',
    tooltip:
      'Earliest Start — hari kerja paling awal tugas boleh dimulai, mengikuti tanggal mulai dan dependensi pendahulunya.',
  },
  {
    key: 'EF',
    label: 'Selesai paling awal',
    tooltip:
      'Earliest Finish — hari kerja paling awal tugas bisa selesai: EF = ES + durasi − 1.',
  },
  {
    key: 'LS',
    label: 'Mulai paling lambat',
    tooltip:
      'Latest Start — hari kerja paling lambat untuk mulai tanpa menunda tanggal selesai proyek.',
  },
  {
    key: 'LF',
    label: 'Selesai paling lambat',
    tooltip:
      'Latest Finish — hari kerja paling lambat untuk selesai tanpa menunda proyek: LF = LS + durasi − 1.',
  },
  {
    key: 'Float',
    label: 'Kelonggaran',
    tooltip:
      'Total float = LS − ES. Float 0 berarti tugas kritis: keterlambatannya langsung menunda seluruh proyek.',
  },
  {
    key: 'Te',
    label: 'Durasi harapan PERT',
    tooltip:
      'Expected time = (Optimis + 4 × Paling Mungkin + Pesimis) / 6. Dipakai untuk estimasi peluang selesai.',
  },
  {
    key: 'CP',
    label: 'Jalur kritis',
    tooltip:
      'Critical Path — rangkaian tugas ber-float 0 dari awal sampai akhir proyek. Digambar kuning neon.',
  },
  {
    key: 'Hari ke-N',
    label: 'hari kerja ke-N (mulai dari 1)',
    tooltip:
      'Semua indeks ES/EF/LS/LF ditulis sebagai hari kerja ke-N, dimulai dari 1 (bukan 0).',
  },
  {
    key: 'FS / SS',
    label: 'jenis dependensi + lag',
    tooltip:
      'FS = Finish-to-Start (mulai setelah pendahulu selesai), SS = Start-to-Start (mulai bersamaan) dengan lag dalam hari kerja.',
  },
]

/* ---------------------------------------------------- Tata letak diagram PERT */
const NODE_W = 236
const NODE_H = 162
const COL_GAP = 96
const ROW_GAP = 26
const CANVAS_PAD = 14
const LABEL_CHAR_W = 5.6

interface PertLink {
  id: string
  path: string
  type: DependencyType
  lagDays: number
  label: string
  labelX: number
  labelY: number
  labelW: number
  critical: boolean
  description: string
}

export function AnalysisPage() {
  const { data, schedule } = useProject()

  const scheduled = schedule.tasks
  // Fase induk bukan node PERT — ia hanya label pengelompok sub-tugasnya.
  const leaves = useMemo(() => scheduled.filter((s) => !s.isParent), [scheduled])
  const criticalLeaves = useMemo(
    () => leaves.filter((s) => s.isCritical).sort((a, b) => a.esIndex - b.esIndex),
    [leaves],
  )
  const chain = schedule.criticalChain
    .map((id) => schedule.byId[id])
    .filter((s): s is ScheduledTask => Boolean(s))
  const parallelCritical = criticalLeaves.filter((s) => !chain.includes(s))

  /** Nama fase induk, dipakai sebagai label pengelompok di atas setiap node. */
  const nameById = useMemo(
    () => new Map(data.tasks.map((t) => [t.id, t.name])),
    [data.tasks],
  )

  /**
   * Kolom diagram = kedalaman dependensi antar tugas daun (kiri → kanan),
   * baris = urutan mulai paling awal di dalam kolom itu.
   */
  const layout = useMemo(() => {
    const leafIds = new Set(leaves.map((s) => s.task.id))
    const depth = new Map<string, number>()
    const resolving = new Set<string>()
    const resolve = (id: string): number => {
      const known = depth.get(id)
      if (known !== undefined) return known
      if (resolving.has(id)) return 0
      resolving.add(id)
      const preds = data.dependencies.filter(
        (d) => d.successorId === id && leafIds.has(d.predecessorId),
      )
      const value =
        preds.length === 0 ? 0 : Math.max(...preds.map((d) => resolve(d.predecessorId) + 1))
      resolving.delete(id)
      depth.set(id, value)
      return value
    }
    leaves.forEach((s) => resolve(s.task.id))

    const columns: ScheduledTask[][] = []
    leaves.forEach((s) => {
      const col = depth.get(s.task.id) ?? 0
      while (columns.length <= col) columns.push([])
      columns[col].push(s)
    })
    columns.forEach((col) =>
      col.sort((a, b) => a.esIndex - b.esIndex || a.efIndex - b.efIndex),
    )

    const positions = new Map<string, { x: number; y: number }>()
    let maxRows = 1
    columns.forEach((col, ci) => {
      maxRows = Math.max(maxRows, col.length)
      col.forEach((s, ri) => {
        positions.set(s.task.id, {
          x: CANVAS_PAD + ci * (NODE_W + COL_GAP),
          y: CANVAS_PAD + ri * (NODE_H + ROW_GAP),
        })
      })
    })

    return {
      positions,
      width:
        CANVAS_PAD * 2 +
        columns.length * NODE_W +
        Math.max(0, columns.length - 1) * COL_GAP,
      height:
        CANVAS_PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP,
    }
  }, [leaves, data.dependencies])

  /** Panah dependensi antar node PERT, lengkap dengan label FS/SS + lag. */
  const links = useMemo<PertLink[]>(() => {
    const out: PertLink[] = []
    data.dependencies.forEach((d) => {
      if (d.predecessorId === d.successorId) return
      const pred = schedule.byId[d.predecessorId]
      const succ = schedule.byId[d.successorId]
      const from = layout.positions.get(d.predecessorId)
      const to = layout.positions.get(d.successorId)
      if (!pred || !succ || !from || !to || pred.isParent || succ.isParent) return

      const x1 = from.x + NODE_W
      const y1 = from.y + NODE_H / 2
      const x2 = to.x
      const y2 = to.y + NODE_H / 2
      const bend = Math.max(30, Math.abs(x2 - x1) * 0.5)
      const label = d.lagDays === 0 ? d.type : `${d.type} +${d.lagDays}`

      out.push({
        id: d.id,
        path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        type: d.type,
        lagDays: d.lagDays,
        label,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 9,
        labelW: 14 + label.length * LABEL_CHAR_W,
        critical: pred.isCritical && succ.isCritical,
        description: `${pred.task.name} → ${succ.task.name} · ${
          d.type === 'FS' ? 'Finish-to-Start' : 'Start-to-Start'
        } · lag ${d.lagDays} hari kerja`,
      })
    })
    return out
  }, [data.dependencies, layout, schedule])

  const onTimeProbability =
    schedule.pertStdDev > 0
      ? Math.round(
          normalCdf(
            (schedule.durationWorkingDays - schedule.pertDuration) / schedule.pertStdDev,
          ) * 100,
        )
      : 100

  const criticalWorkDays = criticalLeaves.reduce((a, s) => a + s.workingDays, 0)
  const chainVariance = chain.reduce((a, s) => a + s.pert.variance, 0)
  const teBeyondCpm = schedule.pertDuration > schedule.durationWorkingDays

  if (scheduled.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={34} />}
        title="Belum ada data untuk dianalisis"
        description="Tambahkan tugas dan dependensi terlebih dahulu. Analisis jalur kritis serta diagram PERT akan dihitung otomatis dari data tersebut."
      />
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Analisis Proyek</h2>
          <p>
            Critical Path Method (CPM) dan Program Evaluation &amp; Review Technique (PERT)
            dihitung otomatis dari dependensi serta estimasi 3-titik setiap tugas daun. Fase induk
            hanya menjadi label pengelompok.
          </p>
        </div>
      </div>

      <div className="grid grid--stats list-enter">
        <StatCard
          icon={<Timer size={19} />}
          label="Durasi CPM"
          value={schedule.durationWorkingDays}
          suffix="hari kerja"
          hint={`Jalur terpanjang lewat ${leaves.length} tugas daun — fase induk tidak menambah durasi`}
          accent
        />
        <StatCard
          icon={<TrendingUp size={19} />}
          label="Ekspektasi PERT"
          value={schedule.pertDuration.toFixed(1)}
          suffix="hari"
          hint={
            teBeyondCpm
              ? `Jumlah Te sepanjang rantai kritis (${chain.length} tugas). Lebih panjang dari CPM karena Te = nilai harapan, bukan durasi terjadwal.`
              : `Jumlah Te sepanjang rantai kritis berurutan (${chain.length} tugas) — tidak menghitung tugas paralel dua kali.`
          }
        />
        <StatCard
          icon={<Sigma size={19} />}
          label="Standar Deviasi"
          value={schedule.pertStdDev.toFixed(2)}
          suffix="hari"
          hint={`Variansi rantai kritis ${chainVariance.toFixed(2)}`}
        />
        <StatCard
          icon={<Flame size={19} />}
          label="Tugas Kritis"
          value={criticalLeaves.length}
          suffix={`/ ${leaves.length}`}
          hint={`${criticalWorkDays} hari kerja tanpa float (hanya tugas daun)`}
        />
      </div>

      {schedule.cycleIds.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(255,77,106,0.45)' }}>
          <div className="card__head">
            <span className="section-title" style={{ color: 'var(--danger)' }}>
              <AlertTriangle size={14} />
              Siklus Dependensi Terdeteksi
            </span>
          </div>
          <p className="tiny muted">
            Terdapat hubungan antar tugas yang saling bergantung secara melingkar. Hasil
            penjadwalan mungkin tidak akurat — periksa kembali dependensi tugas-tugas berikut:
          </p>
          <div className="tags" style={{ marginTop: 8 }}>
            {schedule.cycleIds.map((id) => (
              <span key={id} className="badge badge--blocked">
                {schedule.byId[id]?.task.name ?? id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ------------------ Jalur kritis ------------------ */}
      <div className="card">
        <div className="card__head">
          <span className="section-title">
            <Flame size={14} />
            Jalur Kritis (Critical Path)
          </span>
          <span className="badge badge--critical" style={{ marginLeft: 'auto' }}>
            {criticalLeaves.length} tugas · {criticalWorkDays} hari kerja
          </span>
        </div>

        {criticalLeaves.length === 0 ? (
          <p className="muted tiny">Tidak ada tugas kritis terdeteksi.</p>
        ) : (
          <>
            <p className="tiny muted" style={{ marginBottom: 10 }}>
              Rantai kritis berurutan (inilah yang dijumlahkan menjadi durasi PERT):
            </p>
            <div className="chain">
              {chain.map((s, i) => (
                <span
                  key={s.task.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  {i > 0 && <span className="chain__sep">→</span>}
                  <span className="chain__node">
                    <span
                      className="gantt-label__dot"
                      style={{ background: s.task.color, width: 8, height: 8 }}
                    />
                    {s.task.name}
                    <span className="badge badge--ghost">{s.pert.expected.toFixed(1)} hari (Te)</span>
                  </span>
                </span>
              ))}
            </div>
            {parallelCritical.length > 0 && (
              <p className="tiny muted" style={{ marginTop: 10 }}>
                {parallelCritical.length} tugas kritis lain berjalan paralel (mis. Start-to-Start)
                sehingga tidak ikut dijumlahkan agar durasi PERT tidak dihitung dua kali:{' '}
                {parallelCritical.map((s) => s.task.name).join(', ')}.
              </p>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 12,
                marginTop: 16,
              }}
            >
              <div className="pert-metric">
                <span className="pert-metric__label">Mulai paling awal</span>
                <span className="pert-metric__value" style={{ fontSize: 16 }}>
                  {formatLong(schedule.projectStart)}
                </span>
              </div>
              <div className="pert-metric">
                <span className="pert-metric__label">Selesai paling akhir</span>
                <span className="pert-metric__value" style={{ fontSize: 16 }}>
                  {formatLong(schedule.projectEnd)}
                </span>
              </div>
              <div className="pert-metric pert-metric--neon">
                <span className="pert-metric__label">
                  <Target size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                  Peluang selesai sesuai CPM
                </span>
                <span className="pert-metric__value">{onTimeProbability}%</span>
                <ProgressBar value={onTimeProbability} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ------------------ Diagram PERT ------------------ */}
      <div className="card">
        <div className="card__head">
          <span className="section-title">
            <GitBranch size={14} />
            Diagram Jaringan PERT
          </span>
          <span className="tiny muted" style={{ marginLeft: 'auto' }}>
            Kolom = kedalaman dependensi (kiri → kanan) · hanya tugas daun, fase induk jadi label
          </span>
        </div>

        <div className="pert-legend" role="group" aria-label="Legenda diagram PERT">
          {PERT_LEGEND.map((item) => (
            <span key={item.key} className="pert-legend__item" title={item.tooltip}>
              <span className="pert-legend__key">{item.key}</span>
              <span className="pert-legend__label">{item.label}</span>
            </span>
          ))}
          <span className="pert-legend__item" title="Node dan panah jalur kritis digambar kuning neon.">
            <span className="pert-legend__key pert-legend__key--neon">Neon</span>
            <span className="pert-legend__label">tugas &amp; panah kritis</span>
          </span>
        </div>

        <div className="pert-canvas">
          <div
            className="pert-flow"
            style={{ width: layout.width, height: layout.height }}
          >
            <svg
              className="pert-svg"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="pert-head"
                  viewBox="0 0 10 8"
                  markerWidth="10"
                  markerHeight="8"
                  refX="9"
                  refY="4"
                  orient="auto"
                >
                  <path className="pert-head__shape" d="M 0 0 L 10 4 L 0 8 z" />
                </marker>
                <marker
                  id="pert-head-critical"
                  viewBox="0 0 10 8"
                  markerWidth="10"
                  markerHeight="8"
                  refX="9"
                  refY="4"
                  orient="auto"
                >
                  <path className="pert-head__shape is-critical" d="M 0 0 L 10 4 L 0 8 z" />
                </marker>
              </defs>
              {links.map((l) => (
                <g key={l.id} className={l.critical ? 'is-critical' : ''}>
                  <title>{l.description}</title>
                  <path
                    className={`pert-link ${l.critical ? 'is-critical' : ''}`}
                    d={l.path}
                    strokeDasharray={l.type === 'SS' ? '5 4' : undefined}
                    markerEnd={`url(#${l.critical ? 'pert-head-critical' : 'pert-head'})`}
                  />
                  <rect
                    className={`pert-link__label-bg ${l.critical ? 'is-critical' : ''}`}
                    x={l.labelX - l.labelW / 2}
                    y={l.labelY - 8}
                    width={l.labelW}
                    height={16}
                    rx={5}
                  />
                  <text
                    className={`pert-link__label ${l.critical ? 'is-critical' : ''}`}
                    x={l.labelX}
                    y={l.labelY + 3.5}
                  >
                    {l.label}
                  </text>
                </g>
              ))}
            </svg>

            {leaves.map((s) => {
              const pos = layout.positions.get(s.task.id)
              if (!pos) return null
              const isCrit = s.isCritical
              const phase = s.task.parentId ? nameById.get(s.task.parentId) : undefined
              return (
                <div
                  key={s.task.id}
                  className={`pert-node ${isCrit ? 'is-critical' : ''}`}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: NODE_W,
                  }}
                  title={`${s.task.name} — ${formatLong(s.start)} s/d ${formatLong(s.end)}`}
                >
                  {phase && (
                    <div className="pert-node__phase" title={`Fase induk: ${phase}`}>
                      <Layers size={10} />
                      <span className="pert-node__phase-text">{phase}</span>
                    </div>
                  )}
                  <div className="pert-node__title">
                    <span
                      className="gantt-label__dot"
                      style={{ background: s.task.color, width: 9, height: 9 }}
                    />
                    <span className="pert-node__name">{s.task.name}</span>
                    {isCrit && <span className="badge badge--critical">CP</span>}
                  </div>
                  {/* Tanggal sebagai angka utama node. */}
                  <div className="pert-node__dates">
                    {formatLong(s.start)} → {formatLong(s.end)}
                  </div>
                  <div className="pert-node__days">
                    Hari ke-{s.esIndex + 1} s/d ke-{s.efIndex + 1}
                  </div>
                  <div className="pert-node__grid">
                    <span>
                      ES <b>Hari ke-{s.esIndex + 1}</b>
                    </span>
                    <span>
                      EF <b>Hari ke-{s.efIndex + 1}</b>
                    </span>
                    <span>
                      LS <b>Hari ke-{s.lsIndex + 1}</b>
                    </span>
                    <span>
                      LF <b>Hari ke-{s.lfIndex + 1}</b>
                    </span>
                    <span>
                      Float <b>{s.totalFloat} hari</b>
                    </span>
                    <span>
                      Te <b>{s.pert.expected.toFixed(1)} hari</b>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="tiny muted" style={{ marginTop: 12 }}>
          <Info size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          Node hanya berisi tugas daun — fase induk tidak dijadwalkan dari durasinya sendiri,
          melainkan gabungan dari sub-tugas (tanggal mulai = anak paling awal, selesai = anak paling
          akhir). Indeks ditulis sebagai <b>hari kerja ke-N</b> mulai dari 1. Float 0 (badge CP)
          berarti tugas berada di jalur kritis. Panah kuning neon menghubungkan tugas-tugas kritis;
          label panah menunjukkan jenis dependensi dan lag-nya.
        </p>
        {teBeyondCpm && (
          <p className="tiny" style={{ marginTop: 8, color: 'var(--text-2)' }}>
            <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            Ekspektasi PERT ({schedule.pertDuration.toFixed(1)} hari) lebih panjang dari durasi CPM (
            {schedule.durationWorkingDays} hari kerja). Ini wajar: Te adalah <b>nilai harapan</b> dari
            estimasi optimis–pesimis sepanjang satu rantai kritis, sedangkan CPM memakai durasi
            terjadwal yang pasti. Karena itu peluang selesai tepat sesuai CPM dihitung di bawah 50%.
          </p>
        )}
      </div>

      {/* ------------------ Tabel CPM ------------------ */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 0' }}>
          <span className="section-title">
            <BarChart3 size={14} />
            Tabel Penjadwalan CPM
          </span>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Fase induk tampil sebagai baris gabungan sub-tugas (badge “Fase”): tanggal, float, dan status
            kritisnya mengikuti sub-tugas, bukan durasinya sendiri.
          </p>
        </div>
        <div className="table-wrap" style={{ marginTop: 12, border: 'none', borderRadius: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Tugas</th>
                <th>Mulai</th>
                <th>Selesai</th>
                <th className="num">Durasi</th>
                <th className="num">ES (hari ke-)</th>
                <th className="num">EF (hari ke-)</th>
                <th className="num">LS (hari ke-)</th>
                <th className="num">LF (hari ke-)</th>
                <th className="num">Total Float</th>
                <th className="num">Free Float</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((s) => (
                <tr key={s.task.id} className={s.isCritical ? 'is-critical' : ''}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="gantt-label__dot"
                        style={{ background: s.task.color, width: 9, height: 9 }}
                      />
                      {s.level > 0 ? '↳ ' : ''}
                      {s.task.name}
                      {s.isParent && (
                        <span className="badge badge--ghost" title="Fase induk (gabungan sub-tugas)">
                          <Layers size={11} />
                          Fase
                        </span>
                      )}
                    </span>
                  </td>
                  <td>{formatLong(s.start)}</td>
                  <td>{formatLong(s.end)}</td>
                  <td className="num">{s.workingDays}</td>
                  <td className="num">{s.esIndex + 1}</td>
                  <td className="num">{s.efIndex + 1}</td>
                  <td className="num">{s.lsIndex + 1}</td>
                  <td className="num">{s.lfIndex + 1}</td>
                  <td className="num">{s.totalFloat}</td>
                  <td className="num">{s.freeFloat}</td>
                  <td>
                    {s.isCritical ? (
                      <span className="badge badge--critical">
                        <Flame size={11} />
                        {s.isParent ? 'Berisi kritis' : 'Kritis'}
                      </span>
                    ) : (
                      <span className="badge badge--ghost">Slack {s.totalFloat}h</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------ Tabel PERT ------------------ */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 0' }}>
          <span className="section-title">
            <Sigma size={14} />
            Estimasi PERT (3 Titik)
          </span>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Hanya tugas daun yang menjadi node PERT. Kolom “Pada Rantai Kritis” menandai tugas yang
            ikut dijumlahkan menjadi durasi PERT.
          </p>
        </div>
        <div className="table-wrap" style={{ marginTop: 12, border: 'none', borderRadius: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Tugas</th>
                <th className="num">Optimis (O)</th>
                <th className="num">Paling Mungkin (M)</th>
                <th className="num">Pesimis (P)</th>
                <th className="num">Durasi Harapan (Te)</th>
                <th className="num">Variansi</th>
                <th className="num">Std. Dev</th>
                <th>Pada Rantai Kritis</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((s) => (
                <tr key={s.task.id} className={s.isCritical ? 'is-critical' : ''}>
                  <td>{s.task.name}</td>
                  <td className="num">{s.pert.optimistic}</td>
                  <td className="num">{s.pert.mostLikely}</td>
                  <td className="num">{s.pert.pessimistic}</td>
                  <td className="num" style={{ color: 'var(--neon)', fontWeight: 700 }}>
                    {s.pert.expected.toFixed(2)}
                  </td>
                  <td className="num">{s.pert.variance.toFixed(2)}</td>
                  <td className="num">{Math.sqrt(s.pert.variance).toFixed(2)}</td>
                  <td>{chain.includes(s) ? 'Ya' : 'Tidak'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ padding: '12px 16px 16px' }}>
          Total Te rantai kritis = <b>{schedule.pertDuration.toFixed(2)} hari</b> · standar deviasi{' '}
          <b>{schedule.pertStdDev.toFixed(2)} hari</b> (variansi {chainVariance.toFixed(2)}).
        </p>
      </div>
    </>
  )
}
