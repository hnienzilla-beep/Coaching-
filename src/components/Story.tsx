import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addDays, todayIso } from '../db/queries'
import { caloriesFromMacros, mondayOf } from '../lib/calculator'
import { CAL_TOLERANCE } from '../lib/macros'
import { haptic } from '../lib/feedback'
import { primaryMuscle, muscleHeat, MUSCLES, targetFor } from '../lib/muscles'
import { shareOrDownloadFile } from '../lib/share'
import { useDisabledStorySlides, type StorySlideId } from '../lib/storySettings'
import { buildPeriodStats, periodHasContent, type PeriodStats, type StoryInput } from '../lib/storyStats'
import { waterGoalFor } from '../lib/water'
import type { Athlete, DailyEntry } from '../models/types'
import BodyFigure, { type HeatMap } from './BodyFigure'
import { Card, CountUp } from './ui'

/* ----------------------------------------------------------------------------------------
 * Daten
 * -------------------------------------------------------------------------------------- */

function useStoryInput(athlete: Athlete, kind: 'week' | 'month', start: string, end: string, entries: DailyEntry[], target: StoryInput['target']) {
  const raw = useLiveQuery(async () => {
    const logs = await db.workoutLogs.where('athleteId').equals(athlete.id).filter((l) => l.date <= end).toArray()
    const les = logs.length ? await db.workoutLogExercises.where('workoutLogId').anyOf(logs.map((l) => l.id)).toArray() : []
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    const sets = les.length ? await db.workoutSets.where('workoutLogExerciseId').anyOf(les.map((l) => l.id)).toArray() : []
    const logById = new Map(logs.map((l) => [l.id, l]))
    const leById = new Map(les.map((l) => [l.id, l]))
    const storySets = sets.flatMap((s) => {
      const le = leById.get(s.workoutLogExerciseId)
      const ex = le ? exercises.get(le.exerciseId) : undefined
      const log = le ? logById.get(le.workoutLogId) : undefined
      if (!le || !ex || !log) return []
      return [{ date: log.date, done: s.done, reps: s.reps, weightKg: s.weightKg, exercise: ex.name, muscle: primaryMuscle(ex) }]
    })
    const workouts = logs.map((l) => ({
      date: l.date,
      durationMin: l.startedAt && l.completedAt ? (Date.parse(l.completedAt) - Date.parse(l.startedAt)) / 60_000 : undefined,
    }))
    const nutritionLogs = await db.nutritionLogs.where('athleteId').equals(athlete.id).filter((l) => l.date >= start && l.date <= end).toArray()
    const items = nutritionLogs.length ? await db.nutritionLogItems.where('nutritionLogId').anyOf(nutritionLogs.map((l) => l.id)).toArray() : []
    const foods = new Map((await db.foodItems.toArray()).map((f) => [f.id, f]))
    const dateByLog = new Map(nutritionLogs.map((l) => [l.id, l.date]))
    const storyFoods = items.flatMap((i) => {
      const f = foods.get(i.foodItemId)
      return f && !f.quick ? [{ date: dateByLog.get(i.nutritionLogId)!, name: f.name, grams: i.grams }] : []
    })
    return { sets: storySets, workouts, foods: storyFoods }
  }, [athlete.id, start, end])

  return useMemo<PeriodStats | undefined>(() => {
    if (!raw) return undefined
    return buildPeriodStats({
      kind,
      start,
      end,
      entries,
      ...raw,
      target,
      goal: { targetWeightKg: athlete.targetWeightKg, losing: athlete.targetWeightKg !== undefined && athlete.targetWeightKg < athlete.weightKg },
      muscleTargets: athlete.muscleTargets,
    })
  }, [raw, kind, start, end, entries, target, athlete.targetWeightKg, athlete.weightKg, athlete.muscleTargets])
}

/* ----------------------------------------------------------------------------------------
 * Folien
 * -------------------------------------------------------------------------------------- */

type Big = { value: number; decimals?: number; prefix?: string; suffix?: string }
type Slide = { id: string; emoji: string; kicker: string; big?: Big; bigText?: string; unit?: string; lines: string[]; visual?: ReactNode }

