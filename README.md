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

Über "Obsidian-Sync" (Zahnrad-Menü in der Kopfzeile des Athleten) wird der **komplette Datenbestand des
gewählten Athleten** als Markdown-Dateien in ein GitHub-Repo geschrieben, das als
Obsidian-Vault dient. Nötig sind GitHub-Benutzername, Repo-Name und ein
Personal Access Token mit Schreibrecht auf dieses Repo.

| Datei | Inhalt |
|---|---|
| `20-Fitness/Athlet.md` | Stammdaten (Alter, Größe, Aktivität, Ziel, Makro-Faktoren, Zielgewicht, FFMI) als Frontmatter, dazu die daraus gerechnete Kalorien- und Makro-Vorgabe |
| `20-Fitness/Gewicht.md` | Tracking je Tag: Gewicht, KFA, Kalorien/Makros, Umfänge, Tagesnotiz |
| `20-Fitness/Uebungen.md` | Übungs-Datenbank (Muskelgruppe, Favorit) |
| `20-Fitness/Supplement-Datenbank.md` | Supplement-Stammdaten (Standarddosis, Timing, Notiz) |
| `20-Fitness/Trainingsplaene.md` | alle Trainingsplan-Phasen mit Sätzen, Wiederholungen, Zielgewicht, Notizen |
| `20-Fitness/Supplemente.md` | alle Supplementplan-Phasen |
| `20-Fitness/Training/<datum>.md` | Trainingslog je Tag: Plan, Start/Ende, Sätze, Übungs- und Trainingsnotiz |
| `40-Ernaehrung/Ernaehrungsplan.md` | alle Ernährungsplan-Phasen, je Phase Vorgabe, Gesamt und Differenz |
| `40-Ernaehrung/Lebensmittel.md` | Lebensmittel-Datenbank (Nährwerte je 100 g, Favorit, "Unbestätigt") |
| `40-Ernaehrung/Lebensmittel-Neu.md` | Eingang für neue Lebensmittel (siehe unten) |
| `40-Ernaehrung/Log/<datum>.md` | Ernährungslog je Tag: Plan, Abschluss, Mahlzeiten, Vorgabe/Gegessen/Differenz, Tagesnotiz |
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
- Die **Kalorien- und Makro-Vorgabe** wird nur geschrieben, nie gelesen (siehe
  unten).

### Kalorien- und Makro-Vorgabe

Was der Kalorienrechner aus den Stammdaten ergibt, steht mit im Vault - so lässt
sich in Obsidian ablesen und auswerten, wogegen ein Tag oder ein Plan gemessen
wird:

- `Athlet.md`: `grundumsatz_kcal`, `gesamtumsatz_kcal`, `ziel_kalorien`,
  `ziel_protein_g`, `ziel_kohlenhydrate_g`, `ziel_fett_g` im Frontmatter, dazu
  ein Abschnitt "Vorgabe" im Text.
- `Ernaehrungsplan.md`: dieselben `ziel_*`-Felder im Frontmatter, je Phase eine
  Zeile **Vorgabe**, **Gesamt** und **Differenz**.
- `Log/<datum>.md`: dieselben `ziel_*`-Felder im Frontmatter, im Text
  **Vorgabe**, **Gegessen** (nur abgehakte Einträge, wie in der App) und
  **Differenz**.

Diese Werte sind reine Ausgabe: Werden sie in Obsidian geändert, überschreibt
der nächste Sync sie wieder. Stellschrauben sind die Stammdaten in `Athlet.md`
(Gewicht, Aktivität, Ziel, `kalorien_anpassung`, Protein/Fett pro Kilogramm).
Ändert sich die Vorgabe, schreibt der nächste Durchlauf die betroffenen Dateien
einmal neu - auch die Tagesdateien der Vergangenheit, die immer die aktuelle
Vorgabe zeigen.

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
geändert haben. "Vault einlesen (letzte 3 Tage)" im Dialog liest dagegen noch
einmal ein, unabhängig davon: Stammdaten, Datenbanken und Pläne komplett, die
Tagesdateien für Training und Ernährung nur für die letzten drei Tage. Die Grenze
ist Absicht - jede Tagesdatei kostet eine eigene GitHub-Anfrage, ein Vault mit
einem Jahr Historie käme so auf mehrere hundert. Für ein neues Gerät ist ohnehin
"Backup aus Vault wiederherstellen" der richtige Weg: Dort steckt der komplette
Datenbestand in einer einzigen Datei.

