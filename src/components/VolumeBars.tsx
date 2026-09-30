import { LANDMARKS, type VolumeMuscle } from '../lib/trainingPlan'

/**
 * Wochenvolumen je Muskel als Balken mit den Zonen MV (rot), MEV (gelb), MAV (grün) und MRV
 * (dunkelgrün). Der Strich zeigt den Wert, das Dreieck (falls gesetzt) das Ziel.
 */
export default function VolumeBars({ rows }: { rows: { muscle: VolumeMuscle; value: number; target?: number }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ muscle, value, target }) => {
        const l = LANDMARKS[muscle]
        const max = Math.max(l.mrv + 4, value + 2)
        const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`
        const zones = [
          { from: l.mv, to: l.mev, color: 'bg-red-500/50' },
          { from: l.mev, to: l.mavLo, color: 'bg-yellow-400/50' },
          { from: l.mavLo, to: l.mavHi, color: 'bg-green-500/55' },
          { from: l.mavHi, to: l.mrv, color: 'bg-green-500/30' },
          { from: l.mrv, to: max, color: 'bg-green-900/60' },
        ].filter((z) => z.to > z.from)
        return (
          <div key={muscle} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-fg">{muscle}</span>
              <span className="tabular-nums text-muted">
                {value.toLocaleString('de-DE')} Sätze{target !== undefined ? ` · Ziel ${target}` : ''}
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-surface">
              {zones.map((z) => (
                <div key={z.from} className={`absolute inset-y-0 ${z.color}`} style={{ left: pct(z.from), width: `calc(${pct(z.to)} - ${pct(z.from)})` }} />
              ))}
              <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded bg-fg" style={{ left: pct(value) }} />
              {target !== undefined && target > 0 && <div className="absolute -top-px h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-accent" style={{ left: pct(target) }} />}
            </div>
          </div>
        )
      })}
      <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] text-muted">
        <Legend color="bg-red-500/50" label="MV Erhalt" />
        <Legend color="bg-yellow-400/50" label="MEV Minimum" />
        <Legend color="bg-green-500/55" label="MAV optimal" />
        <Legend color="bg-green-900/60" label="MRV Grenze" />
      </p>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-sm ${color}`} /> {label}
    </span>
  )
}
