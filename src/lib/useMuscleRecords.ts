import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addDays, todayIso } from '../db/queries'
import { primaryMuscle, type MuscleSetRecord } from './muscles'

/** Erledigte Sätze der letzten 7 Tage, je Satz mit Hauptmuskel, Datum und Übung. */
export function useMuscleRecords(athleteId: string): MuscleSetRecord[] | undefined {
  return useLiveQuery(async () => {
    const since = addDays(todayIso(), -6)
    const logs = await db.workoutLogs.where('athleteId').equals(athleteId).filter((l) => l.date >= since).toArray()
    if (logs.length === 0) return []
    const dateByLog = new Map(logs.map((l) => [l.id, l.date]))
    const logExercises = await db.workoutLogExercises.where('workoutLogId').anyOf([...dateByLog.keys()]).toArray()
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    const byLogExercise = new Map(logExercises.map((le) => [le.id, le]))
    const done = await db.workoutSets.where('workoutLogExerciseId').anyOf([...byLogExercise.keys()]).filter((s) => !!s.done && !s.warmup).toArray()
    const records: MuscleSetRecord[] = []
    for (const s of done) {
      const le = byLogExercise.get(s.workoutLogExerciseId)
      const ex = le ? exercises.get(le.exerciseId) : undefined
      const muscle = ex ? primaryMuscle(ex) : undefined
      if (!le || !ex || !muscle) continue
      records.push({ muscle, date: dateByLog.get(le.workoutLogId)!, reps: s.reps, weightKg: s.weightKg, exercise: ex.name })
    }
    return records
  }, [athleteId])
}
