import type { ReactNode } from 'react'

type Item = { name?: ReactNode; value?: unknown; color?: string; stroke?: string; payload?: unknown; dataKey?: unknown }

/**
 * Wert-Blase für Diagramme: folgt beim Ziehen mit dem Finger der senkrechten Linie und zeigt
 * Datum und Werte. `format` bekommt Wert, Name und die Datenzeile.
 */
export default function ChartBubble({
  active,
  payload,
  label,
  format = (v) => (typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : String(v)),
  labelFormat = (l) => l,
}: {
  active?: boolean
  payload?: Item[]
  label?: string | number
  format?: (value: unknown, name: string, row: Record<string, unknown>) => ReactNode
  labelFormat?: (label: string) => ReactNode
}) {
  const items = (payload ?? []).filter((p) => p.value !== undefined && p.value !== null && (p.stroke ?? p.color) !== 'transparent')
  const all = payload ?? []
  if (!active || all.length === 0) return null
  // Auch Punkte ohne sichtbare Linie (z.B. KFA-Messungen) zeigen - aber nur, wenn sonst nichts da ist.
  const shown = items.length ? items : all.filter((p) => p.value !== undefined && p.value !== null)
  if (shown.length === 0) return null
  return (
    <div className="anim-pop pointer-events-none rounded-xl border border-border bg-surface/95 px-2.5 py-1.5 text-xs shadow-xl shadow-black/40 backdrop-blur">
      <p className="mb-0.5 font-semibold text-fg">{labelFormat(String(label ?? ''))}</p>
      {shown.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 tabular-nums text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.stroke && p.stroke !== 'transparent' ? p.stroke : (p.color ?? 'var(--color-accent)') }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-2 font-medium text-fg">{format(p.value, String(p.name ?? ''), (p.payload ?? {}) as Record<string, unknown>)}</span>
        </p>
      ))}
    </div>
  )
}

