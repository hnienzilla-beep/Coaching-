import { getSyncSettings } from './settings'
import { base64ToUtf8, utf8ToBase64 } from './base64'

export class ObsidianSyncError extends Error {}

function apiBase(settings: { username: string; repo: string }): string {
  return `https://api.github.com/repos/${settings.username}/${settings.repo}`
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }
}

/** Pfadsegmente einzeln kodieren - "/" muss als Trenner erhalten bleiben. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

/** Prüft, ob Repo mit den gespeicherten Zugangsdaten erreichbar ist. */
export async function testConnection(): Promise<ConnectionTestResult> {
  const settings = getSyncSettings()
  if (!settings) {
    return { ok: false, message: 'Bitte Athlet, Benutzername, Repo-Name und Token ausfüllen.' }
  }
  try {
    const res = await fetch(apiBase(settings), { headers: authHeaders(settings.token) })
    if (res.status === 404) {
      return { ok: false, message: 'Repo nicht gefunden. Benutzername und Repo-Name prüfen.' }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Token ungültig oder ohne Schreibrechte für dieses Repo.' }
    }
    if (!res.ok) {
      return { ok: false, message: `Unerwarteter Fehler von GitHub (${res.status}).` }
    }
    return { ok: true, message: 'Verbindung erfolgreich – Repo erreichbar.' }
  } catch {
    return { ok: false, message: 'Keine Verbindung möglich (kein Internet oder Repo nicht erreichbar).' }
  }
}

// Merkt sich pro Datei den SHA, den wir beim letzten Sync gesehen haben. Weicht der SHA im
// Repo davon ab, wurde die Datei anderswo geändert (Obsidian, zweites Gerät) - dann werden
// die Änderungen erst in die App übernommen, bevor wir sie überschreiben.
const FILE_CACHE_KEY = 'obsidian-sync-file-cache'

function fileCacheKey(settings: { username: string; repo: string }, path: string): string {
  return `${settings.username}/${settings.repo}:${path}`
}

function readFileCache(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(FILE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function readCachedSha(key: string): string | null {
  const entry = readFileCache()[key]
  if (typeof entry === 'string') return entry
  // Ältere App-Versionen haben hier { sha, hash } abgelegt.
  if (entry && typeof entry === 'object' && typeof (entry as { sha?: unknown }).sha === 'string') {
    return (entry as { sha: string }).sha
  }
  return null
}

function writeCachedSha(key: string, sha: string): void {
  try {
    const cache = readFileCache()
    cache[key] = sha
    localStorage.setItem(FILE_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ohne Cache wird nur öfter gelesen/geschrieben - kein Grund, den Sync scheitern zu lassen.
  }
}

export interface RemoteFile {
  path: string
  sha: string
  content: string
}

async function githubFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new ObsidianSyncError('Keine Verbindung zu GitHub möglich (kein Internet?).')
  }
}

function assertReadable(res: Response, path: string): void {
  if (res.status === 401 || res.status === 403) {
    throw new ObsidianSyncError('Token ungültig oder ohne Zugriff auf dieses Repo.')
  }
  if (!res.ok) {
    throw new ObsidianSyncError(`Fehler beim Lesen von "${path}" (${res.status}).`)
  }
}

/** Liest eine Datei aus dem Vault-Repo. `null`, wenn es sie dort (noch) nicht gibt. */
export async function readFile(path: string): Promise<RemoteFile | null> {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }

  const res = await githubFetch(`${apiBase(settings)}/contents/${encodePath(path)}`, {
    headers: authHeaders(settings.token),
  })
  if (res.status === 404) return null
  assertReadable(res, path)

  const data = (await res.json()) as { sha: string; content?: string; encoding?: string }
  if (data.encoding !== 'base64' || typeof data.content !== 'string') {
    // z.B. Dateien > 1 MB liefert GitHub ohne Inhalt - die stammen nicht von uns.
    return { path, sha: data.sha, content: '' }
  }
  return { path, sha: data.sha, content: base64ToUtf8(data.content.replace(/\s/g, '')) }
}

/** Listet die Dateinamen eines Verzeichnisses im Vault-Repo (leer, wenn es nicht existiert). */
export async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  const settings = getSyncSettings()
  if (!settings) return []

  const res = await githubFetch(`${apiBase(settings)}/contents/${encodePath(dirPath)}`, {
    headers: authHeaders(settings.token),
  })
  if (res.status === 404) return []
  assertReadable(res, dirPath)

  const data = (await res.json()) as unknown
  if (!Array.isArray(data)) return []
  return data
    .filter((e): e is { type: string; path: string } => !!e && typeof e === 'object' && 'path' in e)
    .filter((e) => e.type === 'file' && e.path.endsWith('.md'))
    .map((e) => e.path)
}

