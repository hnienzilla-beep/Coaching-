import { useEffect, useRef, type ReactNode } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDragSensors } from '../lib/dragSensors'
import { Button, Card } from './ui'

export interface PlanPhaseOption {
  id: string
  phaseName: string
  count?: number // gefüllte Zeilen der Phase - als Zahl am Chip, als Text in der Sortierliste
}

/**
 * Gemeinsamer Kopf aller drei Plan-Ansichten - das Gegenstück zu LogDayHeader: welcher Plan,
 * was steht drin, und der Wechsel zu einer anderen Phase. Vorher war das über die Seiten
 * verteilt (Pill-Leiste oben, Namensfeld und "Phase löschen" erst im Bearbeiten-Card).
 *
 * Die Phasen-Übersicht hat zwei Gestalten: zum Umschalten eine schmale Chip-Leiste mit der
 * Zahl der Einträge je Phase, im Bearbeiten-Modus stattdessen eine Liste mit Zuggriffen. Die
 * Chips wären zwar der kürzere Weg, aber ein waagerecht scrollender Streifen und Drag & Drop
 * vertragen sich auf dem Touchscreen nicht: Beide Gesten sind dieselbe Wischbewegung.
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
  onReorder,
  deleteConfirmText,
  subtitle,
  countLabel,
  phaseNoun = 'Phase',
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
  onReorder?: (orderedIds: string[]) => void // fehlt: Phasen lassen sich nicht umsortieren
  deleteConfirmText?: string
  subtitle?: string
  countLabel?: (count: number) => string // z.B. (n) => "3 Übungen"
  phaseNoun?: string // "Phase 2 von 4" bzw. "Tag 2 von 4"
  editing?: boolean
  actions?: ReactNode // "Bearbeiten" bzw. "Fertig" - die Seiten unterscheiden sich darin, was der Knopf tut
  children?: ReactNode
}) {
  const sensors = useDragSensors()
  const chipRowRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef(new Map<string, HTMLButtonElement>())

  const activeIndex = phases.findIndex((p) => p.id === activePhaseId)
  const active = activeIndex === -1 ? undefined : phases[activeIndex]
  const sorting = editing && !!onReorder && phases.length > 1

  // Die aktive Phase in den sichtbaren Ausschnitt holen: bei mehreren Phasen liegt sie sonst
  // hinter dem rechten Rand, sobald sie über die Sortierliste oder einen Import gewechselt
  // wurde. scrollIntoView wird bewusst nicht benutzt - es zieht auf iOS auch die Seite mit.
  useEffect(() => {
    const row = chipRowRef.current
    const chip = activePhaseId ? chipRefs.current.get(activePhaseId) : undefined
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return
    row.scrollTo({ left: Math.max(0, chip.offsetLeft - (row.clientWidth - chip.clientWidth) / 2), behavior: 'smooth' })
  }, [activePhaseId, phases.length])

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event
    if (!over || dragged.id === over.id || !onReorder) return
    const oldIndex = phases.findIndex((p) => p.id === dragged.id)
    const newIndex = phases.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(phases, oldIndex, newIndex).map((p) => p.id))
  }

  const meta = [
    phases.length > 1 && active ? `${phaseNoun} ${activeIndex + 1} von ${phases.length}` : null,
    subtitle,
  ]
    .filter(Boolean)
    .join(' · ')

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
          {meta && <p className="truncate text-xs text-muted">{meta}</p>}
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

      {sorting ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted">Am Griff ⠿ ziehen, um die Reihenfolge zu ändern.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1.5">
                {phases.map((p) => (
                  <SortablePhaseRow
                    key={p.id}
                    phase={p}
                    active={p.id === activePhaseId}
                    countLabel={countLabel}
                    onSelect={() => onSelect(p.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {onAdd && (
            <button
              onClick={onAdd}
              className="rounded-xl border border-dashed border-border py-2 text-sm text-muted transition active:scale-95 hover:text-fg"
            >
              {addLabel}
            </button>
          )}
        </div>
      ) : (
        // Negativer Rand plus Polster: der Ring der aktiven Phase steht über den Chip hinaus
        // und würde am Rand der Karte sonst abgeschnitten.
        <div ref={chipRowRef} className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {phases.map((p) => {
            const isActive = p.id === activePhaseId
            return (
              <button
                key={p.id}
                ref={(el) => {
                  if (el) chipRefs.current.set(p.id, el)
                  else chipRefs.current.delete(p.id)
                }}
                onClick={() => onSelect(p.id)}
                aria-pressed={isActive}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition active:scale-95 ${
                  isActive
                    ? 'bg-accent font-medium text-accent-fg ring-2 ring-accent/30'
                    : 'border border-border bg-surface-2 text-muted hover:text-fg'
                }`}
              >
                <span className="whitespace-nowrap">{p.phaseName}</span>
                {/* Nur gefüllte Phasen bekommen eine Zahl - eine "0" am Chip wäre nur Lärm.
                    Deckkraft statt eigener Farbe: der Chip wechselt zwischen Akzent- und
                    Flächenhintergrund, eine feste Textfarbe wäre auf einem davon unlesbar. */}
                {!!p.count && <span className="tabular-nums text-[11px] opacity-70">{p.count}</span>}
              </button>
            )
          })}
          {onAdd && (
            <button
              onClick={onAdd}
              className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted transition active:scale-95 hover:text-fg"
            >
              {addLabel}
            </button>
          )}
        </div>
      )}

      {children}
    </Card>
  )
}

function SortablePhaseRow({
  phase,
  active,
  countLabel,
  onSelect,
}: {
  phase: PlanPhaseOption
  active: boolean
  countLabel?: (count: number) => string
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-2 rounded-xl border bg-surface-2 px-1 py-1.5 ${active ? 'border-accent' : 'border-border'}`}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="shrink-0 touch-none px-1 text-lg text-muted"
        aria-label={`${phase.phaseName} verschieben`}
      >
        ⠿
      </button>
      <button type="button" onClick={onSelect} aria-pressed={active} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-semibold text-fg">{phase.phaseName}</span>
        {phase.count !== undefined && (
          <span className="truncate text-xs text-muted">{countLabel ? countLabel(phase.count) : phase.count}</span>
        )}
      </button>
      {active && <span className="shrink-0 pr-2 text-[11px] uppercase tracking-wide text-muted">aktiv</span>}
    </div>
  )
}
