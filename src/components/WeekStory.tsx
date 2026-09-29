import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addDays, todayIso } from '../db/queries'
import { mondayOf } from '../lib/calculator'
import { CAL_TOLERANCE } from '../lib/macros'
import { haptic } from '../lib/feedback'
import { shareOrDownloadFile } from '../lib/share'
import { buildWeekStory, storyHasContent, type StoryWorkout, type WeekStory as Story } from '../lib/weekStory'
import type { Athlete, DailyEntry } from '../models/types'
import { Card } from './ui'

type Slide = { emoji: string; kicker: string; big: string; unit?: string; lines: string[] }

const SLIDE_MS = 5000

function fmt(n: number, digits = 0): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long' })
}

function buildSlides(story: Story, athlete: Athlete, targetKcal: number): Slide[] {
  const range = `${shortDate(story.start)} – ${shortDate(story.end)}`
  const slides: Slide[] = [
    { emoji: '📖', kicker: range, big: 'Deine Woche', lines: [`${athlete.name}, hier ist dein Rückblick.`, 'Tippe rechts für weiter.'] },
  ]
  if (story.loggedDays > 0 && story.avgKcal !== undefined) {
    slides.push({
      emoji: '🍽️',
      kicker: 'Ernährung',
      big: fmt(story.avgKcal),
      unit: 'kcal Ø',
      lines: [
        `Vorgabe ${fmt(targetKcal)} kcal`,
        `${story.daysOnTarget} von ${story.loggedDays} Tagen im Ziel`,
        ...(story.avgProtein ? [`Ø ${fmt(story.avgProtein)} g Protein`] : []),
        ...(story.avgWaterMl ? [`Ø ${fmt(story.avgWaterMl / 1000, 1)} l Wasser`] : []),
      ],
    })
  }
  if (story.avgWeight !== undefined) {
    const d = story.weightDelta
    slides.push({
      emoji: '⚖️',
      kicker: 'Gewicht',
      big: d === undefined ? fmt(story.avgWeight, 1) : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d), 1)}`,
      unit: d === undefined ? 'kg Ø' : 'kg zur Vorwoche',
      lines: [`Ø ${fmt(story.avgWeight, 1)} kg diese Woche`],
    })
  }
  if (story.trainings > 0) {
    slides.push({
      emoji: '🏋️',
      kicker: 'Training',
      big: String(story.trainings),
      unit: story.trainings === 1 ? 'Einheit' : 'Einheiten',
      lines: [`${story.setsDone} Sätze erledigt`, `${fmt(story.volumeKg / 1000, 1)} t bewegt`],
    })
  }
  const highlights: string[] = []
  if (story.topSet) highlights.push(`Schwerster Satz: ${story.topSet.exercise} ${fmt(story.topSet.weightKg, 1)} kg × ${story.topSet.reps}`)
  if (story.bestDay) highlights.push(`Bester Ernährungstag: ${weekday(story.bestDay.date)} (${fmt(story.bestDay.kcal)} kcal)`)
  if (highlights.length) slides.push({ emoji: '✨', kicker: 'Highlights', big: 'Stark!', lines: highlights })
  const onTrack = story.loggedDays > 0 ? story.daysOnTarget / story.loggedDays : 0
  slides.push({
    emoji: onTrack >= 0.7 || story.trainings >= 3 ? '🔥' : '💪',
    kicker: 'Nächste Woche',
    big: onTrack >= 0.7 || story.trainings >= 3 ? 'Weiter so!' : 'Dranbleiben!',
    lines: ['Jede Woche zählt.', 'Teile deinen Rückblick über „Teilen“.'],
  })
  return slides
}

/** Folie als Bild (1080 × 1920) - direkt gezeichnet, ohne Screenshot-Bibliothek. */
async function slideImage(slide: Slide, footer: string): Promise<File> {
  const W = 1080
  const H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#a3e635'
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.3, H * 0.2, H * 0.9)
  glow.addColorStop(0, accent)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = 0.45
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = '160px system-ui, sans-serif'
  ctx.fillText(slide.emoji, W / 2, 620)
  ctx.font = '600 52px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(slide.kicker.toUpperCase(), W / 2, 760)
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 190px system-ui, sans-serif'
  ctx.fillText(slide.big, W / 2, 960)
  if (slide.unit) {
    ctx.font = '500 56px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText(slide.unit, W / 2, 1050)
  }
  ctx.font = '400 50px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  slide.lines.forEach((line, i) => ctx.fillText(line, W / 2, 1200 + i * 80, W - 120))
  ctx.font = '500 40px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText(footer, W / 2, H - 120)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return new File([blob!], 'Wochenrueckblick.png', { type: 'image/png' })
}

function StoryViewer({ slides, footer, onClose }: { slides: Slide[]; footer: string; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (paused) return
    timer.current = window.setTimeout(() => {
      if (index < slides.length - 1) setIndex(index + 1)
    }, SLIDE_MS)
    return () => window.clearTimeout(timer.current)
  }, [index, paused, slides.length])

  const slide = slides[index]
  const go = (delta: number) => {
    haptic('tap')
    const next = index + delta
    if (next < 0) return
    if (next >= slides.length) onClose()
    else setIndex(next)
  }

  return createPortal(
    <div
      className="anim-sheet fixed inset-0 z-[70] flex flex-col overflow-hidden bg-black text-white"
      style={{ background: 'radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--color-accent) 45%, #000) 0%, #000 70%)' }}
      role="dialog"
      aria-label="Wochenrückblick"
    >
      <div className="flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {slides.map((_, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              key={`${i}-${index}`}
              className={`h-full bg-white ${i === index && !paused ? 'story-progress' : ''}`}
              style={{ width: i < index ? '100%' : i === index && paused ? '50%' : i === index ? undefined : '0%', animationDuration: `${SLIDE_MS}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-xs text-white/70">{footer}</span>
        <button type="button" onClick={onClose} aria-label="Schließen" className="rounded-full px-2 py-1 text-xl text-white/80">
          ✕
        </button>
      </div>

      <div
        className="relative flex flex-1 select-none flex-col items-center justify-center gap-3 px-8 text-center"
        onPointerDown={() => setPaused(true)}
        onPointerUp={(e) => {
          setPaused(false)
          const x = e.clientX / window.innerWidth
          go(x < 0.33 ? -1 : 1)
        }}
        onPointerCancel={() => setPaused(false)}
      >
        <div key={index} className="anim-pop flex flex-col items-center gap-3">
          <span className="text-7xl">{slide.emoji}</span>
          <span className="text-sm font-semibold uppercase tracking-widest text-white/70">{slide.kicker}</span>
          <span className="text-6xl font-extrabold tabular-nums">{slide.big}</span>
          {slide.unit && <span className="text-lg text-white/75">{slide.unit}</span>}
          <div className="mt-4 flex flex-col gap-2 text-base text-white/90">
            {slide.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={async () => shareOrDownloadFile(await slideImage(slide, footer))}
          className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-medium text-white backdrop-blur active:scale-95"
        >
          ⤴ Teilen
        </button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Wochenrückblick als Story: Karte im Dashboard für die letzte volle Woche (Mo-So), Montag und
 * Dienstag als "Neu" markiert, bis sie angesehen wurde.
 */
export default function WeekStoryCard({ athlete, entries, targetKcal }: { athlete: Athlete; entries: DailyEntry[]; targetKcal: number }) {
  const today = todayIso()
  const monday = addDays(mondayOf(today), -7)
  const [open, setOpen] = useState(false)
  const seenKey = `coach.storySeen.${athlete.id}.${monday}`
  const [seen, setSeen] = useState(() => {
    try {
      return !!localStorage.getItem(seenKey)
    } catch {
      return true
    }
  })

  const workouts = useLiveQuery(async (): Promise<StoryWorkout[]> => {
    const end = addDays(monday, 6)
    const logs = await db.workoutLogs.where('athleteId').equals(athlete.id).filter((l) => l.date >= monday && l.date <= end).toArray()
    if (!logs.length) return []
    const les = await db.workoutLogExercises.where('workoutLogId').anyOf(logs.map((l) => l.id)).toArray()
    const names = new Map((await db.exercises.toArray()).map((e) => [e.id, e.name]))
    const sets = await db.workoutSets.where('workoutLogExerciseId').anyOf(les.map((l) => l.id)).toArray()
    return logs.map((log) => {
      const mine = les.filter((le) => le.workoutLogId === log.id)
      return {
        date: log.date,
        sets: sets
          .filter((s) => mine.some((le) => le.id === s.workoutLogExerciseId))
          .map((s) => {
            const le = mine.find((x) => x.id === s.workoutLogExerciseId)!
            return { done: s.done, reps: s.reps, weightKg: s.weightKg, exercise: names.get(le.exerciseId) ?? 'Übung' }
          }),
      }
    })
  }, [athlete.id, monday])

  const story = useMemo(
    () => buildWeekStory(monday, entries, workouts ?? [], { kcal: targetKcal, tolerance: CAL_TOLERANCE }),
    [monday, entries, workouts, targetKcal],
  )
  if (!workouts || !storyHasContent(story)) return null

  const slides = buildSlides(story, athlete, targetKcal)
  const footer = `Wochenrückblick · ${shortDate(story.start)} – ${shortDate(story.end)}`
  const isNew = !seen

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setSeen(true)
          try {
            localStorage.setItem(seenKey, '1')
          } catch {
            // egal
          }
        }}
        className="text-left transition active:scale-[0.98]"
      >
        <Card className="relative flex items-center gap-3 overflow-hidden">
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-25"
            style={{ background: 'radial-gradient(circle at 0% 0%, var(--color-accent), transparent 60%)' }}
          />
          <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${isNew ? 'story-ring' : 'bg-surface-2'}`}>
            📖
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">Deine Woche {isNew && <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-fg">NEU</span>}</span>
            <span className="block truncate text-xs text-muted">
              {shortDate(story.start)} – {shortDate(story.end)} · {story.trainings} Trainings · {story.loggedDays} Tage geloggt
            </span>
          </span>
          <span className="relative shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-fg">Ansehen</span>
        </Card>
      </button>
      {open && <StoryViewer slides={slides} footer={footer} onClose={() => setOpen(false)} />}
    </>
  )
}
