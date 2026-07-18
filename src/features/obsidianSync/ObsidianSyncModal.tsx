import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import { getSyncSettings, saveSyncSettings } from './settings'
import { testConnection } from './githubApi'
import { syncFitnessHeute } from './fitnessExport'

type StatusType = 'idle' | 'busy' | 'success' | 'error'

export default function ObsidianSyncModal({ onClose }: { onClose: () => void }) {
  const athletes = useLiveQuery(() => db.athletes.toArray(), []) ?? []
  const sortedAthletes = [...athletes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const [username, setUsername] = useState('')
  const [repo, setRepo] = useState('obsidian-vault')
  const [token, setToken] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({ type: 'idle', message: '' })

  useEffect(() => {
    const existing = getSyncSettings()
    if (existing) {
      setUsername(existing.username)
      setRepo(existing.repo || 'obsidian-vault')
      setToken(existing.token)
      setAthleteId(existing.athleteId)
    } else if (sortedAthletes[0]) {
      setAthleteId(sortedAthletes[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes.length])

  function persist() {
    saveSyncSettings({
      username: username.trim(),
      repo: repo.trim() || 'obsidian-vault',
      token: token.trim(),
      athleteId,
    })
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
      await syncFitnessHeute()
      setStatus({ type: 'success', message: 'Synchronisiert ✅' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Unbekannter Fehler beim Sync.' })
    }
  }

  const busy = status.type === 'busy'

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

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={handleTest} disabled={busy || !athleteId}>
            Verbindung testen
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleSync} disabled={busy || !athleteId}>
            Jetzt synchronisieren
          </Button>
        </div>

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
