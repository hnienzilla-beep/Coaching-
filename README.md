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

## Tests

```bash
npm test
```

Getestet werden die Markdown-Parser des Vault-Syncs (`markdownParse.test.ts`):
schreiben und wieder lesen muss denselben Datenstand ergeben.

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

Über "Obsidian-Sync" (Athletenübersicht) wird der **komplette Datenbestand des
gewählten Athleten** als Markdown-Dateien in ein GitHub-Repo geschrieben, das als
Obsidian-Vault dient. Nötig sind GitHub-Benutzername, Repo-Name und ein
Personal Access Token mit Schreibrecht auf dieses Repo.

| Datei | Inhalt |
|---|---|
| `20-Fitness/Athlet.md` | Stammdaten (Alter, Größe, Aktivität, Ziel, Makro-Faktoren, Zielgewicht, FFMI) als Frontmatter |
| `20-Fitness/Gewicht.md` | Tracking je Tag: Gewicht, KFA, Kalorien/Makros, Umfänge, Tagesnotiz |
| `20-Fitness/Uebungen.md` | Übungs-Datenbank (Muskelgruppe, Favorit) |
| `20-Fitness/Supplement-Datenbank.md` | Supplement-Stammdaten (Standarddosis, Timing, Notiz) |
| `20-Fitness/Trainingsplaene.md` | alle Trainingsplan-Phasen mit Sätzen, Wiederholungen, Zielgewicht, Notizen |
| `20-Fitness/Supplemente.md` | alle Supplementplan-Phasen |
| `20-Fitness/Training/<datum>.md` | Trainingslog je Tag: Plan, Start/Ende, Sätze, Übungs- und Trainingsnotiz |
| `40-Ernaehrung/Ernaehrungsplan.md` | alle Ernährungsplan-Phasen |
| `40-Ernaehrung/Lebensmittel.md` | Lebensmittel-Datenbank (Nährwerte je 100 g, Favorit, "Unbestätigt") |
| `40-Ernaehrung/Lebensmittel-Neu.md` | Eingang für neue Lebensmittel (siehe unten) |
| `40-Ernaehrung/Log/<datum>.md` | Ernährungslog je Tag: Plan, Abschluss, Mahlzeiten, Tagesnotiz |
| `90-Backup/fitness-app-backup.json` | verlustfreies Vollbackup - für alles, was Markdown nicht abbildet |

Nur auf dem Gerät bleiben **Übungsbilder** und das **Hintergrundfoto**: Bilder
gehören nicht in eine Markdowntabelle und würden den Vault stark aufblähen.
Synchronisiert wird immer der in den Sync-Einstellungen gewählte Athlet.

Der Sync läuft automatisch, solange die App geöffnet ist:

- kurz nach dem App-Start
- regelmäßig im eingestellten Intervall (5 Minuten bis täglich, Standard 15 Minuten)
- ca. 10 Sekunden nach jeder Datenänderung
- beim Zurückkehren in die App und sobald das Gerät wieder online ist

Jeder Durchlauf gleicht die **komplette Historie** ab, nicht nur die letzten Tage -
eine nachträglich korrigierte Trainingseinheit von vor drei Wochen landet also
auch im Vault. Bezahlbar bleibt das über den Dateibaum des Repos: Der wird einmal
pro Durchlauf in einer einzigen Anfrage geholt, danach überspringt der Sync jede
Datei, die sich weder im Vault noch in der App geändert hat, ohne weitere
Anfrage. Ein Durchlauf ohne Änderungen kostet damit genau eine GitHub-Anfrage und
erzeugt keine leeren Commits. Der **erste** Durchlauf nach dem Update schreibt
alle Dateien einmal neu.

Schlägt ein Sync fehl (kein Netz, Token abgelaufen), wird mit wachsendem Abstand
erneut versucht; offene Änderungen bleiben vermerkt und werden spätestens beim
nächsten App-Start nachgeholt.

### Lesen und Schreiben

Der Sync läuft in beide Richtungen ("Änderungen aus dem Vault übernehmen"): In
Obsidian bearbeitete Dateien werden eingelesen, bevor die App sie überschreibt.
Erkannt wird das am GitHub-SHA - nur Dateien, die sich seit dem letzten Sync im
Repo geändert haben, werden gelesen. So gleichen sich auch zwei Geräte über den
Vault ab.

- **Gewicht.md** wird zusammengeführt: Zeilen aus dem Vault werden übernommen,
  dort fehlende Tage bleiben in der App erhalten. Eine **leere Zelle** heißt
  "hier steht nichts", nicht "Wert löschen" - Tabellen werden in Obsidian gern
  gekürzt.
- **Tagesdateien und Plan-Phasen** (Training, Ernährungslog, Trainings-,
  Ernährungs- und Supplementplan) werden für den jeweiligen Tag bzw. die
  jeweilige Phase komplett ersetzt - so wirken auch im Vault gelöschte Zeilen.
- **Gelöscht wird über den Vault nur innerhalb** einer Tagesdatei oder
  Plan-Phase. Athleten, ganze Plan-Phasen, Übungen, Supplemente und Lebensmittel
  löschst du nur in der App: Sie sind aus Plänen und Logs referenziert, und ein
  halb geschriebener oder umgeräumter Vault soll sie nicht mitreißen. Eine im
  Vault fehlende Phase bleibt deshalb erhalten.