const fmt = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long' })
const signed = (n: number, d = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n), d)}`
const periodWord = (s: PeriodStats) => (s.kind === 'week' ? 'Woche' : 'Monat')
const prevWord = (s: PeriodStats) => (s.kind === 'week' ? 'Vorwoche' : 'Vormonat')

function KcalBars({ stats, target }: { stats: PeriodStats; target: number }) {
  const max = Math.max(target * 1.3, ...stats.kcalByDay.map((d) => d.kcal ?? 0))
  const n = stats.kcalByDay.length
  const w = 280
  const h = 150
  const gap = n > 10 ? 2 : 8
  const bw = (w - gap * (n - 1)) / n
  const ty = h - (target / max) * h
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-72 max-w-full">
      {stats.kcalByDay.map((d, i) => {
        const bh = ((d.kcal ?? 0) / max) * h
        const onTarget = d.kcal !== undefined && Math.abs(d.kcal - target) <= CAL_TOLERANCE
        return (
          <g key={d.date}>
            <rect
              x={i * (bw + gap)}
              y={h - bh}
              width={bw}
              height={Math.max(bh, d.kcal ? 2 : 0)}
              rx={Math.min(4, bw / 3)}
              fill={onTarget ? '#ffffff' : 'rgba(255,255,255,0.45)'}
              className="story-bar"
              style={{ animationDelay: `${i * 60}ms`, transformOrigin: `0 ${h}px` }}
            />
            {n <= 7 && (
              <text x={i * (bw + gap) + bw / 2} y={h + 14} fontSize="10" fill="rgba(255,255,255,0.7)" textAnchor="middle">
                {weekday(d.date).slice(0, 2)}
              </text>
            )}
          </g>
        )
      })}
      <line x1="0" x2={w} y1={ty} y2={ty} stroke="#ffffff" strokeDasharray="4 4" strokeOpacity="0.8" />
    </svg>
  )
}

function MacroRing({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const parts = [
    { label: 'Protein', kcal: protein * 4, color: '#ffffff' },
    { label: 'Carbs', kcal: carbs * 4, color: 'rgba(255,255,255,0.6)' },
    { label: 'Fett', kcal: fat * 9, color: 'rgba(255,255,255,0.3)' },
  ]
  const total = parts.reduce((a, p) => a + p.kcal, 0) || 1
  const r = 60
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44 -rotate-90">
      {parts.map((p) => {
        const len = (p.kcal / total) * c
        const el = (
          <circle
            key={p.label}
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth="22"
            strokeDasharray={`${len} ${c}`}
            strokeDashoffset={-offset}
            className="story-ring-seg"
          />
        )
        offset += len
        return el
      })}
    </svg>
  )
}

function WeightLine({ weights }: { weights: { date: string; kg: number }[] }) {
  if (weights.length < 2) return null
  const w = 280
  const h = 110
  const min = Math.min(...weights.map((p) => p.kg))
  const max = Math.max(...weights.map((p) => p.kg))
  const span = Math.max(0.5, max - min)
  const pts = weights.map((p, i) => `${(i / (weights.length - 1)) * w},${h - 8 - ((p.kg - min) / span) * (h - 16)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-72 max-w-full">
      <polyline points={pts} fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="story-draw" />
    </svg>
  )
}

function StoryHeatmap({ stats, athlete }: { stats: PeriodStats; athlete: Athlete }) {
  const counts = new Map<string, number>()
  for (const r of stats.muscleRecords) counts.set(r.muscle, (counts.get(r.muscle) ?? 0) + 1)
  const scale = stats.kind === 'month' ? stats.days.length / 7 : 1
  const heat = Object.fromEntries(
    MUSCLES.map((m) => [m, muscleHeat(counts.get(m) ?? 0, targetFor(m, athlete.muscleTargets) * scale)]),
  ) as HeatMap
  const sex = athlete.gender === 'Weiblich' ? 'female' : 'male'
  return (
    <div className="flex gap-2">
      <BodyFigure side="front" sex={sex} heat={heat} grown className="h-56 w-auto" />
      <BodyFigure side="back" sex={sex} heat={heat} grown className="h-56 w-auto" />
    </div>
  )
}

