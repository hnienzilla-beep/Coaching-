import { HashRouter, Route, Routes } from 'react-router-dom'
import AthleteListPage from './pages/AthleteListPage'
import AthleteLayout from './pages/AthleteLayout'
import DashboardPage from './pages/DashboardPage'
import TrackingPage from './pages/TrackingPage'
import NutritionPage from './pages/NutritionPage'
import PhotosPage from './pages/PhotosPage'
import FoodDatabasePage from './pages/FoodDatabasePage'
import SupplementPlanPage from './pages/SupplementPlanPage'
import SupplementDatabasePage from './pages/SupplementDatabasePage'
import TrainingPlanPage from './pages/TrainingPlanPage'
import WorkoutLogPage from './pages/WorkoutLogPage'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AthleteListPage />} />
        <Route path="/lebensmittel" element={<FoodDatabasePage />} />
        <Route path="/supplemente" element={<SupplementDatabasePage />} />
        <Route path="/athlete/:athleteId" element={<AthleteLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tracking" element={<TrackingPage />} />
          <Route path="ernaehrung" element={<NutritionPage />} />
          <Route path="supplemente" element={<SupplementPlanPage />} />
          <Route path="trainingsplan" element={<TrainingPlanPage />} />
          <Route path="trainingslog" element={<WorkoutLogPage />} />
          <Route path="fotos" element={<PhotosPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
