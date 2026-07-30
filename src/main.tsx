import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme } from './lib/theme.ts'
import { applyStoredOverviewAccent } from './lib/accentColor.ts'

applyTheme(getStoredTheme())
applyStoredOverviewAccent()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
