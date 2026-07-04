import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDragSensors } from '../lib/dragSensors'
import { shareOrDownloadFile } from '../lib/share'
import {
  db,
  ensureAthleteOrder,
  ensureExerciseSeed,
  ensureFoodSeed,
  ensurePlanMealOrder,
  ensureSupplementSeed,
  ensureTrainingPlanExerciseOrder,
  ensureWorkoutSetMigration,
  exportAllData,
  exportAthlete,
  importAllData,
  importSelectedAthletes,
} from '../db/db'
import { ACCENT_COLORS, createAthlete, deleteAthlete, isoDate } from '../db/queries'
import { Button, Card, Field, Input, Select } from '../components/ui'
import type { Athlete, Gender } from '../models/types'
import { ACTIVITY_LEVELS, GOALS } from '../lib/calculator'
import { useTheme } from '../lib/theme'
import { useCoachMode } from '../lib/coachMode'

export default function AthleteListPage() {
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
  const sortedAthletes = useMemo(() => [...(athletes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [athletes])
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

  const [showForm, setShowForm] = useState(false)
  const [theme, setTheme] = useTheme()
  const [coachMode, setCoachMode] = useCoachMode()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ text: string; athletes: Athlete[] } | null>(null)

  async function handleExport() {
    const json = await exportAllData()
    const blob = new Blob([json], { type: 'application/json' })
    const file = new File([blob], `bodybuilding-coach-backup-${isoDate(new Date())}.json`, { type: 'application/json' })
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
    ensureFoodSeed()
    ensureSupplementSeed()
    ensureExerciseSeed()
    ensureTrainingPlanExerciseOrder()
    ensureWorkoutSetMigration()
    ensurePlanMealOrder()
    ensureAthleteOrder()
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center justify-between pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-xl font-bold text-fg">Bodybuilding Coach</h1>
          <p className="text-sm text-muted">Athleten verwalten</p>
        </div>
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Einstellungen"
            className="rounded-lg border border-border bg-surface-2 p-2 text-lg leading-none text-fg"
          >
            ⚙️
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 flex w-52 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
              >
                {theme === 'dark' ? '☀️ Hell-Modus' : '🌙 Dunkel-Modus'}
              </button>
              <button
                onClick={() => setCoachMode(!coachMode)}
                className="rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
              >
                {coachMode ? '🧑‍🏫 Coach-Modus: An' : '🧑‍🏫 Coach-Modus: Aus'}
              </button>
              <div className="my-1 border-t border-border" />
              <Link
                to="/lebensmittel"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
              >
                Lebensmittel-DB
              </Link>
              <Link
                to="/supplemente"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
              >
                Supplement-DB
              </Link>
              <Link
                to="/uebungen"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
              >
                Trainings-DB
              </Link>
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

      {showForm ? (
        <NewAthleteForm onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Athlet hinzufügen
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
    </div>
  )
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
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
        <div className="flex flex-col gap-1 overflow-y-auto">
          {athletes.map((a) => (
            <label key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.accentColor }} />
              <span className="text-fg">{a.name}</span>
            </label>
          ))}
        </div>
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
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.accentColor }} />
        <div>
          <div className="font-semibold text-fg">{a.name}</div>
          <div className="text-xs text-muted">
            {weightKg ?? a.weightKg} kg · {a.goal}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={async (e) => {
          e.preventDefault()
          const json = await exportAthlete(a.id)
          const file = new File([json], `Athlet-${a.name}-${isoDate(new Date())}.json`, { type: 'application/json' })
          await shareOrDownloadFile(file)
        }}
        aria-label="Athlet exportieren"
        title="Athlet exportieren"
        className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-sm leading-none text-muted hover:border-accent"
      >
        ⬆️
      </button>
      <Button
        variant="danger"
        onClick={async (e) => {
          e.preventDefault()
          if (confirm(`Athlet "${a.name}" wirklich löschen? Alle Daten gehen verloren.`)) {
            await deleteAthlete(a.id)
          }
        }}
      >
        Löschen
      </Button>
    </div>
  )
}

function NewAthleteForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [gender, setGender] = useState<Gender>('Männlich')
  const [age, setAge] = useState(30)
  const [heightCm, setHeightCm] = useState(180)
  const [weightKg, setWeightKg] = useState(80)
  const [activityLevel, setActivityLevel] = useState(ACTIVITY_LEVELS[2].label)
  const [goal, setGoal] = useState(GOALS[1].label)
  const [accentColor, setAccentColor] = useState(ACCENT_COLORS[0])

  async function submit() {
    if (!name.trim()) return
    await createAthlete({
      name: name.trim(),
      gender,
      age,
      heightCm,
      weightKg,
      activityLevel,
      goal,
      proteinPerKg: 2.2,
      fatPerKg: 1,
      startDate: isoDate(new Date()),
      accentColor,
    })
    onDone()
  }

  return (
    <Card className="flex flex-col gap-3">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Max" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Geschlecht">
          <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="Männlich">Männlich</option>
            <option value="Weiblich">Weiblich</option>
          </Select>
        </Field>
        <Field label="Alter (Jahre)">
          <Input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} />
        </Field>
        <Field label="Größe (cm)">
          <Input type="number" value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} />
        </Field>
        <Field label="Gewicht (kg)">
          <Input type="number" value={weightKg} onChange={(e) => setWeightKg(Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Aktivitätslevel">
        <Select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.label} value={a.label}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ziel">
        <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
          {GOALS.map((g) => (
            <option key={g.label} value={g.label}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Akzentfarbe">
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setAccentColor(color)}
              aria-label={`Akzentfarbe ${color}`}
              className="h-7 w-7 rounded-full"
              style={{ background: color, boxShadow: accentColor === color ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}` : 'none' }}
            />
          ))}
        </div>
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" onClick={submit} className="flex-1">
          Anlegen
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </Card>
  )
}
