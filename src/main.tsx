import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startTheme } from './lib/theme.ts'
import { applyStoredOverviewAccent } from './lib/accentColor.ts'
import { initScrollReveal } from './lib/scrollReveal.ts'

startTheme()
applyStoredOverviewAccent()
initScrollReveal()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
