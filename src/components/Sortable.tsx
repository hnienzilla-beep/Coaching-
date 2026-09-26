import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/**
 * Eine verschiebbare Zeile: `children` bekommt den Griff zum Einbauen. Beim Ziehen hebt sich die
 * Zeile an (Schatten, leicht größer), die anderen weichen weich aus.
 */
export function SortableItem({
  id,
  rounded = 'rounded-xl',
  children,
}: {
  id: string
  /** Rundung der Zeile - für den Rahmen beim Anheben. */
  rounded?: string
  children: (handle: ReactNode, dragging: boolean) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = <DragHandle ref={setActivatorNodeRef} attributes={attributes} listeners={listeners} />
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 30 : undefined,
      }}
    >
      <div
        className={`${rounded} transition-[transform,box-shadow] duration-200 ${
          isDragging ? 'scale-[1.03] shadow-2xl shadow-black/60 ring-2 ring-accent/60' : ''
        }`}
      >
        {children(handle, isDragging)}
      </div>
    </div>
  )
}

/**
 * Griff zum Verschieben - 44 px breit, damit er sich auf dem iPhone sicher treffen lässt.
 * `touch-none` und `data-no-swipe`: Weder Seiten-Scrollen noch Reiter-Wischen noch
 * Wegwischen der Zeile greifen hier.
 */
function DragHandle({
  ref,
  attributes,
  listeners,
}: {
  ref: (el: HTMLElement | null) => void
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
}) {
  return (
    <button
      ref={ref}
      type="button"
      {...attributes}
      {...listeners}
      data-no-swipe
      aria-label="Verschieben"
      className="-my-2 -ml-2 flex h-11 w-10 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-lg text-muted active:cursor-grabbing active:bg-fg/10"
    >
      <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
        <circle cx="4" cy="4" r="1.6" />
        <circle cx="10" cy="4" r="1.6" />
        <circle cx="4" cy="10" r="1.6" />
        <circle cx="10" cy="10" r="1.6" />
        <circle cx="4" cy="16" r="1.6" />
        <circle cx="10" cy="16" r="1.6" />
      </svg>
    </button>
  )
}