/** Legt eine Datei im Vault-Repo an oder aktualisiert sie. */
async function putFile(path: string, content: string, commitMessage: string, sha: string | null): Promise<string | null> {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }

  const res = await githubFetch(`${apiBase(settings)}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: { ...authHeaders(settings.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: commitMessage,
      content: utf8ToBase64(content),
      ...(sha ? { sha } : {}),
    }),
  })

  if (res.status === 401 || res.status === 403) {
    throw new ObsidianSyncError('Token ungültig oder ohne Schreibrechte.')
  }
  if (res.status === 409 || res.status === 422) {
    throw new ObsidianSyncError('Konflikt: Datei wurde zwischenzeitlich geändert. Beim nächsten Sync wird es erneut versucht.')
  }
  if (!res.ok) {
    throw new ObsidianSyncError(`GitHub-Fehler beim Speichern von "${path}" (${res.status}).`)
  }

  try {
    const data = (await res.json()) as { content?: { sha?: string } }
    return data.content?.sha ?? null
  } catch {
    return null
  }
}

/**
 * Schreibt eine Datei ins Vault-Repo und merkt sich den neuen SHA - für Dateien, deren Inhalt
 * nicht allein aus der App-Datenbank entsteht (z.B. Lebensmittel-Neu.md, die nach dem Import
 * geleert wird und deren fehlerhafte Zeilen stehen bleiben) und die deshalb nicht über
 * `syncFile` laufen können.
 */
export async function writeFile(path: string, content: string, commitMessage: string, sha: string | null): Promise<void> {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }
  const newSha = await putFile(path, content, commitMessage, sha)
  if (newSha) writeCachedSha(fileCacheKey(settings, path), newSha)
}

export interface SyncFileOptions {
  path: string
  /**
   * Baut den Dateiinhalt aus dem aktuellen Stand der App-Datenbank. `null` bedeutet "die App
   * hat für diese Datei nichts" (z.B. kein Training heute) - dann wird nichts geschrieben,
   * eine vorhandene Datei im Vault aber trotzdem eingelesen.
   */
  build: () => Promise<string | null>
  commitMessage: string
  /** Übernimmt eine im Vault geänderte Datei in die App. Ohne diese Funktion wird nur geschrieben. */
  importRemote?: (content: string) => Promise<void>
  /**
   * Einen "## Notizen"-Block aus dem Vault beim Zurückschreiben erhalten (Standard: ja).
   * Für reine Datenbank-Abzüge (Lebensmittel.md) aus, sie werden komplett überschrieben.
   */
  preserveNotes?: boolean
}

/**
 * Alles ab einer Überschrift "## Notizen" gehört dem Nutzer, nicht dem Export: Der Block
 * wird beim Zurückschreiben unverändert wieder angehängt, damit in Obsidian ergänzte
 * Gedanken nicht beim nächsten Sync verschwinden.
 */
export const NOTES_HEADING = '## Notizen'

function extractNotes(content: string): string | null {
  const match = content.match(/^##\s+Notizen\s*$/m)
  if (!match || match.index === undefined) return null
  return content.slice(match.index).trimEnd()
}

export interface SyncFileResult {
  /** Der Vault-Stand wurde in die App übernommen. */
  imported: boolean
  /** Die Datei wurde (neu) ins Repo geschrieben. */
  written: boolean
}

/**
 * Gleicht eine Datei in beide Richtungen ab:
 *
 * 1. Datei aus dem Repo lesen.
 * 2. Stimmt sie mit dem überein, was die App schreiben würde, ist nichts zu tun.
 * 3. Wurde sie seit dem letzten Sync anderswo geändert (anderer SHA), zuerst in die App
 *    übernehmen - der Vault gewinnt also bei gleichzeitiger Änderung derselben Datei.
 * 4. Anschließend den (ggf. zusammengeführten) Stand der App zurückschreiben.
 */
export async function syncFile(options: SyncFileOptions): Promise<SyncFileResult> {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }

  const cacheKey = fileCacheKey(settings, options.path)
  const remote = await readFile(options.path)
  const notes = remote && options.preserveNotes !== false ? extractNotes(remote.content) : null
  const withNotes = (built: string | null): string | null =>
    built === null || notes === null ? built : `${built.trimEnd()}\n\n${notes}\n`

  let content = withNotes(await options.build())

  if (remote && remote.content === content) {
    writeCachedSha(cacheKey, remote.sha) // unverändert - kein Upload nötig
    return { imported: false, written: false }
  }

  let imported = false
  const changedElsewhere = remote !== null && remote.sha !== readCachedSha(cacheKey)
  if (remote && changedElsewhere && options.importRemote && settings.importFromVault) {
    await options.importRemote(remote.content)
    imported = true
    content = withNotes(await options.build()) // nach dem Import neu aufbauen
    if (content === null || remote.content === content) {
      writeCachedSha(cacheKey, remote.sha)
      return { imported, written: false }
    }
  }

  if (content === null) return { imported, written: false }

  const newSha = await putFile(options.path, content, options.commitMessage, remote?.sha ?? null)
  if (newSha) writeCachedSha(cacheKey, newSha)
  return { imported, written: true }
}
