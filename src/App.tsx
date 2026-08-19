import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BackgroundPhotoEffect } from './lib/backgroundPhoto'
import { startAutoSync } from './features/obsidianSync/autoSync'
import { watchDatabaseChanges } from './features/obsidianSync/dbWatch'
import { startRestTimerRuntime } from './lib/restTimer'
import {
  ensureAthleteOrder,
  ensureExerciseSeed,
  ensureFoodSeed,
  ensurePlanMealOrder,
  ensureSupplementPlanItemOrder,
  ensureSupplementSeed,
  ensureTrainingPlanExerciseOrder,
  ensureWorkoutLogExerciseOrder,
  ensureWorkoutSetMigration,
} from './db/db'
import { dedupeNamedDatabases } from './db/dedupe'
import AthleteListPage from './pages/AthleteListPage'
import StartRedirect from './pages/StartRedirect'
import AthleteLayout from './pages/AthleteLayout'
import DashboardPage from './pages/DashboardPage'
import TrackingPage from './pages/TrackingPage'
import ErnaehrungPage from './pages/ErnaehrungPage'
import TrainingPage from './pages/TrainingPage'
import FoodDatabasePage from './pages/FoodDatabasePage'
import SupplementDatabasePage from './pages/SupplementDatabasePage'
import ExerciseDatabasePage from './pages/ExerciseDatabasePage'

function App() {
  // Auto-Sync und Pausen-Timer laufen für die gesamte App-Laufzeit (alle Aufrufe sind
  // idempotent, der Doppelaufruf im React-StrictMode ist also unschädlich).
  //
  // Die Seeds und Datenmigrationen hingen früher am Mount der Athletenübersicht. Die ist
  // keine Startseite mehr, deshalb laufen sie hier - insbesondere `ensureAthleteOrder`
  // vergibt das `order`, nach dem der Start-Athlet bestimmt wird.
  useEffect(() => {
    // Jeder Schritt für sich abgesichert: Vorher liefen alle als lose Aufrufe nebeneinander,
    // jetzt hängen sie in einer Kette - ohne das würde ein einzelner Fehlschlag alle
    // folgenden Migrationen überspringen und als unbehandelte Rejection enden.
    const step = async (run: () => Promise<unknown>): Promise<void> => {
      try {
        await run()
      } catch (error) {
        console.error('Datenvorbereitung fehlgeschlagen:', error)
      }
    }

    async function prepareData() {
      // Zuerst die Reihenfolge-Migrationen: Sie sind billig, und `ensureAthleteOrder` vergibt
      // das `order`, nach dem `StartRedirect` den Start-Athleten auswählt - das darf nicht
      // hinter dem Seed von 300 Lebensmitteln warten.
      await Promise.all(
        [
          ensureAthleteOrder,
          ensureTrainingPlanExerciseOrder,
          ensureWorkoutSetMigration,
          ensureWorkoutLogExerciseOrder,
          ensurePlanMealOrder,
          ensureSupplementPlanItemOrder,
        ].map(step),
      )

      // Seeds und Aufräumen laufen *vor* dem Auto-Sync. Vorher starteten beide gleichzeitig -
      // Seed und Vault-Import konnten dasselbe Lebensmittel nebeneinander anlegen, weil jeder
      // in seiner eigenen Transaktion einen Bestand vorfand, in dem es noch fehlte. Genau
      // daher die Dubletten.
      await Promise.all([ensureFoodSeed, ensureSupplementSeed, ensureExerciseSeed].map(step))
      await step(dedupeNamedDatabases)
    }

    startRestTimerRuntime()
    void prepareData().finally(() => {
      watchDatabaseChanges()
      startAutoSync()
    })
  }, [])

  return (
    <HashRouter>
      <BackgroundPhotoEffect />
      <Routes>
        <Route path="/" element={<StartRedirect />} />
        <Route path="/athleten" element={<AthleteListPage />} />
        <Route path="/lebensmittel" element={<FoodDatabasePage />} />
        <Route path="/supplemente" element={<SupplementDatabasePage />} />
        <Route path="/uebungen" element={<ExerciseDatabasePage />} />
        <Route path="/athlete/:athleteId" element={<AthleteLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tracking" element={<TrackingPage />} />
          <Route path="ernaehrung" element={<ErnaehrungPage />} />
          <Route path="training" element={<TrainingPage />} />
        </Route>
        {/* Ohne Auffangroute rendert eine unbekannte Hash-Adresse eine leere Seite. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
