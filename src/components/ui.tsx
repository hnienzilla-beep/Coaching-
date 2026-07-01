import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/30 ${className}`}>{children}</div>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  // iOS zeigt bei type="number" ohne inputMode manchmal keine Komma-/Punkt-Taste an -
  // "decimal" erzwingt die Zifferntastatur mit Dezimaltrennzeichen.
  const inputMode = props.type === 'number' ? (props.inputMode ?? 'decimal') : props.inputMode
  return (
    <input
      {...props}
      inputMode={inputMode}
      className={`rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent ${props.className ?? ''}`}
    />
  )
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent ${props.className ?? ''}`}
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
    secondary: 'bg-surface-2 text-zinc-100 border border-border hover:border-accent',
    ghost: 'text-muted hover:text-zinc-100',
    danger: 'bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20',
  }
  return <button {...props} className={`${base} ${variants[variant]} ${className}`} />
}

export function StatBadge({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'danger' }) {
  const toneClass = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-zinc-100'
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-surface-2 px-3 py-2">
      <span className={`text-lg font-semibold ${toneClass}`}>{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  )
}
