import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Bottom-Sheet für Formulare und Auswahlen. Ersetzt die in Listen aufklappenden Formulare:
 * Die Liste bleibt ruhig und einzeilig, bearbeitet wird in einer eigenen Fläche, die sich
 * mit Wischen/Tippen daneben oder Escape wieder schließt.
 *
 * Per Portal an `document.body`, weil `#root` fixiert ist und seine Scroll-Container sonst
 * das Sheet beschneiden würden.
 */
export default function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  tall = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Feste Höhe statt mitwachsend - für Suchen, damit das Sheet beim Laden nicht springt. */
  tall?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Schließen" onClick={onClose} className="anim-backdrop absolute inset-0 bg-black/60" />
      <div className={`anim-sheet relative flex w-full ${tall ? 'h-[85dvh]' : 'max-h-[88dvh]'} max-w-md flex-col rounded-t-2xl border border-b-0 border-border bg-surface shadow-2xl`}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="truncate text-base font-semibold text-fg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Schließen" className="-mr-1 px-2 py-1 text-lg text-muted hover:text-fg">
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        {footer && (
          <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  )
}