function buildSlides(stats: PeriodStats, athlete: Athlete, targetKcal: number, disabled: StorySlideId[]): Slide[] {
  const on = (id: StorySlideId) => !disabled.includes(id)
  const range = `${shortDate(stats.start)} – ${shortDate(stats.end)}`
  const title =
    stats.kind === 'week'
      ? 'Deine Woche'
      : `Dein ${new Date(`${stats.start}T00:00:00`).toLocaleDateString('de-DE', { month: 'long' })}`
  const slides: Slide[] = [
    {
      id: 'titel',
      emoji: stats.kind === 'week' ? '📖' : '🗓️',
      kicker: range,
      bigText: title,
      lines: [`${athlete.name}, hier ist deine Auswertung.`, 'Tippen oder wischen zum Blättern · halten zum Pausieren'],
    },
  ]
  const hitRate = stats.loggedDays ? stats.daysOnTarget / stats.loggedDays : 0

  if (on('ernaehrung') && stats.avgKcal !== undefined) {
    slides.push({
      id: 'ernaehrung',
      emoji: '🍽️',
      kicker: 'Ernährung',
      big: { value: stats.avgKcal },
      unit: `kcal Ø · Vorgabe ${fmt(targetKcal)}`,
      lines: [
        `${stats.daysOnTarget} von ${stats.loggedDays} Tagen im Ziel – ${hitRate >= 0.7 ? 'sehr konsequent.' : hitRate >= 0.4 ? 'solide, da geht noch mehr.' : 'hier liegt dein größter Hebel.'}`,
        ...(stats.avgProtein !== undefined ? [`Ø ${fmt(stats.avgProtein)} g Protein · an ${stats.proteinDaysHit} Tagen erreicht`] : []),
      ],
    })
  }
  if (on('kcalVerlauf') && stats.loggedDays > 0) {
    const best = stats.bestDay
    slides.push({
      id: 'kcalVerlauf',
      emoji: '📊',
      kicker: 'Kalorien-Verlauf',
      lines: [
        'Gestrichelt: deine Vorgabe · hell: im Ziel',
        ...(best ? [`Punktlandung am ${weekday(best.date)} (${fmt(best.kcal)} kcal).`] : []),
      ],
      visual: <KcalBars stats={stats} target={targetKcal} />,
    })
  }
  if (on('makros') && stats.avgProtein !== undefined && stats.avgCarbs !== undefined && stats.avgFat !== undefined) {
    const total = caloriesFromMacros(stats.avgProtein, stats.avgCarbs, stats.avgFat) || 1
    const pct = (g: number, f: number) => Math.round(((g * f) / total) * 100)
    slides.push({
      id: 'makros',
      emoji: '🥗',
      kicker: 'Makro-Verteilung',
      lines: [
        `Protein ${pct(stats.avgProtein, 4)} % · Carbs ${pct(stats.avgCarbs, 4)} % · Fett ${pct(stats.avgFat, 9)} %`,
        pct(stats.avgProtein, 4) >= 25 ? 'Proteinreich – gut für den Muskelerhalt.' : 'Mehr Protein würde dir helfen, Muskeln zu halten.',
      ],
      visual: <MacroRing protein={stats.avgProtein} carbs={stats.avgCarbs} fat={stats.avgFat} />,
    })
  }
  if (on('gewicht') && stats.avgWeight !== undefined) {
    const d = stats.weightDelta
    slides.push({
      id: 'gewicht',
      emoji: '⚖️',
      kicker: 'Gewicht',
      big: d !== undefined ? { value: Math.abs(d), decimals: 1, prefix: d > 0 ? '+' : d < 0 ? '−' : '±' } : { value: stats.avgWeight, decimals: 1 },
      unit: d !== undefined ? `kg zur ${prevWord(stats)}` : 'kg Ø',
      lines: [`Ø ${fmt(stats.avgWeight, 1)} kg in dieser ${periodWord(stats) === 'Woche' ? 'Woche' : 'Zeit'}`],
      visual: <WeightLine weights={stats.weights} />,
    })
  }
  if (on('wasser') && stats.avgWaterMl !== undefined) {
    slides.push({
      id: 'wasser',
      emoji: '💧',
      kicker: 'Wasser',
      big: { value: stats.avgWaterMl / 1000, decimals: 1 },
      unit: 'Liter Ø pro Tag',
      lines: [`An ${stats.waterDaysHit} Tagen das Ziel erreicht.`],
    })
  }
  if (on('training') && stats.trainings > 0) {
    slides.push({
      id: 'training',
      emoji: '🏋️',
      kicker: 'Training',
      big: { value: stats.trainings },
      unit: stats.trainings === 1 ? 'Einheit' : 'Einheiten',
      lines: [`${stats.setsDone} Sätze erledigt`, `${fmt(stats.volumeKg / 1000, 1)} Tonnen bewegt`],
    })
  }
  if (on('trainingszeit') && stats.durationMin > 0) {
    slides.push({
      id: 'trainingszeit',
      emoji: '⏱️',
      kicker: 'Trainingszeit',
      big: { value: stats.durationMin },
      unit: 'Minuten insgesamt',
      lines: stats.longestMin ? [`Längste Einheit: ${stats.longestMin} Minuten`] : [],
    })
  }
  if (on('heatmap') && stats.muscleRecords.length > 0) {
    slides.push({
      id: 'heatmap',
      emoji: '🔥',
      kicker: 'Deine Muskeln',
      lines: stats.missingMuscles.length ? [`Kam nicht vor: ${stats.missingMuscles.slice(0, 3).join(', ')}`] : ['Alle großen Muskelgruppen trainiert – stark!'],
      visual: <StoryHeatmap stats={stats} athlete={athlete} />,
    })
  }
  if (on('rekorde') && stats.prs.length > 0) {
    slides.push({
      id: 'rekorde',
      emoji: '🏆',
      kicker: 'Neue Rekorde',
      big: { value: stats.prs.length },
      unit: stats.prs.length === 1 ? 'Bestleistung' : 'Bestleistungen',
      lines: stats.prs.slice(0, 3).map((p) => `${p.exercise}: ${fmt(p.weightKg, 1)} kg × ${p.reps}${p.previousKg ? ` (vorher ${fmt(p.previousKg, 1)})` : ''}`),
    })
  }
  if (on('topFood') && stats.topFoods.length > 0) {
    slides.push({
      id: 'topFood',
      emoji: '🥇',
      kicker: 'Top-Lebensmittel',
      bigText: stats.topFoods[0].name,
      lines: stats.topFoods.map((f, i) => `${i + 1}. ${f.name} – ${f.count}× (${fmt(f.grams / 1000, 1)} kg)`),
    })
  }
  if (on('serien') && stats.bestStreak > 0) {
    slides.push({
      id: 'serien',
      emoji: '🔥',
      kicker: 'Serie',
      big: { value: stats.streak || stats.bestStreak },
      unit: stats.streak ? 'Tage in Folge geloggt' : 'Tage am Stück (beste Serie)',
      lines: [stats.streak >= 7 ? 'Du bist im Flow – nicht abreißen lassen!' : 'Jeder geloggte Tag zählt.'],
    })
  }
  if (on('vergleich')) {
    const c = stats.compare
    const lines = [
      ...(c.avgKcal !== undefined ? [`Kalorien Ø ${signed(c.avgKcal)} kcal`] : []),
      ...(c.avgWeight !== undefined ? [`Gewicht Ø ${signed(c.avgWeight, 1)} kg`] : []),
      `Trainings ${signed(c.trainings)}`,
      `Volumen ${signed(Math.round(c.volumeKg / 100) / 10, 1)} t`,
    ]
    if (lines.length > 2) slides.push({ id: 'vergleich', emoji: '↕️', kicker: `Zur ${prevWord(stats)}`, lines })
  }
  if (on('prognose') && stats.forecast && athlete.targetWeightKg !== undefined) {
    const f = stats.forecast
    if (f.kind === 'eta') {
      slides.push({
        id: 'prognose',
        emoji: '🎯',
        kicker: 'Zielprognose',
        big: { value: Math.max(1, Math.round(f.days / 7)) },
        unit: `Wochen bis ${fmt(athlete.targetWeightKg, 1)} kg`,
        lines: [`Bei ${signed(f.perWeek, 2)} kg/Woche etwa am ${shortDate(f.date)}.`],
      })
    } else if (f.kind === 'away') {
      slides.push({ id: 'prognose', emoji: '🎯', kicker: 'Zielprognose', bigText: 'Kurs korrigieren', lines: [`Trend ${signed(f.perWeek, 2)} kg/Woche – so wird ${fmt(athlete.targetWeightKg, 1)} kg nicht erreicht.`] })
    } else if (f.kind === 'reached') {
      slides.push({ id: 'prognose', emoji: '🎯', kicker: 'Zielprognose', bigText: 'Ziel erreicht!', lines: ['Zeit für ein neues Ziel?'] })
    }
  }
  if (on('masse') && stats.measures.length > 0) {
    slides.push({
      id: 'masse',
      emoji: '📏',
      kicker: 'Körpermaße',
      lines: stats.measures.map((m) => `${m.label}: ${fmt(m.latest, 1)} cm (${signed(m.delta, 1)})`),
    })
  }
  if (on('highlights') && (stats.topSet || stats.bestDay)) {
    slides.push({
      id: 'highlights',
      emoji: '✨',
      kicker: 'Highlights',
      bigText: 'Stark!',
      lines: [
        ...(stats.topSet ? [`Schwerster Satz: ${stats.topSet.exercise} ${fmt(stats.topSet.weightKg, 1)} kg × ${stats.topSet.reps}`] : []),
        ...(stats.bestDay ? [`Bester Ernährungstag: ${weekday(stats.bestDay.date)}`] : []),
      ],
    })
  }
  if (on('tipps')) {
    slides.push({ id: 'tipps', emoji: '🧭', kicker: 'Coach-Tipps', bigText: stats.kind === 'week' ? 'Nächste Woche' : 'Nächster Monat', lines: stats.tips })
  }
  return slides
}

