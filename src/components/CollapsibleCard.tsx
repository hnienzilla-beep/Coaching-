import { useState, type ReactNode } from 'react'
import { Card } from './ui'

export default function CollapsibleCard({
  title,
  defaultExpanded = true,
  keepMounted = false,
  variant = 'card',
  storageKey,
  summary,
  children,
}: {
  title: string
  /** Auf-/Zugeklappt merken (localStorage) - beim nächsten Öffnen wie zuletzt. */
  storageKey?: string
  /** Kurze Vorschau neben dem Titel, sichtbar im zugeklappten Zustand. */
  summary?: ReactNode
  defaultExpanded?: boolean
  keepMounted?: boolean // true: Kinder bleiben gemountet (nur per CSS versteckt) - erhält Timer-State beim Einklappen
  variant?: 'card' | 'plain' // 'plain': schmale Kopfzeile ohne eigene Card, für bereits Card-gewrappte Kinder
  children: ReactNode
}) {
  const [expanded, setExpandedState] = useState(() => {
    if (!storageKey) return defaultExpanded
    try {
      const stored = localStorage.getItem(`coach.collapse.${storageKey}`)
      return stored === null ? defaultExpanded : stored === '1'
    } catch {
      return defaultExpanded
    }
  })
  function setExpanded(update: (v: boolean) => boolean) {
    setExpandedState((v) => {
      const next = update(v)
      if (storageKey) {
        try {
          localStorage.setItem(`coach.collapse.${storageKey}`, next ? '1' : '0')
        } catch {
          // Ohne Speicher gilt es eben nur für diese Sitzung.
        }
      }
      return next
    })
  }

  const header = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="flex w-full items-center justify-between text-left"
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <h2 className="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {!expanded && summary && <span className="truncate text-xs text-muted">{summary}</span>}
      </span>
      <span className={`text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
    </button>
  )

  const body = keepMounted ? (
    <div className={expanded ? 'flex flex-col gap-4' : 'hidden'}>{children}</div>
  ) : (
    expanded && <div className="flex flex-col gap-4">{children}</div>
  )

  if (variant === 'plain') {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-2.5">{header}</div>
        {body}
      </div>
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      {header}
      {body}
    </Card>
  )
}
