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
import { ensureNoDuplicates } from './db/dedupe'
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
    watchDatabaseChanges()
    startAutoSync()
    startRestTimerRuntime()
    // Der Reihe nach: erst die Seeds und Migrationen, dann die Bereinigung - sie soll den
    // fertigen Datenbestand sehen und nicht mitten in einem Nachtrag messen.
    void (async () => {
      await ensureFoodSeed()
      await ensureSupplementSeed()
      await ensureExerciseSeed()
      await ensureTrainingPlanExerciseOrder()
      await ensureWorkoutSetMigration()
      await ensureWorkoutLogExerciseOrder()
      await ensurePlanMealOrder()
      await ensureSupplementPlanItemOrder()
      await ensureAthleteOrder()
      await ensureNoDuplicates()
    })()
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