Wichtig: Die App hat keinen Server - läuft sie nicht (App geschlossen bzw. von
iOS beendet), ruht auch der Sync.

## Doppelte Einträge

IDs vergibt die App pro Browser-Profil zufällig: Dasselbe Lebensmittel heißt auf dem
iPhone und auf dem Rechner gleich, hat dort aber je eine eigene ID. Jeder Import, der
Zeilen nur über die ID zusammenführt, legt deshalb alles neu an, was er nicht
wiedererkennt - nach einem "Backup aus Vault wiederherstellen" auf einem Gerät, das
seine Datenbanken schon selbst angelegt hatte, stand früher jedes Lebensmittel, jede
Übung und jedes Supplement zweimal in der App, samt der daran hängenden Pläne.

Dagegen greifen zwei Dinge:

- **Beim Import** (`resolveReferencesByName` in `src/db/db.ts`) bekommen Lebensmittel,
  Übungen und Supplemente aus der Datei die ID des schon vorhandenen Eintrags gleichen
  Namens; die Verweise der importierten Pläne und Logs werden mit umgeschrieben. Denselben
  Namensschlüssel (`src/lib/names.ts`, `nameKey`) benutzen auch der Vault-Import, die
  Startdaten und die Plan-Vorlagen - sonst legt die eine Stelle an, was die andere für
  vorhanden hält.
- **Beim Start** räumt `ensureNoDuplicates` (`src/db/dedupe.ts`) auf, was schon in der
  Datenbank steht: gleichnamige Stammdaten werden zusammengeführt und alle Verweise
  umgehängt, mehrfach vorhandene Tage (Tracking, Trainings-, Ernährungslog) zu einem
  verschmolzen (leere Felder werden dabei aus den Doppelgängern gefüllt), gleichnamige
  Plan-Phasen je Athlet zusammengelegt und Kind-Zeilen entfernt, die danach in jedem Feld
  übereinstimmen. Überlebender ist immer der Datensatz mit den meisten Daten bzw. den
  meisten Verweisen; ein Eintrag ohne Doppelgänger wird nie angefasst.

**Athleten** bleiben dabei außen vor: Zwei Athleten mit gleichem Namen können auch zwei
verschiedene Personen sein. Sie werden nur über "Doppelte Einträge bereinigen" in der
Athletenverwaltung zusammengeführt - dort steht vorher, was passieren würde.

## Start und Athletenwechsel

Die App startet **direkt im zuletzt geöffneten Athleten** - eine Athletenübersicht als
Startbildschirm gibt es nicht mehr. Wurde der gemerkte Athlet gelöscht, wird der erste der
Reihenfolge genommen; ist überhaupt keiner angelegt, steht das Anlege-Formular als
Begrüßungsbildschirm da (in jeder Ansichts-Stufe, sonst wäre eine frische Installation eine
Sackgasse).

Gewechselt wird über den **Namen in der Kopfzeile**: Ab zwei Athleten klappt er zu einer Liste
auf, bei nur einem steht dort schlicht der Name. Angelegt, sortiert, gelöscht sowie exportiert
und importiert wird unter "👥 Athleten verwalten" (Zahnrad-Menü oder Athletenliste), ab Stufe
Normal.

## Ansichts-Stufen

Wie viel die App zeigt, steuert eine von drei Stufen (Zahnrad-Menü in der Kopfzeile des
Athleten → "Ansicht"):

| Stufe | Was zu sehen ist |
|---|---|
| **Einfach** | Nur das Nötigste, gedacht für den Einstieg. Alles Zusätzliche wird gar nicht erst gezeichnet - es lässt sich also auch nicht aufklappen. Weg fallen: Kalorien-Anpassung, Grund- und Gesamtumsatz und der PDF-Bericht im Dashboard; KFA- und Körpermaße-Diagramm, "Fortschritt teilen" sowie Makro- und Umfangsfelder im Tracking (dort bleiben Gewicht, KFA und Notiz); der Kraft-Verlauf im Trainings-Log; Athletenverwaltung, Datenbanken und Obsidian-Sync im Zahnrad-Menü. Athleten wechseln bleibt möglich. |
| **Normal** | Tracking und Pläne ohne Coach-Details. |
| **Coach** | Alle Felder, Auswertungen und Export-Funktionen; die Pläne lassen sich bearbeiten. Standard. |

