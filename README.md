# Bodybuilding Coach

Web-App (PWA) zum Tracken von Gewicht, Körperfettanteil, Kalorien/Makros und
Ernährungsplänen für beliebig viele Athleten. Portiert aus der Excel-Vorlage
"Bodybuilding_Coaching.xlsx" (Kalorienrechner nach Mifflin-St-Jeor,
7-Tage-Trend, Ernährungsplan mit Lebensmittel-Datenbank).

## Entwicklung

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Bei jedem Push auf `main` baut `.github/workflows/deploy.yml` die App und
veröffentlicht sie auf GitHub Pages (einmalig unter Settings → Pages →
Source: "GitHub Actions" aktivieren).

## Installation auf dem iPhone

1. Die Pages-URL in **Safari** öffnen (nicht Chrome - "Zum Home-Bildschirm
   hinzufügen" funktioniert auf iOS nur in Safari)
2. Teilen-Symbol → "Zum Home-Bildschirm hinzufügen"
3. App startet danach im Vollbild wie eine native App, alle Daten bleiben
   lokal auf dem Gerät (IndexedDB)

## Tech-Stack

Vite, React, TypeScript, Tailwind CSS, Dexie (IndexedDB), Recharts, jsPDF,
vite-plugin-pwa.
