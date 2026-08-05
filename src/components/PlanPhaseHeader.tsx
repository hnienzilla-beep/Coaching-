import type { ReactNode } from 'react'
import { Button, Card } from './ui'

export interface PlanPhaseOption {
  id: string
  phaseName: string
}

/**
 * Gemeinsamer Kopf aller drei Plan-Ansichten - das Gegenstück zu LogDayHeader: welcher Plan,
 * was steht drin, und der Wechsel zu einer anderen Phase. Vorher war das über die Seiten
 * verteilt (Pill-Leiste oben, Namensfeld und "Phase löschen" erst im Bearbeiten-Card).
 */
export default function PlanPhaseHeader({
  title,
  phases,
  activePhaseId,
  onSelect,
  onAdd,
  addLabel = '+ Phase',
  onRename,
  onDelete,
  deleteConfirmText,
  subtitle,
  editing = false,
  actions,
  children,
}: {
  title: string
  phases: PlanPhaseOption[]
  activePhaseId: string | null
  onSelect: (id: string) => void
  onAdd?: () => void
  addLabel?: string
  onRename?: (name: string) => void
  onDelete?: () => void
  deleteConfirmText?: string
  subtitle?: string
  editing?: boolean
  actions?: ReactNode // "Bearbeiten" bzw. "Fertig" - die Seiten unterscheiden sich darin, was der Knopf tut
  children?: ReactNode
}) {
  const active = phases.find((p) => p.id === activePhaseId)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {editing && onRename && active ? (
            <input
              value={active.phaseName}
              onChange={(e) => onRename(e.target.value)}
              aria-label="Name der Phase"
              className="w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-1 text-base font-semibold text-fg outline-none focus:border-accent"
            />
          ) : (
            <p className="truncate text-base font-semibold text-fg">{active?.phaseName ?? 'Keine Phase angelegt'}</p>
          )}
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {editing && onDelete && (
            <Button
              variant="ghost"
              aria-label="Phase löschen"
              onClick={() => {
                if (window.confirm(deleteConfirmText ?? 'Diese Phase wirklich löschen?')) onDelete()
              }}
            >
              🗑
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {phases.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              p.id === activePhaseId ? 'bg-accent text-accent-fg font-medium' : 'bg-surface-2 text-muted'
            }`}
          >
            {p.phaseName}
          </button>
        ))}
        {onAdd && (
          <button onClick={onAdd} className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted">
            {addLabel}
          </button>
        )}
      </div>

      {children}
    </Card>
  )
}
