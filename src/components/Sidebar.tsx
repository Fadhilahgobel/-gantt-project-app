import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GanttChartSquare,
  LayoutDashboard,
  ListChecks,
  Users,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ViewKey } from '../types'

export interface NavItem {
  key: ViewKey
  label: string
  icon: ReactNode
  hint: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    hint: 'Ringkasan',
    icon: <LayoutDashboard size={19} />,
  },
  { key: 'gantt', label: 'Gantt', hint: 'Timeline', icon: <GanttChartSquare size={19} /> },
  { key: 'tasks', label: 'Tugas', hint: 'Kelola', icon: <ListChecks size={19} /> },
  { key: 'team', label: 'Tim', hint: 'Resource', icon: <Users size={19} /> },
  { key: 'calendar', label: 'Kalender', hint: 'Hari kerja', icon: <CalendarDays size={19} /> },
  { key: 'analysis', label: 'Analisis', hint: 'CPM & PERT', icon: <Activity size={19} /> },
]

export function Sidebar({
  view,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  badges,
}: {
  view: ViewKey
  onNavigate: (v: ViewKey) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  badges: Partial<Record<ViewKey, number>>
}) {
  return (
    <aside className="sidebar" aria-label="Bilah samping">
      <div className="brand">
        <span className="brand__mark" aria-hidden>
          <Zap size={21} fill="currentColor" />
        </span>
        <div className="brand__text">
          <div className="brand__title">KILAT PM</div>
          <div className="brand__sub">Gantt & Resource Planner</div>
        </div>
      </div>

      <nav className="nav" aria-label="Navigasi utama">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav__item ${view === item.key ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.key)}
            aria-current={view === item.key ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            <span className="nav__label">{item.label}</span>
            {badges[item.key] !== undefined && (
              <span className="nav__badge">{badges[item.key]}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button type="button" className="collapse-btn" onClick={onToggleCollapsed}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          <span className="collapse-btn__label">Sembunyikan</span>
        </button>
      </div>
    </aside>
  )
}