Die Stufe gilt für das ganze Gerät und liegt in `localStorage` (`src/lib/detailLevel.ts`). Sie
ersetzt die früheren Schalter "Coach-Modus" und "Karten einklappen": Ein vorhandener
Coach-Modus wird beim ersten Start übernommen (aus → "Normal", an → "Coach").

## Pläne

Trainings-, Ernährungs- und Supplementplan teilen sich denselben Kopf
(`src/components/PlanPhaseHeader.tsx`): Name der Phase, an welcher Stelle sie steht
("Tag 2 von 3") und wie viel drinsteht. Darunter steht die Übersicht aller Phasen, und die
hat zwei Gestalten:

- **Beim Lesen** eine Chip-Leiste zum Umschalten. Jeder Chip trägt die Zahl seiner Einträge,
  leere Phasen bleiben ohne Zahl. Die aktive Phase wird in den sichtbaren Ausschnitt
  gescrollt, wenn die Leiste breiter ist als der Bildschirm.
- **Beim Bearbeiten** (Stufe Coach → "Bearbeiten") eine Liste mit Zuggriff ⠿: Die Phasen
  lassen sich per Drag & Drop umsortieren, die Reihenfolge steht danach überall so - auch in
  der Planauswahl der beiden Logs und im Vault. Verschieben wechselt die Phase nicht;
  angezeigt bleibt die, die gerade bearbeitet wird.

Chips und Sortierliste sind bewusst getrennt: Ein waagerecht scrollender Streifen und Drag &
Drop sind auf dem Touchscreen dieselbe Wischbewegung und kämen sich sonst in die Quere.

Auch die **Zeilen innerhalb einer Phase** lassen sich im Bearbeiten-Modus am Zuggriff
verschieben - im Trainingsplan über den ganzen Tag hinweg, im Ernährungs- und
Supplementplan innerhalb einer Mahlzeit bzw. eines Einnahmezeitpunkts (die Gruppe wechselt
man über das Auswahlfeld der Zeile, nicht durch Ziehen). Die Reihenfolge der Supplemente
landet auch in `Supplemente.md`; umgekehrt wird die Reihenfolge der Datei beim Einlesen
übernommen.

## Design

Die App ist in Schwarz gehalten: reines Schwarz (`#000000`) als Grundfläche, nur
minimal aufgehellte Karten- und Steuerflächen darüber und ein monochromer, weißer
Akzent. Farbe kommt bewusst nur an zwei Stellen dazu - über die frei wählbare
Akzentfarbe und über die Semantikfarben für "ok" und "Fehler".

Die Akzentfarbe ist an zwei Stellen einstellbar: je Athlet (Farbkreis in der
Kopfzeile des Athleten) und für alle Seiten außerhalb eines Athleten (Farbknopf in
der Kopfzeile der Athletenverwaltung, "Standard" nimmt wieder den Akzent
des Themes). Die Übersichtsfarbe liegt in `localStorage`
(`src/lib/accentColor.ts`), innerhalb eines Athleten überschreibt dessen eigene
Farbe sie und beim Verlassen wird sie wiederhergestellt.

Statt der schwarzen Grundfläche lässt sich ein eigenes Hintergrundbild setzen
(Zahnrad-Menü → "Hintergrundbild wählen"). Es liegt als fester Layer hinter der
gesamten App und füllt in jeder Ansicht den ganzen Screen inklusive der
Safe-Areas; Karten und Leisten werden dann durchscheinend. Wichtig für iOS: Der
Layer wird auf die *größte* Viewport-Höhe (`100lvh`) gezogen - mit der
dynamischen Höhe (`100dvh`) bliebe unten ein schwarzer Streifen, sobald Safari
seine Leisten ausblendet.

Alle Farben liegen als Tokens in `src/index.css` (`@theme` für das Schwarz-Design,
`.light` für den Hell-Modus als Umkehrung). Flächen, die den Akzent als Hintergrund
nutzen, verwenden `text-accent-fg` - dieser Wert wird für eingestellte Akzentfarben zur
Laufzeit anhand der Helligkeit auf Schwarz oder Weiß gesetzt
(`accentForeground` in `src/lib/theme.ts`), damit die Schrift bei jeder Farbe lesbar
bleibt.

## Tech-Stack

Vite, React, TypeScript, Tailwind CSS, Dexie (IndexedDB), Recharts, jsPDF,
vite-plugin-pwa.
