import { useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/30 ${className}`}>{children}</div>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  // iOS zeigt bei type="number" ohne inputMode manchmal keine Komma-/Punkt-Taste an -
  // "decimal" erzwingt die Zifferntastatur mit Dezimaltrennzeichen.
  const inputMode = props.type === 'number' ? (props.inputMode ?? 'decimal') : props.inputMode
  const input = (
    <input
      {...props}
      inputMode={inputMode}
      className={`w-full min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent ${props.className ?? ''}`}
    />
  )
  // Native type="date"-Widgets können auf manchen Geräten (v.a. iOS Safari, verstärkt
  // durch größere Systemschriftgröße) breiter rendern als der verfügbare Platz -
  // width/min-width auf dem Element selbst greifen dort nicht. Dieser Wrapper fängt den
  // Überschuss als horizontales Scrollen innerhalb der Box ab, statt über die Karte
  // hinauszuragen.
  if (props.type === 'date') {
    return <div className="w-full min-w-0 overflow-x-auto">{input}</div>
  }
  return input
}

// input type="number" akzeptiert nur einen Punkt als Trennzeichen - iOS zeigt bei
// deutscher Tastatur aber ein Komma an, das dann schlicht ignoriert wird. Deshalb hier
// type="text" mit eigenem Komma->Punkt-Handling und lokalem Text-State (damit "82,"
// beim Tippen nicht sofort wieder verschwindet, bevor die Nachkommastelle folgt).
export function DecimalInput({
  value,
  onChange,
  className = '',
  ...props
}: {
  value: number | undefined
  onChange: (n: number | undefined) => void
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(value !== undefined ? String(value) : '')

  useEffect(() => {
    const numeric = text === '' || text === '-' ? undefined : Number(text.replace(',', '.'))
    if (numeric !== value) {
      setText(value !== undefined ? String(value) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value
        if (!/^-?\d*[.,]?\d*$/.test(raw)) return
        setText(raw)
        const normalized = raw.replace(',', '.')
        onChange(normalized === '' || normalized === '-' ? undefined : Number(normalized))
      }}
      className={`w-full min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent ${className}`}
    />
  )
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent ${props.className ?? ''}`}
    >
      {children}
    </select>
  )
}

export function LabelText(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={`text-sm text-muted ${props.className ?? ''}`} />
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base = 'rounded-lg px-3 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-40 disabled:active:scale-100'
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-black hover:brightness-110',
    secondary: 'bg-surface-2 text-fg border border-border hover:border-accent',
    ghost: 'text-muted hover:text-fg',
    danger: 'bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20',
  }
  return <button {...props} className={`${base} ${variants[variant]} ${className}`} />
}

export function StatBadge({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'danger' }) {
  const toneClass = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-fg'
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-surface-2 px-3 py-2">
      <span className={`text-lg font-semibold ${toneClass}`}>{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  )
}
