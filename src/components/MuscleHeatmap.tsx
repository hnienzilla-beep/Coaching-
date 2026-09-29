import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addDays, todayIso } from '../db/queries'
import { HEAT_GROUPS, heatLevel, setsPerGroup, volumeVerdict, WEEKLY_SET_TARGET, type HeatGroup } from '../lib/muscleVolume'
import type { MuscleGroup } from '../models/types'

/** Füllfarbe je nach Wochenvolumen: von der Kartenfarbe bis zur vollen Akzentfarbe. */
function fill(level: number): string {
  if (level <= 0) return 'var(--color-surface-2)'
  const pct = Math.round(18 + level * 82)
  return `color-mix(in srgb, var(--color-accent) ${pct}%, var(--color-surface-2))`
}

type Shape = { d?: string; ellipse?: [number, number, number, number]; group: HeatGroup }

// Stilisierte Figur (Vorder- und Rückseite), je 100 × 200. Formen grob, aber klar zuordenbar.
const FRONT: Shape[] = [
  { group: 'Schultern', ellipse: [29, 47, 8.5, 7] },
  { group: 'Schultern', ellipse: [71, 47, 8.5, 7] },
  { group: 'Brust', d: 'M37 42 Q49 40 49.2 44 L49.2 60 Q42 65 35.5 58 Q34 48 37 42 Z' },
  { group: 'Brust', d: 'M63 42 Q51 40 50.8 44 L50.8 60 Q58 65 64.5 58 Q66 48 63 42 Z' },
  { group: 'Bauch', d: 'M40 64 Q50 61 60 64 L59 97 Q50 101 41 97 Z' },
  { group: 'Arme', ellipse: [23.5, 65, 5, 11] },
  { group: 'Arme', ellipse: [76.5, 65, 5, 11] },
  { group: 'Arme', ellipse: [20.5, 89, 4, 11] },
  { group: 'Arme', ellipse: [79.5, 89, 4, 11] },
  { group: 'Beine', ellipse: [42, 128, 8, 23] },
  { group: 'Beine', ellipse: [58, 128, 8, 23] },
  { group: 'Beine', ellipse: [41.5, 170, 5.5, 15] },
  { group: 'Beine', ellipse: [58.5, 170, 5.5, 15] },
]
const BACK: Shape[] = [
  { group: 'Schultern', ellipse: [29, 47, 8.5, 7] },
  { group: 'Schultern', ellipse: [71, 47, 8.5, 7] },
  { group: 'Rücken', d: 'M38 40 Q50 34 62 40 L64 58 Q58 84 50 92 Q42 84 36 58 Z' },
  { group: 'Bauch', d: 'M42 86 Q50 94 58 86 L58 98 Q50 101 42 98 Z' },
  { group: 'Arme', ellipse: [23.5, 65, 5, 11] },
  { group: 'Arme', ellipse: [76.5, 65, 5, 11] },
  { group: 'Arme', ellipse: [20.5, 89, 4, 11] },
  { group: 'Arme', ellipse: [79.5, 89, 4, 11] },
  { group: 'Beine', ellipse: [43, 108, 8, 8] },
  { group: 'Beine', ellipse: [57, 108, 8, 8] },
  { group: 'Beine', ellipse: [42, 135, 7.5, 19] },
  { group: 'Beine', ellipse: [58, 135, 7.5, 19] },
  { group: 'Beine', ellipse: [41.5, 171, 5.5, 14] },
  { group: 'Beine', ellipse: [58.5, 171, 5.5, 14] },
]

function Figure({ shapes, sets, label }: { shapes: Shape[]; sets: Record<HeatGroup, number>; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 200" className="h-56 w-auto" role="img" aria-label={`Muskel-Heatmap ${label}`}>
        {/* Silhouette */}
        <g fill="var(--color-bg)" stroke="var(--color-border)" strokeWidth="1">
          <circle cx="50" cy="17" r="10" />
          <path d="M44 26 L56 26 L57 34 L43 34 Z" />
          <path d="M33 38 Q50 32 67 38 L81 52 L86 100 L76 101 L72 74 L66 104 L67 188 L52 190 L50 140 L48 190 L33 188 L34 104 L28 74 L24 101 L14 100 L19 52 Z" />
        </g>
        {shapes.map((s, i) => {
          const level = heatLevel(sets[s.group])
          const common = {
            fill: fill(level),
            stroke: 'var(--color-border)',
            strokeWidth: 0.6,
            className: `transition-[fill] duration-700 ${level >= 0.85 ? 'muscle-glow' : ''}`,
          }
          return s.ellipse ? (
            <ellipse key={i} cx={s.ellipse[0]} cy={s.ellipse[1]} rx={s.ellipse[2]} ry={s.ellipse[3]} {...common} />
          ) : (
            <path key={i} d={s.d} {...common} />
          )
        })}
      </svg>
      <figcaption className="text-[11px] text-muted">{label}</figcaption>
    </figure>
  )
}

/**
 * Welche Muskeln hast du in den letzten 7 Tagen trainiert? Erledigte Sätze je Muskelgruppe,
 * auf einer Körper-Silhouette - je mehr, desto stärker leuchtet die Stelle. Ab etwa zwölf Sätzen
 * pro Woche gilt eine Gruppe als voll versorgt.
 */
export default function MuscleHeatmap({ athleteId }: { athleteId: string }) {
  const groups = useLiveQuery(async () => {
    const since = addDays(todayIso(), -6)
    const logs = await db.workoutLogs.where('athleteId').equals(athleteId).filter((l) => l.date >= since).toArray()
    if (logs.length === 0) return [] as MuscleGroup[]
    const logExercises = await db.workoutLogExercises.where('workoutLogId').anyOf(logs.map((l) => l.id)).toArray()
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e.muscleGroup]))
    const groupByLogExercise = new Map(logExercises.map((le) => [le.id, exercises.get(le.exerciseId)]))
    const done = await db.workoutSets.where('workoutLogExerciseId').anyOf(logExercises.map((le) => le.id)).filter((s) => !!s.done).toArray()
    return done.map((s) => groupByLogExercise.get(s.workoutLogExerciseId)).filter((g): g is MuscleGroup => !!g)
  }, [athleteId])

  const sets = setsPerGroup(groups ?? [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center gap-4">
        <Figure shapes={FRONT} sets={sets} label="Vorne" />
        <Figure shapes={BACK} sets={sets} label="Hinten" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {HEAT_GROUPS.map((g) => (
          <div key={g} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" style={{ background: fill(heatLevel(sets[g])) }} />
            <span className="text-fg">{g}</span>
            <span className="tabular-nums text-muted">{sets[g].toLocaleString('de-DE', { maximumFractionDigits: 1 })}</span>
            <span className="truncate text-[11px] text-muted">· {volumeVerdict(sets[g])}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        Erledigte Sätze der letzten 7 Tage. Richtwert für Muskelaufbau: etwa {WEEKLY_SET_TARGET}–20 Sätze pro Gruppe und Woche.
      </p>
    </div>
  )
}