/* ----------------------------------------------------------------------------------------
 * Teilen: Folie als 1080 × 1920-Bild, Grafiken aus dem DOM übernommen
 * -------------------------------------------------------------------------------------- */

async function svgToImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // Farben aus dem berechneten Stil übernehmen - CSS-Variablen und color-mix kennt das
  // eigenständige SVG-Bild nicht.
  const src = svg.querySelectorAll('*')
  clone.querySelectorAll('*').forEach((el, i) => {
    const cs = getComputedStyle(src[i])
    el.setAttribute('fill', cs.fill)
    el.setAttribute('stroke', cs.stroke)
    el.setAttribute('opacity', cs.opacity)
    el.removeAttribute('class')
  })
  clone.removeAttribute('class')
  const rect = svg.getBoundingClientRect()
  clone.setAttribute('width', String(rect.width * 3))
  clone.setAttribute('height', String(rect.height * 3))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })
  URL.revokeObjectURL(url)
  return img
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

async function slideImage(slide: Slide, container: HTMLElement | null): Promise<File> {
  const W = 1080
  const H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#a3e635'
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, accent)
  bg.addColorStop(0.55, '#4c1d95')
  bg.addColorStop(1, '#0b1020')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'

  // Erst alles vermessen, dann senkrecht mittig zeichnen.
  const svg = container?.querySelector('svg') as SVGSVGElement | null
  let img: HTMLImageElement | undefined
  if (svg) {
    try {
      img = await svgToImage(svg)
    } catch {
      // Grafik ließ sich nicht übernehmen - das Bild bekommt dann nur den Text.
    }
  }
  const imgScale = img ? Math.min(860 / img.width, 620 / img.height) : 0
  const bigText = slide.big ? `${slide.big.prefix ?? ''}${fmt(slide.big.value, slide.big.decimals ?? 0)}` : slide.bigText
  ctx.font = '400 46px system-ui, sans-serif'
  const textLines = slide.lines.flatMap((l) => wrapLines(ctx, l, W - 160))
  const blockH =
    150 + 110 + (bigText ? 190 : 0) + (slide.unit ? 70 : 0) + (img ? img.height * imgScale + 90 : 40) + textLines.length * 66
  let y = Math.max(160, (H - blockH) / 2) + 130

  ctx.fillStyle = '#ffffff'
  ctx.font = '150px system-ui, sans-serif'
  ctx.fillText(slide.emoji, W / 2, y)
  y += 110
  ctx.font = '600 50px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(slide.kicker.toUpperCase(), W / 2, y)
  if (bigText) {
    y += 190
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 ${bigText.length > 10 ? 110 : 170}px system-ui, sans-serif`
    ctx.fillText(bigText, W / 2, y, W - 120)
  }
  if (slide.unit) {
    y += 70
    ctx.font = '500 50px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(slide.unit, W / 2, y, W - 120)
  }
  if (img) {
    const iw = img.width * imgScale
    const ih = img.height * imgScale
    ctx.drawImage(img, (W - iw) / 2, y + 40, iw, ih)
    y += ih + 90
  } else {
    y += 40
  }
  ctx.font = '400 46px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (const line of textLines) {
    y += 66
    ctx.fillText(line, W / 2, y)
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return new File([blob!], 'Rueckblick.png', { type: 'image/png' })
}

/* ----------------------------------------------------------------------------------------
 * Ansicht
 * -------------------------------------------------------------------------------------- */

const SLIDE_MS = 5000

function StoryViewer({ slides, onClose }: { slides: Slide[]; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const visualRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null)

  // Fortschritt der aktuellen Folie - läuft nur, solange nicht pausiert (gedrückt gehalten).
  useEffect(() => {
    if (paused) return
    const startedAt = performance.now() - elapsed
    let frame = 0
    const tick = (now: number) => {
      const e = now - startedAt
      if (e >= SLIDE_MS) {
        if (index < slides.length - 1) {
          setIndex(index + 1)
          setElapsed(0)
        } else {
          setElapsed(SLIDE_MS)
        }
        return
      }
      setElapsed(e)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // `elapsed` bewusst nur beim (Wieder-)Start lesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, slides.length])

  const go = (delta: number) => {
    const next = index + delta
    if (next < 0) return
    haptic('tap')
    if (next >= slides.length) onClose()
    else {
      setIndex(next)
      setElapsed(0)
    }
  }
  const slide = slides[index]

  return createPortal(
    <div className="anim-sheet story-bg fixed inset-0 z-[70] flex flex-col overflow-hidden text-white" role="dialog" aria-label="Rückblick">
      <div className="flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {slides.map((s, i) => (
          <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? (elapsed / SLIDE_MS) * 100 : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end px-3 pt-2">
        <button type="button" onClick={onClose} aria-label="Schließen" className="rounded-full px-3 py-1 text-2xl text-white/80">
          ✕
        </button>
      </div>

      <div
        data-no-swipe
        className="relative flex flex-1 touch-none select-none flex-col items-center justify-center gap-3 px-7 text-center"
        onPointerDown={(e) => {
          gesture.current = { x: e.clientX, y: e.clientY, t: Date.now() }
          setPaused(true)
        }}
        onPointerUp={(e) => {
          const g = gesture.current
          gesture.current = null
          setPaused(false)
          if (!g) return
          const dx = e.clientX - g.x
          const dy = e.clientY - g.y
          if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose() // nach unten wischen schließt
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1)
          // Langes Halten war eine Pause, kein Tippen.
          if (Date.now() - g.t > 350) return
          go(e.clientX / window.innerWidth < 0.33 ? -1 : 1)
        }}
        onPointerCancel={() => {
          gesture.current = null
          setPaused(false)
        }}
      >
        <div key={slide.id} className="story-slide flex flex-col items-center gap-3">
          <span className="text-6xl">{slide.emoji}</span>
          <span className="text-sm font-semibold uppercase tracking-widest text-white/75">{slide.kicker}</span>
          {slide.big && (
            <span className="text-6xl font-extrabold tabular-nums">
              {slide.big.prefix}
              <CountUp value={slide.big.value} decimals={slide.big.decimals ?? 0} />
            </span>
          )}
          {slide.bigText && <span className="text-5xl font-extrabold leading-tight">{slide.bigText}</span>}
          {slide.unit && <span className="text-base text-white/80">{slide.unit}</span>}
          {slide.visual && (
            <div ref={visualRef} className="my-2 flex justify-center">
              {slide.visual}
            </div>
          )}
          <div className="mt-2 flex flex-col gap-2 text-[15px] leading-snug text-white/90">
            {slide.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={async () => {
            setPaused(true)
            await shareOrDownloadFile(await slideImage(slide, visualRef.current))
            setPaused(false)
          }}
          className="rounded-full bg-white/20 px-5 py-2.5 text-sm font-medium text-white backdrop-blur active:scale-95"
        >
          ⤴ Teilen
        </button>
      </div>
    </div>,
    document.body,
  )
}

/* ----------------------------------------------------------------------------------------
 * Karten im Dashboard
 * -------------------------------------------------------------------------------------- */

function StoryCard({
  athlete,
  entries,
  targetKcal,
  targetProtein,
  kind,
  start,
  end,
  autoOpen,
}: {
  athlete: Athlete
  entries: DailyEntry[]
  targetKcal: number
  targetProtein: number
  kind: 'week' | 'month'
  start: string
  end: string
  autoOpen: boolean
}) {
  const [disabled] = useDisabledStorySlides()
  const target = useMemo(
    () => ({ kcal: targetKcal, protein: targetProtein, tolerance: CAL_TOLERANCE, waterMl: waterGoalFor(athlete) }),
    [targetKcal, targetProtein, athlete],
  )
  const stats = useStoryInput(athlete, kind, start, end, entries, target)
  const seenKey = `coach.storySeen.${athlete.id}.${kind}.${start}`
  const [seen, setSeen] = useState(() => {
    try {
      return !!localStorage.getItem(seenKey)
    } catch {
      return true
    }
  })
  const [open, setOpen] = useState(false)
  const hasContent = !!stats && periodHasContent(stats)

  function markSeen() {
    setSeen(true)
    try {
      localStorage.setItem(seenKey, '1')
    } catch {
      // egal
    }
  }

  // Montags öffnet sich die Wochen-Story beim ersten Start von selbst - einmal.
  useEffect(() => {
    if (autoOpen && hasContent && !seen) {
      setOpen(true)
      markSeen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, hasContent])

  if (!stats || !hasContent) return null
  const slides = buildSlides(stats, athlete, targetKcal, disabled)
  const title = kind === 'week' ? 'Deine Woche' : `Dein ${new Date(`${start}T00:00:00`).toLocaleDateString('de-DE', { month: 'long' })}`

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          markSeen()
        }}
        className="text-left transition active:scale-[0.98]"
      >
        <Card className="relative flex items-center gap-3 overflow-hidden">
          <span aria-hidden="true" className="story-bg absolute inset-0 opacity-30" />
          <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${!seen ? 'story-ring' : 'bg-surface-2'}`}>
            {kind === 'week' ? '📖' : '🗓️'}
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">
              {title}
              {!seen && <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-fg">NEU</span>}
            </span>
            <span className="block truncate text-xs text-muted">
              {shortDate(start)} – {shortDate(end)} · {stats.trainings} Trainings · {stats.loggedDays} Tage geloggt
            </span>
          </span>
          <span className="relative shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-fg">Ansehen</span>
        </Card>
      </button>
      {open && <StoryViewer slides={slides} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * Rückblicke im Dashboard: immer die letzte volle Woche (Mo-So; montags öffnet sie sich von
 * selbst), in der ersten Woche eines Monats zusätzlich der Vormonat.
 */
export default function StoryCards(props: { athlete: Athlete; entries: DailyEntry[]; targetKcal: number; targetProtein: number }) {
  const today = todayIso()
  const weekStart = addDays(mondayOf(today), -7)
  const isMonday = mondayOf(today) === today
  const dayOfMonth = Number(today.slice(8, 10))
  const monthStart = `${addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`
  const monthEnd = addDays(`${today.slice(0, 7)}-01`, -1)
  return (
    <>
      <StoryCard {...props} kind="week" start={weekStart} end={addDays(weekStart, 6)} autoOpen={isMonday} />
      {dayOfMonth <= 7 && <StoryCard {...props} kind="month" start={monthStart} end={monthEnd} autoOpen={false} />}
    </>
  )
}
