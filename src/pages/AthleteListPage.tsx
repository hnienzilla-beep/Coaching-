import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDragSensors } from '../lib/dragSensors'
import { shareOrDownloadFile } from '../lib/share'
import { db, exportAllData, exportAthletes, importAllData, importSelectedAthletes } from '../db/db'
import { ACCENT_COLORS, deleteAthlete, sortAthletes, todayIso } from '../db/queries'
import { AccentSwatch, Button, Card } from '../components/ui'
import NewAthleteForm from '../components/NewAthleteForm'
import type { Athlete } from '../models/types'
import { useOverviewAccent } from '../lib/accentColor'
import { clearLastAthleteId, getLastAthleteId } from '../lib/lastAthlete'

/**
 * Athletenverwaltung. Seit die App direkt im zuletzt geöffneten Athleten startet, ist das
 * keine Startseite mehr, sondern eine Werkzeugseite hinter dem Zahnrad: Reihenfolge,
 * Anlegen, Löschen sowie Export und Import des gesamten Datenbestands.
 */
export default function AthleteListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const athletes = useLiveQuery(() => db.athletes.toArray(), [])
  const allEntries = useLiveQuery(() => db.dailyEntries.toArray(), [])
  const latestWeightByAthlete = useMemo(() => {
    const map = new Map<string, { date: string; weightKg: number }>()
    for (const e of allEntries ?? []) {
      if (e.weightKg === undefined) continue
      const existing = map.get(e.athleteId)
      if (!existing || e.date > existing.date) {
        map.set(e.athleteId, { date: e.date, weightKg: e.weightKg })
      }
    }
    return map
  }, [allEntries])
  const sortedAthletes = useMemo(() => sortAthletes(athletes ?? []), [athletes])
  const sensors = useDragSensors()

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedAthletes.findIndex((a) => a.id === active.id)
    const newIndex = sortedAthletes.findIndex((a) => a.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(sortedAthletes, oldIndex, newIndex)
    await db.transaction('rw', db.athletes, async () => {
      for (let i = 0; i < reordered.length; i++) {
        await db.athletes.update(reordered[i].id, { order: i })
      }
    })
  }

  // `?neu=1` kommt vom Eintrag "+ Neuer Athlet" in der Kopfzeile des Athleten - damit
  // landet man hier direkt im aufgeklappten Formular.
  const [showForm, setShowForm] = useState(searchParams.get('neu') === '1')
  const [overviewAccent, setOverviewAccent] = useOverviewAccent()
  const [accentPickerOpen, setAccentPickerOpen] = useState(false)
  const accentPickerRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ text: string; athletes: Athlete[] } | null>(null)
  const [exportSelectorOpen, setExportSelectorOpen] = useState(false)

  async function handleExport() {
    const json = await exportAllData()
    const blob = new Blob([json], { type: 'application/json' })
    const file = new File([blob], `bodybuilding-coach-backup-${todayIso()}.json`, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Bodybuilding Coach Backup' })
        return
      } catch {
        // Nutzer hat Teilen abgebrochen - fällt durch zum Download
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as { data?: { athletes?: Athlete[] } }
      const athletesInFile = parsed.data?.athletes ?? []
      if (athletesInFile.length > 0) {
        setPendingImport({ text, athletes: athletesInFile })
        return
      }
      if (!confirm('Import überschreibt vorhandene Daten mit gleicher ID. Fortfahren?')) return
      await importAllData(text)
      alert('Import abgeschlossen.')
    } catch {
      alert('Import fehlgeschlagen. Ist die Datei ein gültiges Backup?')
    }
  }

  useEffect(() => {
    if (!accentPickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (accentPickerRef.current && !accentPickerRef.current.contains(e.target as Node)) {
        setAccentPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [accentPickerOpen])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-10">
      <header className="flex items-center justify-between pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="text-muted" aria-label="Zurück zum Athleten">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-fg">Athleten</h1>
            <p className="text-sm text-muted">Anlegen, sortieren, löschen</p>
          </div>
        </div>
        {/* Der Akzent für alle Seiten außerhalb eines Athleten - innerhalb eines Athleten
            gewinnt dessen eigene Farbe, deshalb steht der Picker hier und nicht im
            Zahnrad-Menü der Kopfzeile. */}
        <div ref={accentPickerRef} className="relative shrink-0">
          <button
            onClick={() => setAccentPickerOpen((v) => !v)}
            aria-expanded={accentPickerOpen}
            aria-label="Akzentfarbe"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm leading-none text-fg"
          >
            🎨
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-border"
              style={{ background: overviewAccent ?? 'var(--color-accent)' }}
            />
          </button>
          {accentPickerOpen && (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 flex w-52 flex-wrap gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
              <button
                type="button"
                onClick={() => setOverviewAccent(null)}
                aria-pressed={overviewAccent === null}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  overviewAccent === null ? 'border-accent text-fg' : 'border-border text-muted'
                }`}
              >
                Standard
              </button>
              {ACCENT_COLORS.map((color) => (
                <AccentSwatch key={color} color={color} selected={overviewAccent === color} onSelect={setOverviewAccent} />
              ))}
            </div>
          )}
        </div>
      </header>

      {athletes?.length === 0 ? (
        <Card className="text-center text-sm text-muted">👤 Noch keine Athleten angelegt. Leg den ersten an.</Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedAthletes.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {sortedAthletes.map((a) => (
                <SortableAthleteCard key={a.id} athlete={a} weightKg={latestWeightByAthlete.get(a.id)?.weightKg} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Nach dem Anlegen direkt in den neuen Athleten - `createAthlete` liefert ihn zurück. */}
      {showForm ? (
        <NewAthleteForm onCreated={(a) => navigate(`/athlete/${a.id}`)} onCancel={() => setShowForm(false)} />
      ) : (
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Athlet hinzufügen
        </Button>
      )}

      {athletes && athletes.length > 0 && (
        <Button variant="secondary" onClick={() => setExportSelectorOpen(true)}>
          Athleten exportieren
        </Button>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleExport} className="flex-1">
          Daten exportieren
        </Button>
        <Button variant="secondary" onClick={() => importInputRef.current?.click()} className="flex-1">
          Daten importieren
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            void handleImport(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {pendingImport && (
        <ImportAthleteSelector
          athletes={pendingImport.athletes}
          onCancel={() => setPendingImport(null)}
          onConfirm={async (selectedIds) => {
            await importSelectedAthletes(pendingImport.text, selectedIds)
            setPendingImport(null)
            alert('Import abgeschlossen.')
          }}
        />
      )}

      {exportSelectorOpen && (
        <ExportAthleteSelector
          athletes={sortedAthletes}
          onCancel={() => setExportSelectorOpen(false)}
          onConfirm={async (selectedIds) => {
            const json = await exportAthletes(selectedIds)
            const name =
              selectedIds.length === 1
                ? (sortedAthletes.find((a) => a.id === selectedIds[0])?.name ?? 'Athlet')
                : `${selectedIds.length}-Athleten`
            const file = new File([json], `Athleten-Export-${name}-${todayIso()}.json`, { type: 'application/json' })
            await shareOrDownloadFile(file)
            setExportSelectorOpen(false)
          }}
        />
      )}
    </div>
  )
}

function AthleteTileList({
  athletes,
  selected,
  onToggle,
}: {
  athletes: Athlete[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
      {athletes.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onToggle(a.id)}
          className="flex items-center gap-3 rounded-xl border-2 p-3 text-left transition"
          style={{
            borderColor: selected.has(a.id) ? a.accentColor : 'var(--color-border)',
            background: selected.has(a.id) ? `${a.accentColor}1a` : 'var(--color-surface-2)',
          }}
        >
          <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: a.accentColor }} />
          <div className="flex-1">
            <div className="font-semibold text-fg">{a.name}</div>
            <div className="text-xs text-muted">
              {a.weightKg} kg · {a.goal}
            </div>
          </div>
          {selected.has(a.id) && (
            <span className="text-lg" style={{ color: a.accentColor }}>
              ✓
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function useAthleteSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return { selected, toggle, setSelected }
}

function ImportAthleteSelector({
  athletes,
  onCancel,
  onConfirm,
}: {
  athletes: Athlete[]
  onCancel: () => void
  onConfirm: (selectedIds: string[]) => Promise<void>
}) {
  const { selected, toggle, setSelected } = useAthleteSelection()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="flex max-h-[80vh] w-full max-w-md flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Athleten zum Importieren auswählen</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSelected(new Set(athletes.map((a) => a.id)))}>
            Alle auswählen
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Keine
          </Button>
        </div>
        <AthleteTileList athletes={athletes} selected={selected} onToggle={toggle} />
        <p className="text-xs text-muted">Import überschreibt vorhandene Daten mit gleicher ID.</p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            Importieren ({selected.size})
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ExportAthleteSelector({
  athletes,
  onCancel,
  onConfirm,
}: {
  athletes: Athlete[]
  onCancel: () => void
  onConfirm: (selectedIds: string[]) => Promise<void>
}) {
  const { selected, toggle, setSelected } = useAthleteSelection()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="flex max-h-[80vh] w-full max-w-md flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Athleten zum Exportieren auswählen</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSelected(new Set(athletes.map((a) => a.id)))}>
            Alle auswählen
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Keine
          </Button>
        </div>
        <AthleteTileList athletes={athletes} selected={selected} onToggle={toggle} />
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            Exportieren ({selected.size})
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SortableAthleteCard({ athlete: a, weightKg }: { athlete: Athlete; weightKg: number | undefined }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/30"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="shrink-0 touch-none px-1 text-lg text-muted"
        aria-label="Verschieben"
      >
        ⠿
      </button>
      <Link to={`/athlete/${a.id}`} className="flex flex-1 items-center gap-3">
        <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: a.accentColor }} />
        <div>
          <div className="font-semibold text-fg">{a.name}</div>
          <div className="text-xs text-muted">
            {weightKg ?? a.weightKg} kg · {a.goal}
          </div>
        </div>
      </Link>
      <Button
        variant="danger"
        onClick={async (e) => {
          e.preventDefault()
          if (confirm(`Athlet "${a.name}" wirklich löschen? Alle Daten gehen verloren.`)) {
            await deleteAthlete(a.id)
            // War das der gemerkte Athlet, würde die App beim nächsten Start ins Leere
            // starten - dann fällt sie wieder auf den ersten der Reihenfolge zurück.
            if (getLastAthleteId() === a.id) clearLastAthleteId()
          }
        }}
      >
        Löschen
      </Button>
    </div>
  )
}
