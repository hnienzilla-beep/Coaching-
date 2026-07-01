import jsPDF from 'jspdf'
import { db } from '../db/db'
import type { Athlete } from '../models/types'
import { Button } from './ui'

export default function ExportTrainingPlanButton({ athlete }: { athlete: Athlete }) {
  async function exportPdf() {
    const plans = await db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order')
    const exercises = await db.exercises.toArray()
    const exerciseMap = new Map(exercises.map((e) => [e.id, e]))

    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text(`Trainingsplan - ${athlete.name}`, 14, 18)
    doc.setFontSize(10)
    doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 14, 25)

    let y = 38
    for (const plan of plans) {
      if (y > 260) {
        doc.addPage()
        y = 20
      }
      doc.setFontSize(13)
      doc.text(plan.phaseName, 14, y)
      y += 8

      const rows = await db.trainingPlanExercises.where('planId').equals(plan.id).toArray()
      doc.setFontSize(10)
      if (rows.length === 0) {
        doc.text('Keine Übungen eingetragen.', 14, y)
        y += 8
      }
      for (const row of rows) {
        if (y > 280) {
          doc.addPage()
          y = 20
        }
        const exercise = exerciseMap.get(row.exerciseId)
        const weight = row.targetWeightKg !== undefined ? ` @ ${row.targetWeightKg} kg` : ''
        doc.text(`- ${exercise?.name ?? '?'}: ${row.sets} x ${row.reps}${weight}`, 14, y)
        y += 6
      }
      y += 6
    }

    const blob = doc.output('blob')
    const file = new File([blob], `Trainingsplan-${athlete.name}.pdf`, { type: 'application/pdf' })

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Trainingsplan ${athlete.name}` })
        return
      } catch {
        // Nutzer hat Teilen abgebrochen - fällt durch zum Download
      }
    }
    doc.save(`Trainingsplan-${athlete.name}.pdf`)
  }

  return (
    <Button variant="primary" onClick={exportPdf}>
      Trainingsplan als PDF exportieren / teilen
    </Button>
  )
}
