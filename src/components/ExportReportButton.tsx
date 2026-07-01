import jsPDF from 'jspdf'
import { db } from '../db/db'
import type { Athlete, DailyEntry } from '../models/types'
import type { CalculatorResult } from '../lib/calculator'
import { Button } from './ui'

const MEASUREMENTS: { key: keyof DailyEntry; label: string }[] = [
  { key: 'waist', label: 'Bauch' },
  { key: 'arm', label: 'Arm' },
  { key: 'chest', label: 'Brust' },
  { key: 'leg', label: 'Bein' },
]

export default function ExportReportButton({
  athlete,
  entries,
  result,
}: {
  athlete: Athlete
  entries: DailyEntry[]
  result: CalculatorResult
}) {
  async function exportPdf() {
    const doc = new jsPDF()
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
    const withWeight = sorted.filter((e) => e.weightKg !== undefined)
    const first = withWeight[0]
    const last = withWeight[withWeight.length - 1]

    doc.setFontSize(18)
    doc.text(`Fortschrittsbericht - ${athlete.name}`, 14, 18)
    doc.setFontSize(10)
    doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 14, 25)

    doc.setFontSize(13)
    doc.text('Kalorienrechner', 14, 38)
    doc.setFontSize(10)
    const calcLines = [
      `Grundumsatz BMR: ${result.bmr} kcal`,
      `Gesamtumsatz TDEE: ${result.tdee} kcal`,
      `Zielkalorien: ${result.targetCalories} kcal`,
      `Protein: ${result.proteinG} g   Fett: ${result.fatG} g   Carbs: ${result.carbsG} g`,
    ]
    calcLines.forEach((line, i) => doc.text(line, 14, 46 + i * 6))

    doc.setFontSize(13)
    doc.text('Verlauf', 14, 76)
    doc.setFontSize(10)
    let y = 84
    if (first && last) {
      doc.text(`Startgewicht (${first.date}): ${first.weightKg} kg`, 14, y)
      y += 6
      doc.text(`Aktuelles Gewicht (${last.date}): ${last.weightKg} kg`, 14, y)
      y += 6
      const diff = (last.weightKg! - first.weightKg!).toFixed(1)
      doc.text(`Veränderung: ${diff} kg`, 14, y)
      y += 10
    } else {
      doc.text('Noch keine Trackingdaten vorhanden.', 14, y)
      y += 10
    }

    doc.setFontSize(13)
    doc.text('Körpermaße', 14, y)
    y += 8
    doc.setFontSize(10)
    let anyMeasurement = false
    for (const { key, label } of MEASUREMENTS) {
      const withValue = sorted.filter((e) => e[key] !== undefined)
      if (withValue.length === 0) continue
      anyMeasurement = true
      const m = withValue[0]
      const n = withValue[withValue.length - 1]
      const diff = ((n[key] as number) - (m[key] as number)).toFixed(1)
      doc.text(`${label}: ${m[key]} cm (${m.date}) -> ${n[key]} cm (${n.date}), ${diff} cm`, 14, y)
      y += 6
    }
    if (!anyMeasurement) {
      doc.text('Noch keine Körpermaße erfasst.', 14, y)
      y += 6
    }
    y += 4

    if (y > 250) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(13)
    doc.text('Kraft-Werte', 14, y)
    y += 8
    doc.setFontSize(10)
    const strengthLines = await buildStrengthLines(athlete.id)
    if (strengthLines.length === 0) {
      doc.text('Noch keine Trainingsdaten erfasst.', 14, y)
      y += 6
    } else {
      for (const line of strengthLines) {
        if (y > 280) {
          doc.addPage()
          y = 20
        }
        doc.text(line, 14, y)
        y += 6
      }
    }
    y += 4

    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(13)
    doc.text('Letzte Einträge', 14, y)
    y += 8
    doc.setFontSize(9)
    const recent = sorted.filter((e) => e.weightKg !== undefined || e.calories !== undefined).slice(-14)
    for (const e of recent) {
      if (y > 280) {
        doc.addPage()
        y = 20
      }
      const parts = [
        e.date,
        e.weightKg !== undefined ? `${e.weightKg} kg` : '-',
        e.bodyFatPct !== undefined ? `${e.bodyFatPct}% KFA` : '-',
        e.calories !== undefined ? `${e.calories} kcal` : '-',
      ]
      doc.text(parts.join('   '), 14, y)
      y += 5
    }

    const blob = doc.output('blob')
    const file = new File([blob], `Fortschrittsbericht-${athlete.name}.pdf`, { type: 'application/pdf' })

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Fortschrittsbericht ${athlete.name}` })
        return
      } catch {
        // Nutzer hat Teilen abgebrochen - fällt durch zum Download
      }
    }
    doc.save(`Fortschrittsbericht-${athlete.name}.pdf`)
  }

  return (
    <Button variant="primary" onClick={exportPdf}>
      PDF-Bericht exportieren / teilen
    </Button>
  )
}

async function buildStrengthLines(athleteId: string): Promise<string[]> {
  const logs = await db.workoutLogs.where('athleteId').equals(athleteId).toArray()
  const logIds = logs.map((l) => l.id)
  if (logIds.length === 0) return []
  const dateByLogId = new Map(logs.map((l) => [l.id, l.date]))
  const logExercises = await db.workoutLogExercises.where('workoutLogId').anyOf(logIds).toArray()
  const exercises = await db.exercises.toArray()
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]))

  const latestByExercise = new Map<string, { date: string; weightKg: number }>()
  for (const row of logExercises) {
    if (row.weightKg === undefined) continue
    const date = dateByLogId.get(row.workoutLogId) ?? ''
    const existing = latestByExercise.get(row.exerciseId)
    if (!existing || date > existing.date) {
      latestByExercise.set(row.exerciseId, { date, weightKg: row.weightKg })
    }
  }

  return [...latestByExercise.entries()]
    .map(([exerciseId, v]) => ({ name: exerciseMap.get(exerciseId)?.name ?? '?', ...v }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => `${e.name}: ${e.weightKg} kg (zuletzt am ${e.date})`)
}
