import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Check, Info } from 'lucide-react'
import { db } from '../db/db'
import type { Athlete } from '../models/types'
import { MUSCLE_ORDER, defaultZone, pauseWarnings, planFrequencies, planVolume, volumeStatus, zoneRange } from '../lib/planVolume'
import { LANDMARKS, type VolumeMuscle, type Zone } from '../lib/trainingPlan'
import type { StartAnswers } from '../lib/startPlan'
import CollapsibleCard from './CollapsibleCard'
import Sheet from './Sheet'

const ZONES: Zone[] = ['MV', 'MEV', 'MAV', 'MRV']
const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })

/**
 * Wochenvolumen des Trainingsplans: Sätze je Muskel pro Woche gegen die gewählte Zone
 * (MV/MEV/MAV/MRV). Antippen eines Muskels: Zone wählen und sehen, welche Übungen beitragen.
 */
export default function PlanVolumeCard({ athlete }: { athlete: Athlete }) {
  const data = useLiveQuery(async () => {
    const plans = await db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order')
    const rows = await db.trainingPlanExercises.where('planId').anyOf(plans.map((p) => p.id)).toArray()
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    return { plans, rows, exercises }
  }, [athlete.id])
  const [detail, setDetail] = useState<VolumeMuscle | null>(null)
  const [info, setInfo] = useState(false)
  if (!data || data.plans.length === 0) return null

  const answers = (athlete.startAnswers ?? {}) as Partial<StartAnswers>
  const zones = answers.volumeZones ?? {}
  const zoneOf = (m: VolumeMuscle): Zone => zones[m] ?? defaultZone(answers.goal)
  const freq = planFrequencies(athlete, data.plans)
  const vol = planVolume(data.plans, data.rows, data.exercises, freq)
  const warnings = pauseWarnings(athlete, data.plans, vol.perPlan)

  async function setZone(m: VolumeMuscle, zone: Zone | null) {
    const next = { ...zones }
    if (zone) next[m] = zone
    else delete next[m]
    // Gemeinsam mit „Dein Start“: die Zonen liegen bei den gespeicherten Antworten.
    await db.athletes.update(athlete.id, { startAnswers: { ...answers, volumeZones: next } })
  }

  return (
    <CollapsibleCard title="Wochenvolumen" storageKey="volume-plan">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>Sätze je Muskel pro Woche · antippen zum Einstellen</span>
          <button type="button" onClick={() => setInfo((v) => !v)} aria-label="Erklärung" aria-expanded={info} className="text-muted">
            <Info size={15} />
          </button>
        </div>
        {info && (
          <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
            <b className="text-fg">MV</b> Erhalt – so viel braucht der Muskel, um nicht abzubauen. <b className="text-fg">MEV</b> Minimum für Wachstum.{' '}
            <b className="text-fg">MAV</b> Bereich mit dem meisten Wachstum. <b className="text-fg">MRV</b> Obergrenze – mehr kann der Körper kaum erholen.
            Mitarbeitende Muskeln zählen halb, Aufwärmsätze nicht.
          </p>
        )}
        {MUSCLE_ORDER.map((m) => (
          <MuscleRow key={m} muscle={m} sets={vol.weekly.get(m) ?? 0} zone={zoneOf(m)} own={zones[m] !== undefined} onOpen={() => setDetail(m)} />
        ))}
        <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] text-muted">
          <Legend color="bg-accent" label="dein Ziel" />
          <Legend color="bg-red-500/50" label="MV" />
          <Legend color="bg-yellow-400/50" label="MEV" />
          <Legend color="bg-green-500/55" label="MAV" />
          <Legend color="bg-green-900/60" label="MRV" />
        </p>
        {warnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            {warnings.map((w) => (
              <li key={w} className="flex gap-1.5">
                <AlertTriangle size={13} className="mt-px shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={detail !== null} title={detail ?? ''} onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Ziel-Zone</span>
              <div className="grid grid-cols-5 gap-1">
                {[null, ...ZONES].map((z) => {
                  const active = z === null ? zones[detail] === undefined : zones[detail] === z
                  const r = z ? zoneRange(detail, z) : null
                  return (
                    <button
                      key={z ?? 'auto'}
                      type="button"
                      onClick={() => void setZone(detail, z)}
                      className={`flex flex-col items-center rounded-lg py-1.5 text-xs transition active:scale-95 ${active ? 'bg-accent font-semibold text-accent-fg' : 'bg-surface-2 text-fg'}`}
                    >
                      {z ?? 'Auto'}
                      <span className="text-[10px] font-normal opacity-75">{r ? `${r.lo}–${r.hi}` : defaultZone(answers.goal)}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted">
                Tabelle: MV {LANDMARKS[detail].mv} · MEV {LANDMARKS[detail].mev} · MAV {LANDMARKS[detail].mavLo}–{LANDMARKS[detail].mavHi} · MRV {LANDMARKS[detail].mrv}
                {' '}· gilt auch für „Dein Start“.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Beiträge pro Woche · {fmt(vol.weekly.get(detail) ?? 0)} Sätze</span>
              {(vol.contributions.get(detail) ?? []).length === 0 ? (
                <p className="text-sm text-muted">Keine Übung im Plan trainiert diesen Muskel.</p>
              ) : (
                (vol.contributions.get(detail) ?? []).map((c, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm">
                    <span className="min-w-0 truncate text-fg">
                      {c.exercise} <span className="text-xs text-muted">· {c.plan}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {c.sets} Sätze{c.share < 1 ? ' × ½' : ''}
                      {c.timesPerWeek !== 1 ? ` × ${fmt(c.timesPerWeek)}/Wo.` : ''} = {fmt(c.sets * c.share * c.timesPerWeek)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Sheet>
    </CollapsibleCard>
  )
}

function MuscleRow({ muscle, sets, zone, own, onOpen }: { muscle: VolumeMuscle; sets: number; zone: Zone; own: boolean; onOpen: () => void }) {
  const l = LANDMARKS[muscle]
  const max = Math.max(l.mrv + 4, sets + 2)
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`
  const range = zoneRange(muscle, zone)
  const status = volumeStatus(muscle, sets, zone)
  const bands = [
    { from: l.mv, to: l.mev, color: 'bg-red-500/50' },
    { from: l.mev, to: l.mavLo, color: 'bg-yellow-400/50' },
    { from: l.mavLo, to: l.mavHi, color: 'bg-green-500/55' },
    { from: l.mavHi, to: l.mrv, color: 'bg-green-500/30' },
    { from: l.mrv, to: max, color: 'bg-green-900/60' },
  ].filter((z) => z.to > z.from)
  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-0.5 text-left">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 text-fg">
          {status === 'ok' ? (
            <Check size={13} className="text-green-500" />
          ) : status === 'zuviel' ? (
            <AlertTriangle size={13} className="text-danger" />
          ) : status === 'unter' ? (
            <AlertTriangle size={13} className="text-amber-500" />
          ) : (
            <span className="inline-block w-[13px]" />
          )}
          {muscle}
        </span>
        <span className="tabular-nums text-muted">
          {fmt(sets)} · {own ? '' : 'Auto '}
          {zone} {range.lo}–{range.hi}
        </span>
      </span>
      <span className="relative block h-2.5 overflow-hidden rounded-full bg-surface-2">
        {bands.map((z) => (
          <span key={z.from} className={`absolute inset-y-0 ${z.color}`} style={{ left: pct(z.from), width: `calc(${pct(z.to)} - ${pct(z.from)})` }} />
        ))}
        <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded bg-fg" style={{ left: pct(sets) }} />
      </span>
      {/* Gewählte Zone als Linie unter dem Balken */}
      <span className="relative block h-1">
        <span className="absolute top-0 h-0.5 rounded-full bg-accent" style={{ left: pct(range.lo), width: `max(4px, calc(${pct(range.hi)} - ${pct(range.lo)}))` }} />
      </span>
    </button>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-sm ${color}`} /> {label}
    </span>
  )
}
