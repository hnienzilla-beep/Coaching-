import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import { DEFAULT_INTERVAL_MINUTES, INTERVAL_OPTIONS, getSyncSettings, saveSyncSettings } from './settings'
import { testConnection } from './githubApi'
import { notifySyncSettingsChanged, syncNow } from './autoSync'
import { getSyncState, setSyncState, subscribeSyncState } from './syncState'
import { importAllFromVault, summarizeImports } from './vaultImport'

type StatusType = 'idle' | 'busy' | 'success' | 'error'

function formatLastSync(iso: string | null): string {
  if (!iso) return 'noch nie'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unbekannt'
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min.`
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return `heute ${time} Uhr`
  return `${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${time} Uhr`
}

export default function ObsidianSyncModal({ onClose }: { onClose: () => void }) {
  const athletes = useLiveQuery(() => db.athletes.toArray(), []) ?? []
  const sortedAthletes = [...athletes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const [username, setUsername] = useState('')
  const [repo, setRepo] = useState('obsidian-vault')
  const [token, setToken] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [autoSync, setAutoSync] = useState(true)
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL_MINUTES)
  const [importFromVault, setImportFromVault] = useState(true)
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({ type: 'idle', message: '' })

  const syncState = useSyncExternalStore(subscribeSyncState, getSyncState)

  useEffect(() => {
    const existing = getSyncSettings()
    if (existing) {
      setUsername(existing.username)
      setRepo(existing.repo || 'obsidian-vault')
      setToken(existing.token)
      setAthleteId(existing.athleteId)
      setAutoSync(existing.autoSync)
      setIntervalMinutes(existing.intervalMinutes)
      setImportFromVault(existing.importFromVault)
    } else if (sortedAthletes[0]) {
      setAthleteId(sortedAthletes[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes.length])

  function persist(overrides: Partial<{ autoSync: boolean; intervalMinutes: number; importFromVault: boolean }> = {}) {
    saveSyncSettings({
      username: username.trim(),
      repo: repo.trim() || 'obsidian-vault',
      token: token.trim(),
      athleteId,
      autoSync,
      intervalMinutes,
      importFromVault,
      ...overrides,
    })
    notifySyncSettingsChanged()
  }

  async function handleTest() {
    persist()
    setStatus({ type: 'busy', message: 'Prüfe Verbindung…' })
    const result = await testConnection()
    setStatus({ type: result.ok ? 'success' : 'error', message: result.message })
  }

  async function handleSync() {
    persist()
    setStatus({ type: 'busy', message: 'Synchronisiere…' })
    try {
      await syncNow()
      setStatus({ type: 'success', message: 'Synchronisiert ✅' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Unbekannter Fehler beim Sync.' })
    }
  }

  async function handleImportAll() {
    persist()
    setStatus({ type: 'busy', message: 'Lese Vault…' })
    try {
      const results = await importAllFromVault()
      const summary = summarizeImports(results)
      setSyncState({ lastImport: summary })
      setStatus({
        type: 'success',
        message: summary ? `Aus dem Vault übernommen: ${summary}` : 'Im Vault gab es nichts zu übernehmen.',
      })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Unbekannter Fehler beim Import.' })
    }
  }

  const busy = status.type === 'busy' || syncState.running

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 overflow-y-auto">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Obsidian-Sync</h2>

        <Field label="Athlet (wessen Daten synchronisiert werden)">
          <Select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
            {sortedAthletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="GitHub-Benutzername">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="dein-github-name" />
        </Field>
        <Field label="Repo-Name">
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="obsidian-vault" />
        </Field>
        <Field label="Personal Access Token">
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." />
        </Field>

        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => {
              setAutoSync(e.target.checked)
              persist({ autoSync: e.target.checked })
            }}
            className="h-4 w-4 accent-accent"
          />
          Automatisch synchronisieren
        </label>

        <Field label="Sync-Intervall">
          <Select
            value={intervalMinutes}
            disabled={!autoSync}
            onChange={(e) => {
              const minutes = Number(e.target.value)
              setIntervalMinutes(minutes)
              persist({ intervalMinutes: minutes })
            }}
          >
            {INTERVAL_OPTIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={importFromVault}
            onChange={(e) => {
              setImportFromVault(e.target.checked)
              persist({ importFromVault: e.target.checked })
            }}
            className="h-4 w-4 accent-accent"
          />
          Änderungen aus dem Vault übernehmen
        </label>

        <p className="text-xs text-muted">
          Automatisch wird synchronisiert, solange die App geöffnet ist: nach jeder Änderung, im eingestellten
          Intervall und beim Zurückkehren in die App. Ist die App geschlossen, ruht der Sync und wird beim nächsten
          Start nachgeholt.
        </p>
        <p className="text-xs text-muted">
          Mit „Änderungen aus dem Vault übernehmen" liest der Sync auch in die andere Richtung: In Obsidian
          bearbeitete Dateien werden vor dem Hochladen in die App eingelesen. Bei gleichzeitiger Änderung derselben
          Datei gewinnt der Vault. Lebensmittel, die es in der App nicht gibt, werden dabei übersprungen (aus
          „80g (300 kcal)" lassen sich keine Makros zurückrechnen). Alles unterhalb einer Überschrift
          „## Notizen" gehört dir und bleibt beim Zurückschreiben unangetastet.
        </p>
        <p className="text-xs text-muted">
          Die Lebensmittel-Datenbank landet als Tabelle in „40-Ernaehrung/Lebensmittel.md" (wird bei jedem Sync
          komplett neu geschrieben). Neue Lebensmittel kommen umgekehrt über
          „40-Ernaehrung/Lebensmittel-Neu.md" in die App: Jede Zeile dort wird angelegt und als „unbestätigt"
          markiert, Namen aus der Datenbank bleiben unangetastet. Danach wird die Tabelle geleert – fehlerhafte
          Zeilen bleiben zur Korrektur stehen.
        </p>

        <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          <div>
            Zuletzt synchronisiert: <span className="text-fg">{formatLastSync(syncState.lastSyncAt)}</span>
          </div>
          {syncState.running && <div className="text-muted">Sync läuft…</div>}
          {!syncState.running && syncState.pendingChanges && <div>Änderungen warten auf den nächsten Sync.</div>}
          {!syncState.running && syncState.lastError && (
            <div className="text-danger">Letzter Versuch fehlgeschlagen: {syncState.lastError}</div>
          )}
          {syncState.lastImport && <div>Aus dem Vault übernommen: {syncState.lastImport}</div>}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={handleTest} disabled={busy || !athleteId}>
            Verbindung testen
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleSync} disabled={busy || !athleteId}>
            Jetzt synchronisieren
          </Button>
        </div>

        <Button variant="secondary" onClick={handleImportAll} disabled={busy || !athleteId}>
          Kompletten Vault einlesen
        </Button>

        {status.message && (
          <p className={`text-sm ${status.type === 'error' ? 'text-danger' : status.type === 'success' ? 'text-ok' : 'text-muted'}`}>
            {status.message}
          </p>
        )}

        <Button variant="ghost" onClick={onClose}>
          Schließen
        </Button>
      </Card>
    </div>
  )
}
