import type { ReactNode } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { RotateCcw } from 'lucide-react'
import { useDragSensors, verticalOnly } from '../lib/dragSensors'
import { sortByOrder } from '../lib/prefs'
import { SortableItem } from './Sortable'

/** Gruppe mit Überschrift - eine abgerundete Fläche mit Zeilen. */
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="reveal flex flex-col gap-1.5">
      {title && <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>}
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">{children}</div>
      {footer && <p className="px-1 text-[11px] text-muted">{footer}</p>}
    </section>
  )
}

/** Schalter-Zeile. */
export function Toggle({ label, hint, on, onChange, leading }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void; leading?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-fg">{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-border'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

/** Auswahl aus wenigen Werten als Knöpfe nebeneinander. */
export function Choice<T extends string | number>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint?: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <span className="text-sm text-fg">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${value === o.value ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Sortierbare Liste mit Schalter je Eintrag (Reiter, Dashboard-Karten). */
export function SortableToggles<T extends string>({
  items,
  order,
  hidden,
  onOrder,
  onToggle,
  locked = [],
}: {
  items: readonly { id: T; label: string; hint?: string }[]
  order: T[]
  hidden: T[]
  onOrder: (order: T[]) => void
  onToggle: (id: T, on: boolean) => void
  /** Einträge, die sich nicht ausschalten lassen. */
  locked?: T[]
}) {
  const sensors = useDragSensors()
  const sorted = sortByOrder(items, order)
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const ids = sorted.map((i) => i.id)
    onOrder(arrayMove(ids, ids.indexOf(e.active.id as T), ids.indexOf(e.over.id as T)))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={onDragEnd}>
      <SortableContext items={sorted.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {sorted.map((item) => (
          <SortableItem key={item.id} id={item.id} rounded="rounded-none">
            {(handle) => (
              <div className="flex items-center bg-surface pl-3">
                {handle}
                <div className="min-w-0 flex-1">
                  {locked.includes(item.id) ? (
                    <div className="px-3 py-2.5">
                      <span className="block text-sm text-fg">{item.label}</span>
                      <span className="block text-xs text-muted">Immer sichtbar</span>
                    </div>
                  ) : (
                    <Toggle label={item.label} hint={item.hint} on={!hidden.includes(item.id)} onChange={(on) => onToggle(item.id, on)} />
                  )}
                </div>
              </div>
            )}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}

export function ResetButton({ label = 'Auf Standard zurücksetzen', onReset }: { label?: string; onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(`${label}?`)) onReset()
      }}
      className="flex items-center justify-center gap-1.5 self-center rounded-full px-4 py-2 text-sm text-muted transition hover:text-danger active:scale-95"
    >
      <RotateCcw size={14} /> {label}
    </button>
  )
}
