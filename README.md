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

## Obsidian-Vault-Sync

Über "Obsidian-Sync" (Athletenübersicht) werden Gewicht, Training, Supplemente
und Ernährung als Markdown-Dateien in ein GitHub-Repo geschrieben, das als
Obsidian-Vault dient. Nötig sind GitHub-Benutzername, Repo-Name und ein
Personal Access Token mit Schreibrecht auf dieses Repo.

Der Sync läuft automatisch, solange die App geöffnet ist:

- kurz nach dem App-Start
- regelmäßig im eingestellten Intervall (5 Minuten bis täglich, Standard 15 Minuten)
- ca. 10 Sekunden nach jeder Datenänderung
- beim Zurückkehren in die App und sobald das Gerät wieder online ist

Unveränderte Dateien werden übersprungen, damit im Vault keine leeren Commits
entstehen. Schlägt ein Sync fehl (kein Netz, Token abgelaufen), wird mit
wachsendem Abstand erneut versucht; offene Änderungen bleiben vermerkt und
werden spätestens beim nächsten App-Start nachgeholt.

Wichtig: Die App hat keinen Server - läuft sie nicht (App geschlossen bzw. von
iOS beendet), ruht auch der Sync. "Jetzt synchronisieren" im Dialog schreibt
immer alle Dateien neu, auch bereits synchronisierte.

## Tech-Stack

Vite, React, TypeScript, Tailwind CSS, Dexie (IndexedDB), Recharts, jsPDF,
vite-plugin-pwa.
