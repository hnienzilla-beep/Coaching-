import { useState, type ReactNode } from 'react'
import { Card } from './ui'

export default function CollapsibleCard({
  title,
  headerExtra,
  defaultExpanded = true,
  keepMounted = false,
  variant = 'card',
  children,
}: {
  title: string
  headerExtra?: ReactNode // zusätzlicher Inhalt rechts neben dem Titel, vor dem Chevron (z.B. eine Summenzeile)
  defaultExpanded?: boolean
  keepMounted?: boolean // true: Kinder bleiben gemountet (nur per CSS versteckt) - erhält Timer-State beim Einklappen
  variant?: 'card' | 'plain' // 'plain': schmale Kopfzeile ohne eigene Card, für bereits Card-gewrappte Kinder
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const header = (
    <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex w-full flex-col gap-0.5 text-left">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        <span className={`text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </div>
      {headerExtra}
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
