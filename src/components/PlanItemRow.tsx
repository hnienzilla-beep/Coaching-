import type { ReactNode } from 'react'

/**
 * Eine Zeile einer Plan- oder Log-Liste: eingeklappt nur Name und Zusammenfassung, das
 * Bearbeitungsformular erscheint erst beim Antippen. Genau die Anatomie, die die beiden Logs
 * schon benutzen - die Plan-Seiten hatten stattdessen jede Zeile dauerhaft aufgeklappt.
 */
export default function PlanItemRow({
  title,
  subtitle,
  imageDataUrl,
  expanded,
  onToggle,
  dragHandle,
  onDelete,
  deleteLabel,
  tone = 'default',
  children,
}: {
  title: string
  subtitle?: string
  imageDataUrl?: string
  expanded: boolean
  onToggle: () => void
  dragHandle?: ReactNode
  onDelete?: () => void
  deleteLabel?: string
  tone?: 'default' | 'ok'
  children?: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-2 ${tone === 'ok' ? 'border-ok/40' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        {dragHandle}
        {imageDataUrl && <img src={imageDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{title}</span>
            {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
          </span>
          <span className={`shrink-0 text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={deleteLabel ?? 'Eintrag entfernen'}
            className="shrink-0 px-1 py-2 text-sm text-muted hover:text-danger"
          >
            🗑
          </button>
        )}
      </div>

      {expanded && children && <div className="flex flex-col gap-2 border-t border-border pt-2">{children}</div>}
    </div>
  )
}