- **Stammdaten** (`Athlet.md`) landen immer im gewählten Athleten - über den
  Vault wird nie ein Athlet angelegt oder ausgetauscht. Unbekannte Werte bei
  Geschlecht, Aktivität und Ziel werden ignoriert, damit ein Tippfehler den
  Kalorienrechner nicht lahmlegt.
- Bei gleichzeitiger Änderung derselben Datei **gewinnt der Vault**.
- Unbekannte **Übungen und Supplemente** werden automatisch angelegt.
  Unbekannte **Lebensmittel in Tageslogs und Plänen** werden übersprungen und
  gemeldet - aus "80g (300 kcal)" lassen sich die Makros nicht zurückrechnen.
  Nachtragen lassen sie sich in `Lebensmittel.md` (dort stehen die Nährwerte
  dabei) oder über `Lebensmittel-Neu.md` (siehe unten).
- Zeilen, die nicht ins Format passen, werden ignoriert. Alles unter einer
  Überschrift `## Notizen` bleibt beim Zurückschreiben erhalten und wird nie als
  Daten gelesen - anders als `## Trainingsnotiz` und `## Tagesnotiz`, die zum
  jeweiligen Log gehören.

### Lebensmittel-Datenbank

Die komplette Lebensmitteltabelle liegt als `40-Ernaehrung/Lebensmittel.md` im Vault
(Nährwerte je 100 g, nach Namen sortiert, dazu die Spalten "Favorit" und
"Unbestätigt"). Die Namen stehen dort zeichengleich so wie in den Tageslogs - daran
hängt die Zuordnung beim Zurücklesen.

Die Tabelle läuft in **beide Richtungen**: Weil hier die Nährwerte dabeistehen,
werden dort geänderte Werte übernommen und neue Zeilen als Lebensmittel angelegt.
Gelöschte Zeilen löschen kein Lebensmittel. Wird das Häkchen in "Unbestätigt"
entfernt, gilt der Eintrag als bestätigt.

Zusätzlich liest der Sync `40-Ernaehrung/Lebensmittel-Neu.md`, falls vorhanden. Dort
lassen sich neue Lebensmittel vormerken, z.B. von Claude geschätzte Werte:

```markdown
| Name | kcal | Protein | KH | Fett | Herkunft |
|---|---|---|---|---|---|
| Popcorn (Kino, süß) | 450 | 5.5 | 72.0 | 12.5 | Claude 2026-07-29, geschätzt |
```

- Jede Zeile wird als neues Lebensmittel angelegt und als **unbestätigt** markiert -
  in der App ist so bei der Auswahl erkennbar, was nur geschätzt ist. Die Markierung
  verschwindet, sobald der Eintrag in der Lebensmittel-Datenbank gespeichert wird.
- Namen, die es in der Datenbank schon gibt, werden verworfen: die Datenbank hat
  Vorrang, geschätzte Werte überschreiben nie bestehende.
- Danach wird die Tabelle geleert (Datei und Tabellenkopf bleiben stehen).
  Fehlerhafte Zeilen (falsche Spaltenzahl, keine Zahlen) bleiben zur Korrektur stehen,
  der Rest wird trotzdem importiert.
- Der Import läuft vor dem Export, neue Einträge stehen also im selben Durchlauf schon
  in `Lebensmittel.md`.

### Vollbackup

Die Markdown-Dateien sind zum Lesen und Bearbeiten in Obsidian gedacht und bilden
deshalb nicht jedes Feld ab (interne IDs, Reihenfolgen). Diese Lücke schließt
`90-Backup/fitness-app-backup.json`: der komplette Datenbestand des gewählten
Athleten samt der globalen Datenbanken, verlustfrei und ohne Bilder. Die Datei wird
bei jedem Sync mitgeschrieben, aber nur auf Knopfdruck gelesen - "Backup aus Vault
wiederherstellen" im Sync-Dialog, gedacht für ein neues Gerät. Sie ist bewusst
deterministisch aufgebaut (keine Zeitstempel, stabile Sortierung), damit sie sich
nur bei echten Änderungen ändert.

Der laufende Sync liest nur Dateien, die sich im Vault seit dem letzten Sync
geändert haben. "Kompletten Vault einlesen" im Dialog liest dagegen den gesamten
Vault noch einmal ein, unabhängig davon - gedacht für ein neues Gerät oder zum
Wiederherstellen.

Wichtig: Die App hat keinen Server - läuft sie nicht (App geschlossen bzw. von
iOS beendet), ruht auch der Sync.

## Design

Die App ist in Schwarz gehalten: reines Schwarz (`#000000`) als Grundfläche, nur
minimal aufgehellte Karten- und Steuerflächen darüber und ein monochromer, weißer
Akzent. Farbe kommt bewusst nur an zwei Stellen dazu - über die frei wählbare
Akzentfarbe je Athlet und über die Semantikfarben für "ok" und "Fehler".

Alle Farben liegen als Tokens in `src/index.css` (`@theme` für das Schwarz-Design,
`.light` für den Hell-Modus als Umkehrung). Flächen, die den Akzent als Hintergrund
nutzen, verwenden `text-accent-fg` - dieser Wert wird für Athleten-Akzentfarben zur
Laufzeit anhand der Helligkeit auf Schwarz oder Weiß gesetzt
(`accentForeground` in `src/lib/theme.ts`), damit die Schrift bei jeder Farbe lesbar
bleibt.

## Tech-Stack

Vite, React, TypeScript, Tailwind CSS, Dexie (IndexedDB), Recharts, jsPDF,
vite-plugin-pwa.
