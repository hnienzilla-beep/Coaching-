import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { BackgroundPhotoEffect } from './lib/backgroundPhoto'
import { startAutoSync } from './features/obsidianSync/autoSync'
import { watchDatabaseChanges } from './features/obsidianSync/dbWatch'
import AthleteListPage from './pages/AthleteListPage'
import AthleteLayout from './pages/AthleteLayout'
import DashboardPage from './pages/DashboardPage'
import TrackingPage from './pages/TrackingPage'
import ErnaehrungPage from './pages/ErnaehrungPage'
import TrainingPage from './pages/TrainingPage'
import FoodDatabasePage from './pages/FoodDatabasePage'
import SupplementDatabasePage from './pages/SupplementDatabasePage'
import ExerciseDatabasePage from './pages/ExerciseDatabasePage'

function App() {
  // Auto-Sync läuft für die gesamte App-Laufzeit (beide Aufrufe sind idempotent, der
  // Doppelaufruf im React-StrictMode ist also unschädlich).
  useEffect(() => {
    watchDatabaseChanges()
    startAutoSync()
  }, [])

  return (
    <HashRouter>
      <BackgroundPhotoEffect />
      <Routes>
        <Route path="/" element={<AthleteListPage />} />
        <Route path="/lebensmittel" element={<FoodDatabasePage />} />
        <Route path="/supplemente" element={<SupplementDatabasePage />} />
        <Route path="/uebungen" element={<ExerciseDatabasePage />} />
        <Route path="/athlete/:athleteId" element={<AthleteLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tracking" element={<TrackingPage />} />
          <Route path="ernaehrung" element={<ErnaehrungPage />} />
          <Route path="training" element={<TrainingPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
