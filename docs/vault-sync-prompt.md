# Prompt: Git-Repo als Sync-Backend ("Vault-Sync")

Dieses Dokument ist als **Prompt für eine andere App** gedacht: Es beschreibt Aufbau und
Funktionsweise des Obsidian-Vault-Syncs dieser App so, dass eine andere App (oder ein anderes
Modell) dieselbe Architektur nachbauen kann. Teil A ist die übertragbare Mechanik, Teil B die
konkreten Regeln dieser Implementierung als Referenz.

---

## Teil A — Der Prompt

> Baue mir eine Sync-Funktion nach folgendem Muster. Das Muster stammt aus einer serverlosen
> PWA, die ihre Daten in IndexedDB hält und ein GitHub-Repo als einziges Backend benutzt.

### 1. Ausgangslage und Ziel

Die App ist **rein clientseitig**: alle Daten liegen lokal (IndexedDB/SQLite/Dateisystem), es
gibt keinen eigenen Server und keine Datenbank in der Cloud. Trotzdem sollen:

- die Daten auf **mehreren Geräten** zusammenlaufen,
- der Bestand **außerhalb der App les- und bearbeitbar** sein (hier: in Obsidian als Markdown),
- ein **Backup** existieren, das ein neues Gerät in einem Schritt aufsetzt.

Lösung: Ein **Git-Repo ist die Sync-Ebene**. Die App schreibt ihren Datenbestand als
menschenlesbare Dateien in das Repo und liest dort vorgenommene Änderungen zurück. Zugriff
ausschließlich über die GitHub Contents-/Trees-API (`fetch`), kein Git-Client im Browser.

Konsequenz, die explizit kommuniziert werden muss: **Ohne laufende App kein Sync.** Schließt der
Nutzer die App (oder friert iOS die PWA ein), ruht der Abgleich.

### 2. Zwei Repräsentationen, nicht eine

Schreibe jeden Datensatz in **zwei Formen**:

1. **Menschenlesbare Dateien** (Markdown mit YAML-Frontmatter, Tabellen, Checklisten). Sie sind
   der Bearbeitungs-Kanal: verlustbehaftet (keine internen IDs, keine Reihenfolgen), dafür in
   jedem Editor änderbar. Referenzen zwischen Dateien laufen über **Namen**, nicht über IDs —
   `nameKey(x) = x.trim().toLowerCase()`.
2. **Ein deterministisches JSON-Vollbackup** einer einzigen Datei. Verlustfrei, nie automatisch
   gelesen, nur auf Knopfdruck ("Backup wiederherstellen"). Deterministisch heißt: keine
   Zeitstempel, Tabellen alphabetisch, Zeilen nach ID sortiert, Objekt-Schlüssel sortiert —
   sonst erzeugt jeder Durchlauf einen Commit, obwohl sich nichts geändert hat.

Große Binärdaten (Bilder, Fotos) bleiben lokal und werden aus dem Backup herausgefiltert.

### 3. Der Kern: dreistufige Änderungserkennung

Jeder Durchlauf gleicht die **komplette Historie** ab, nicht nur die letzten Tage — eine
nachträglich korrigierte Datei von vor drei Wochen muss ankommen. Bezahlbar wird das nur durch
diese drei Stufen, in dieser Reihenfolge:

**Stufe 0 — ein Dateibaum pro Durchlauf.**
`GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1` liefert in **einer** Anfrage `Pfad →
Blob-SHA` für das ganze Repo. Ist die Antwort `truncated` (sehr großes Repo), leer (kein Commit,
404/409) oder unlesbar → `null` zurückgeben und pro Datei auf Einzellesen zurückfallen. Der Baum
ist eine Optimierung, keine Voraussetzung.

**Stufe 1 — Cache pro Datei.** In `localStorage` liegt je Datei ein Eintrag mit zwei Feldern:

| Feld | Bedeutung |
|---|---|
| `sha` | Der Blob-SHA im Repo beim letzten Sync. Weicht der Baum-SHA davon ab → **remote geändert**. |
| `hash` | Kurz-Hash (djb2, 32 bit, plus Länge) des Inhalts, den die App zuletzt gebaut hat. Weicht der aktuelle Bau davon ab → **lokal geändert**. |

