import { useEffect, useRef, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Ban,
  CircleDashed,
  Clock,
  Loader,
  X,
} from 'lucide-react'
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type TaskStatus } from '../types'

/* ------------------------------------------------------------ Modal */
export function Modal({
  title,
  icon,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'wide'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal ${size === 'sm' ? 'modal--sm' : size === 'wide' ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal__head">
          {icon && (
            <span className="stat__icon" aria-hidden>
              {icon}
            </span>
          )}
          <h3>{title}</h3>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Avatar */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

const AVATAR_COLORS = ['#DFFF00', '#FFE600', '#58C4FF', '#35D07F', '#FF8A65', '#B388FF', '#FF5566']

export function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      title={name}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${avatarColor(name)}, ${avatarColor(name + name.length)})`,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initialsOf(name)}
    </span>
  )
}

export function AvatarStack({ names, size = 26 }: { names: string[]; size?: number }) {
  if (names.length === 0) {
    return <span className="tiny muted">—</span>
  }
  return (
    <span className="avatar-stack">
      {names.slice(0, 4).map((n) => (
        <Avatar key={n} name={n} size={size} />
      ))}
      {names.length > 4 && (
        <span className="avatar" style={{ width: size, height: size, background: '#3a4149', color: '#fff' }}>
          +{names.length - 4}
        </span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------ Badges */
const PRIORITY_ICON: Record<Priority, ReactNode> = {
  high: <ArrowUp size={12} />,
  medium: <ArrowRight size={12} />,
  low: <ArrowDown size={12} />,
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`badge badge--${priority}`}>
      {PRIORITY_ICON[priority]}
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

const STATUS_ICON: Record<TaskStatus, ReactNode> = {
  todo: <CircleDashed size={12} />,
  'in-progress': <Loader size={12} />,
  blocked: <Ban size={12} />,
  done: <Clock size={12} />,
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge badge--${status}`}>
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </span>
  )
}

/* ------------------------------------------------------------ Progress */
export function ProgressBar({
  value,
  height = 9,
}: {
  value: number
  height?: number
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      className="progress"
      style={{ height }}
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="progress__fill"
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------ Stat card */
export function StatCard({
  icon,
  label,
  value,
  suffix,
  hint,
  accent = false,
  onClick,
  ctaLabel,
  children,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  suffix?: string
  hint?: string
  accent?: boolean
  /** Bila diisi, kartu menjadi tombol yang membuka halaman terkait. */
  onClick?: () => void
  ctaLabel?: string
  children?: ReactNode
}) {
  const body = (
    <>
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        <span className="stat__icons">
          {onClick && <ArrowUpRight className="stat__cta" size={15} aria-hidden />}
          <span className="stat__icon" aria-hidden>
            {icon}
          </span>
        </span>
      </div>
      <div className="stat__value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      {children}
      {hint && <div className="stat__hint">{hint}</div>}
    </>
  )

  const className = `card card--hover stat ${accent ? 'stat--accent' : ''}`

  if (!onClick) {
    return <div className={className}>{body}</div>
  }

  return (
    <button
      type="button"
      className={`${className} stat--clickable`}
      onClick={onClick}
      aria-label={ctaLabel ?? `Buka halaman terkait: ${label}`}
      title={ctaLabel ?? `Buka halaman terkait: ${label}`}
    >
      {body}
    </button>
  )
}

/* ------------------------------------------------------------ Empty state */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------ Tooltip */
export interface TooltipState {
  x: number
  y: number
  content: ReactNode
}

export function Tooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null
  const style = {
    left: Math.min(state.x + 14, window.innerWidth - 280),
    top: Math.min(state.y + 16, window.innerHeight - 150),
  }
  return (
    <div className="tooltip" style={style} role="tooltip">
      {state.content}
    </div>
  )
}
