import type { MuscleGroup } from '../models/types'

export interface ExerciseSeed {
  name: string
  muscleGroup: MuscleGroup
}

// Startbestand gängiger Übungen, vom Nutzer erweiterbar.
export const EXERCISE_SEED: ExerciseSeed[] = [
  { name: 'Bankdrücken', muscleGroup: 'Brust' },
  { name: 'Schrägbankdrücken', muscleGroup: 'Brust' },
  { name: 'Kurzhantel-Fliegende', muscleGroup: 'Brust' },
  { name: 'Dips', muscleGroup: 'Brust' },
  { name: 'Butterfly (Maschine)', muscleGroup: 'Brust' },
  { name: 'Liegestütze', muscleGroup: 'Brust' },
  { name: 'Kreuzheben', muscleGroup: 'Rücken' },
  { name: 'Klimmzüge', muscleGroup: 'Rücken' },
  { name: 'Latzug', muscleGroup: 'Rücken' },
  { name: 'Langhantelrudern', muscleGroup: 'Rücken' },
  { name: 'Kurzhantelrudern (einarmig)', muscleGroup: 'Rücken' },
  { name: 'Kabelrudern (sitzend)', muscleGroup: 'Rücken' },
  { name: 'Rückenstrecker', muscleGroup: 'Rücken' },
  { name: 'Kniebeuge', muscleGroup: 'Beine' },
  { name: 'Beinpresse', muscleGroup: 'Beine' },
  { name: 'Ausfallschritte', muscleGroup: 'Beine' },
  { name: 'Beinstrecker', muscleGroup: 'Beine' },
  { name: 'Beinbeuger', muscleGroup: 'Beine' },
  { name: 'Wadenheben (stehend)', muscleGroup: 'Beine' },
  { name: 'Hip Thrust', muscleGroup: 'Beine' },
  { name: 'Bulgarian Split Squat', muscleGroup: 'Beine' },
  { name: 'Schulterdrücken (Langhantel)', muscleGroup: 'Schultern' },
  { name: 'Schulterdrücken (Kurzhantel)', muscleGroup: 'Schultern' },
  { name: 'Seitheben', muscleGroup: 'Schultern' },
  { name: 'Frontheben', muscleGroup: 'Schultern' },
  { name: 'Reverse Butterfly', muscleGroup: 'Schultern' },
  { name: 'Face Pulls', muscleGroup: 'Schultern' },
  { name: 'Bizepscurls (Langhantel)', muscleGroup: 'Arme' },
  { name: 'Bizepscurls (Kurzhantel)', muscleGroup: 'Arme' },
  { name: 'Hammercurls', muscleGroup: 'Arme' },
  { name: 'Trizepsdrücken (Kabel)', muscleGroup: 'Arme' },
  { name: 'French Press', muscleGroup: 'Arme' },
  { name: 'Enges Bankdrücken', muscleGroup: 'Arme' },
  { name: 'Crunches', muscleGroup: 'Bauch' },
  { name: 'Plank', muscleGroup: 'Bauch' },
  { name: 'Beinheben (hängend)', muscleGroup: 'Bauch' },
  { name: 'Cable Crunch', muscleGroup: 'Bauch' },
  { name: 'Russian Twist', muscleGroup: 'Bauch' },
  { name: 'Burpees', muscleGroup: 'Ganzkörper' },
  { name: 'Kettlebell Swings', muscleGroup: 'Ganzkörper' },
]