`null` heißt „unbekannt" → im Zweifel lesen. Alte Formate (nur ein SHA-String) müssen beim Lesen
migriert werden. Der Hash ist bewusst synchron und nicht kryptographisch (`crypto.subtle` ist
async, hier geht es nur um „gleich oder nicht").

**Stufe 2 — Inhaltsvergleich.** Wenn doch gelesen werden musste: Stimmt der gelesene Inhalt
zeichengleich mit dem überein, was die App schreiben würde, wird nicht geschrieben — der Cache
wird nur aufgefrischt.

Ergebnis: **Ein Durchlauf ohne Änderungen kostet genau eine GitHub-Anfrage** und erzeugt keinen
leeren Commit.

### 4. Der Abgleich einer einzelnen Datei

Zentrale Funktion `syncFile({ path, build, commitMessage, importRemote?, preserveNotes?, tree? })`.
`build()` erzeugt den Dateiinhalt aus dem aktuellen lokalen Stand und darf `null` liefern
(„dazu hat die App nichts", z.B. ein Tag ohne Eintrag). Ablauf:

1. `built = build()`, `builtHash = hash(built)`.
2. Mit Baum: `treeSha === cache.sha && builtHash === cache.hash` → **fertig, keine Anfrage**.
   `treeSha === null && built === null` → fertig. `treeSha === null` → nicht lesen (spart 404).
3. Sonst Datei lesen (`GET contents/{path}`, Base64 → UTF-8; Dateien > 1 MB liefert GitHub ohne
   Inhalt, also defensiv behandeln).
4. Gelesener Inhalt == zu schreibender Inhalt → Cache auffrischen, fertig.
5. `remote.sha !== cache.sha` (anderswo geändert) und Zwei-Wege-Sync aktiv → **erst importieren**,
   dann `build()` erneut aufrufen und das Ergebnis zurückschreiben. **Bei gleichzeitiger Änderung
   derselben Datei gewinnt also die Remote-Seite**, weil die App ihren Stand nach dem Import neu
   aus der zusammengeführten Datenbank baut.
6. Schreiben mit `PUT contents/{path}` und dem gelesenen `sha` als Optimistic Lock. `409`/`422`
   = jemand war zwischendurch schneller → **eigene Fehlerklasse**, und der Abgleich dieser einen
   Datei läuft genau einmal frisch ohne Baum durch, statt den ganzen Sync abzubrechen.

Zusatzregel: Alles ab einer Überschrift `## Notizen` gehört dem Nutzer. Der Block wird vor dem
Zurückschreiben aus der Remote-Datei extrahiert und unverändert wieder angehängt. Für reine
Datenbank-Abzüge abschaltbar (`preserveNotes: false`).

Für Dateien, die die App **nicht bauen kann** (z.B. ein Eingangskorb, den der Nutzer füllt und
den die App nach dem Import leert), gibt es die Bausteine einzeln: `hasRemoteChanged(path, tree)`,
`readFile`, `writeFile`, `rememberRemoteSha`.

### 5. Löschsemantik — die wichtigste Design-Entscheidung

Eine fehlende Zeile in einer handbearbeiteten Datei ist **mehrdeutig**: gelöscht oder nur gekürzt?
Löse das nicht global, sondern pro Dateiart, und schreibe die Regel in die Datei selbst hinein:

| Dateiart | Import-Semantik |
|---|---|
| Tabellen mit Zeitreihen-Charakter | **Zusammenführen**. Vorhandene Zeilen übernehmen, fehlende Zeilen ändern nichts. Eine **leere Zelle** heißt „hier steht nichts", nicht „Wert löschen". |
| Tages-/Container-Dateien, Plan-Phasen | **Ersetzen** — aber nur innerhalb des Containers. So wirken dort gelöschte Zeilen. |
| Referenzierte Stammdaten (Kataloge, Entitäten, ganze Phasen) | **Nie über die Datei löschen.** Sie hängen an Fremdschlüsseln; ein halb geschriebener Vault soll sie nicht mitreißen. Löschen passiert ausschließlich in der App. |

Weitere Schutzregeln, die sich bewährt haben:

- Eine **leere oder unlesbare** Container-Datei löscht nichts („lieber nichts tun als Daten
  verlieren").
- Lässt sich in einer Phase **kein einziger** Eintrag auflösen, war die Datei vermutlich
  handgeschrieben → Phase unangetastet lassen.
- **Frontmatter-Formatversion** (`format: 2`) mitschreiben. Löschende bzw. flag-setzende Semantik
  nur für Dateien dieser Version erlauben. Alles ohne Marker stammt aus einer älteren App-Version,
  war also von Anfang an unvollständig — dort nur zusammenführen. Ohne diese Regel entfernt das
  erste Update nach einem Format-Wechsel flächendeckend Häkchen.
- **Unbekannte Referenzen**: anlegen, wenn die Datei genug Information dafür enthält (eine Übung
  braucht nur einen Namen). Überspringen und **melden**, wenn nicht (aus „80 g (300 kcal)" lassen
  sich keine Nährwerte zurückrechnen). Niemals raten.
- **Abgeleitete Werte** (alles, was die App aus Stammdaten rechnet) werden geschrieben, aber nie
  gelesen. In der Datei dazuschreiben, dass Änderungen daran wirkungslos sind, und benennen,
  welche Felder die echten Stellschrauben sind.
- Auswahlfelder nur übernehmen, wenn der Wert zu den bekannten Stufen passt; Zahlen nur im
  erlaubten Bereich. Ein Tippfehler darf keine Rechenlogik lahmlegen — er wird als
  „übersprungen" gemeldet.
- Zeilen, die nicht ins Format passen, werden ignoriert statt zu einem Abbruch zu führen.

### 6. Reihenfolge innerhalb eines Durchlaufs

Zwingend, weil die Auflösung über Namen läuft:

1. Stammdaten
2. **Eingangskorb** für neue Katalogeinträge (falls vorhanden) — vor dem Katalog-Export, damit
   Neues im selben Durchlauf schon in der Katalogdatei steht
3. Kataloge / Referenztabellen
4. Pläne
5. Tagesdateien (absteigend nach Datum, damit bei Netzabbruch das Aktuelle steht)
6. **Zum Schluss** das JSON-Vollbackup — es soll den Stand *nach* allen Importen dieses
   Durchlaufs enthalten

Welche Tage abgeglichen werden: alle Tage mit Daten **plus** die letzten N Tage (hier 3), auch
wenn die App dafür nichts hat — sonst käme ein gestern extern nachgetragener Eintrag nie an.

### 7. Scheduler

Ein einzelner, idempotent startbarer Scheduler mit diesen Auslösern:

| Auslöser | Verhalten |
|---|---|
| App-Start | einmal nach ~5 s (App soll erst fertig laden), dann Fälligkeitsprüfung |
| Intervall-Tick | alle 60 s prüfen, ob das eingestellte Intervall (5 min … 24 h, Standard 15 min) abgelaufen ist |
| Datenänderung | entprellt ~10 s nach der letzten Änderung |
| Tageswechsel | fällig, sobald der letzte Sync an einem anderen Kalendertag lag (neue Tagesdateien) |
| `visibilitychange` / `focus` / `online` | Fälligkeitsprüfung |
| App geht in den Hintergrund (`pagehide`, `hidden`) | offene Änderungen sofort loswerden, bevor das OS die App einfriert |

Zusätzliche Bremsen und Absicherungen:

- **Mindestabstand** (60 s) zwischen zwei Durchläufen, damit schnelle Eingaben nicht dauernd
  hochladen.
- **Backoff** nach Fehlversuchen: 1 min → 5 min → 15 min → 30 min. Der Backoff bremst auch die
  änderungsgetriebenen Syncs, sonst löst ein abgelaufener Token bei jedem Tastendruck eine
  Anfrage aus.
- **Re-Run-Flag**: Änderungen, die *während* eines Durchlaufs eintreffen, setzen ein Flag; der
  Durchlauf wiederholt sich direkt im Anschluss in einer `do/while`-Schleife. Erst danach gilt
  „alles hochgeladen".
- **Import-Sperre** (Zähler, `withVaultImport(fn)`): Während ein Import läuft, wird in dieselben
  Tabellen geschrieben, die der Auto-Sync beobachtet. Ohne diese Sperre triggert jeder Import
  sofort den nächsten Sync — Endlosschleife.
- **Offline**: `navigator.onLine === false` → gar nicht erst versuchen.

### 8. Änderungserkennung an der Datenbank

Nicht jede Seite soll „ich habe was geändert" aufrufen müssen. Hänge dich zentral an die
Schreib-Hooks der relevanten Tabellen (Dexie: `creating` / `updating` / `deleting`) und rufe von
dort den entprellten Trigger. Die Liste der beobachteten Tabellen ist explizit — rein optische
Tabellen (Hintergrundbild o.ä.) gehören nicht dazu. Tabellen, die es in der aktuellen
Schema-Version noch nicht gibt, überspringen statt zu werfen.

### 9. Zustand und Oberfläche

Ein kleiner Observable-Store (`subscribe`/`getSnapshot`, in React über `useSyncExternalStore`) mit:

```ts
{ running, lastSyncAt, lastError, pendingChanges, lastImport }
```

Alles außer `running` wird in `localStorage` gespiegelt — **`pendingChanges` ist der Grund**:
Wird die App mitten im Sync vom OS beendet, weiß der nächste Start, dass noch etwas offen ist,
und holt es nach. Schreibfehler beim Spiegeln (Speicher voll, Private Mode) dürfen den Sync nicht
scheitern lassen; der In-Memory-Zustand reicht für die Sitzung.

Pro Durchlauf wird ein **Import-Protokoll** gesammelt (`{ label, changed, skipped[] }` je
Datenart) und als Kurzfassung angezeigt: `"Gewicht (12), Training 2026-07-28 (4, 2 übersprungen)"`.
So sieht der Nutzer, was aus dem Repo kam und was nicht zugeordnet werden konnte.

Der Einstellungsdialog braucht: Zugangsdaten + Zielauswahl, „Verbindung testen" (unterscheidet
404 → Repo/Name falsch, 401/403 → Token ungültig, Netzfehler), Auto-Sync-Schalter,
Intervall-Auswahl, Zwei-Wege-Schalter, „Jetzt synchronisieren", „Vault einlesen (letzte 3 Tage)"
und „Backup wiederherstellen".

### 10. Manuelle Sonderwege

- **`syncNow()`**: ignoriert Intervall und Backoff, meldet Fehler an den Aufrufer (statt sie nur
  in den Status zu schreiben).
- **„Repo einlesen (letzte N Tage)"**: liest unabhängig vom SHA-Vergleich neu ein — Stammdaten,
  Kataloge und Pläne komplett, Tagesdateien nur für die letzten N Tage. Die Grenze ist Absicht:
  jede Tagesdatei kostet eine eigene Anfrage, ein Jahr Historie wären hunderte. Wichtig: Jede so
  gelesene Datei muss ihren SHA in den Cache schreiben, sonst hält der nächste Sync alles für
  verändert und liest ein zweites Mal.
- **„Backup wiederherstellen"**: der richtige Weg für ein neues Gerät — kompletter Bestand aus
  einer einzigen Datei. Bestehende Datensätze mit gleicher ID werden überschrieben, alles andere
  bleibt.

### 11. Fehlerbehandlung

Eigene Fehlerklassen (`SyncError`, davon abgeleitet `SyncConflictError`) mit Meldungen in der
Sprache des Nutzers und mit Handlungsanweisung („Token ungültig oder ohne Schreibrechte"). HTTP
sauber unterscheiden: 401/403 = Zugriff, 404 = nicht vorhanden (bei `readFile` legitim → `null`),
409/422 = Konflikt, Netzfehler = eigene Meldung. Ein Fehler beim Schreiben einer Datei bricht den
Durchlauf ab, aber `pendingChanges` bleibt gesetzt — es geht nichts verloren, es dauert nur länger.

### 12. Sicherheit und Grenzen

- Der Token liegt in `localStorage`. Das ist eine bewusste Abwägung für eine App ohne Server —
  benenne sie, und rate zu einem Token mit **minimalem Scope auf genau dieses eine Repo**
  (fine-grained PAT, nur Contents: Read/Write). Das Repo sollte privat sein.
- Base64-Umwandlung muss UTF-8-sicher sein (`TextEncoder`/`TextDecoder`), `btoa`/`atob` allein
  können nur Latin-1 und zerstören Umlaute.
- Pfade segmentweise URL-kodieren, `/` als Trenner erhalten.
- Es gibt keine Transaktion über mehrere Dateien: Ein abgebrochener Durchlauf hinterlässt ein
  teilweise aktualisiertes Repo. Das ist tolerierbar, weil jede Datei für sich konsistent ist und
  der nächste Durchlauf nachzieht — aber es muss so entworfen sein, dass es tolerierbar *ist*
  (keine Datei, deren Bedeutung von einer anderen abhängt).

### 13. Tests

Der wertvollste Test ist der **Roundtrip**: bauen → parsen → mit dem Ausgangsdatenstand
vergleichen. Er sichert die Invariante ab, an der der ganze Sync hängt — was die App schreibt,
muss sie wieder lesen können. Dazu Tests für die heiklen Fälle: leere Zelle, gekürzte Tabelle,
Datei ohne Formatmarker, unbekannte Referenz, Zeile mit falscher Spaltenzahl, Pipe- und
Zeilenumbruch-Escaping in Freitext.

---

## Teil B — Konkrete Umsetzung in dieser App (Referenz)

### Dateien im Repo

| Datei | Inhalt | Import-Semantik |
|---|---|---|
| `20-Fitness/Athlet.md` | Stammdaten als Frontmatter + gerechnete Vorgabe | nur in den gewählten Athleten, nie anlegen/austauschen |
| `20-Fitness/Gewicht.md` | Tracking je Tag (Gewicht, KFA, Makros, Umfänge, Notiz) | **zusammenführen**, leere Zelle = unverändert |
| `20-Fitness/Uebungen.md` | Übungs-Datenbank | anlegen/aktualisieren, nie löschen |
| `20-Fitness/Supplement-Datenbank.md` | Supplement-Stammdaten | anlegen/aktualisieren, nie löschen |
| `20-Fitness/Trainingsplaene.md` | Trainingsplan-Phasen | je Phase ersetzen, Phasen nie löschen |
| `20-Fitness/Supplemente.md` | Supplementplan-Phasen | je Phase ersetzen |
| `20-Fitness/Training/<datum>.md` | Trainingslog je Tag | Tag komplett ersetzen |
| `40-Ernaehrung/Ernaehrungsplan.md` | Ernährungsplan-Phasen + Bilanz | je Phase ersetzen |
| `40-Ernaehrung/Lebensmittel.md` | Lebensmittel-DB (je 100 g, Favorit, Unbestätigt) | beide Richtungen, nie löschen |
| `40-Ernaehrung/Lebensmittel-Neu.md` | Eingangskorb für neue Lebensmittel | importieren, dann Tabelle leeren; fehlerhafte Zeilen bleiben stehen |
| `40-Ernaehrung/Log/<datum>.md` | Ernährungslog je Tag | Tag komplett ersetzen |
| `90-Backup/fitness-app-backup.json` | verlustfreies Vollbackup | nur auf Knopfdruck |

Nicht im Repo: Übungsbilder und Hintergrundfoto (gehören nicht in eine Markdowntabelle und
würden das Repo aufblähen).

### Modul-Landkarte (`src/features/obsidianSync/`)

| Modul | Aufgabe |
|---|---|
| `settings.ts` | Zugangsdaten + Sync-Optionen in `localStorage`, Intervall normalisiert |
| `syncState.ts` | Observable-Zustand, `localStorage`-Spiegel, `withVaultImport`-Sperre |
| `githubApi.ts` | GitHub-Zugriff, Datei-Cache, `hashContent`, `listVaultTree`, **`syncFile`** |
| `autoSync.ts` | Scheduler: Intervall, Entprellung, Backoff, Lifecycle-Events |
| `dbWatch.ts` | Dexie-Hooks auf den beobachteten Tabellen → `triggerAutoSync()` |
| `fitnessExport.ts` | **`syncVault()`** — Orchestrierung eines Durchlaufs; Gewicht, Training, Supplementplan |
| `athleteExport.ts`, `exerciseExport.ts`, `supplementDbExport.ts`, `trainingPlanExport.ts`, `foodExport.ts`, `nutritionExport.ts` | je Datenart: `build*` + `import*` + `sync*` |
| `markdownBuild.ts` | Frontmatter, Tabellenzeilen, Escaping, `VAULT_FORMAT` |
| `markdownParse.ts` | Gegenstück: Frontmatter, Tabellen, Abschnitte, Checklisten |
| `vaultImport.ts` | Importer für Tracking, Tageslogs und Plan-Phasen |
| `vaultRecentImport.ts` | manuelles „Vault einlesen (letzte 3 Tage)" |
| `backupExport.ts` | deterministisches JSON-Vollbackup + Wiederherstellung |
| `importLog.ts` | Protokoll eines Durchlaufs, `byName`/`nameKey` |
| `base64.ts` | UTF-8-sicheres Base64 |
| `ObsidianSyncModal.tsx` | Einstellungen, Status, manuelle Aktionen |

### Konstanten

```
CHANGE_DEBOUNCE_MS = 10_000        MIN_GAP_MS      = 60_000
TICK_MS            = 60_000        STARTUP_DELAY_MS =  5_000
BACKOFF_MS         = [60_000, 300_000, 900_000, 1_800_000]
SYNCED_DAYS        = 3             VAULT_FORMAT     = 2
Intervall: 5 min … 1440 min, Standard 15 min
```
