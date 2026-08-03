import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  upsertDailyEntry,
  todayIso,
  getTrackingSeries,
  syncBodyFatToDailyEntry,
  exportProgress,
  importProgress,
} from '../db/queries'
import type { Athlete, DailyEntry } from '../models/types'
import { calculateBodyFatFromFfmi, calendarWeekWeightDelta, rollingAverage7, weeklyDelta } from '../lib/calculator'
import { Card, DecimalInput, Field, Input, Button } from '../components/ui'
import { shareOrDownloadFile } from '../lib/share'

type Ctx = { athlete: Athlete }

export default function TrackingPage() {
  const { athlete } = useOutletContext<Ctx>()
  const series = useLiveQuery(() => getTrackingSeries(athlete.id, athlete.startDate), [athlete.id, athlete.startDate]) ?? []
  const importProgressInputRef = useRef<HTMLInputElement>(null)

  const chartData = series.map((entry, i) => ({
    date: entry.date.slice(5),
    weight: entry.weightKg,
    bodyFat: entry.bodyFatPct,
    weightAvg7: rollingAverage7(series, i),
    waist: entry.waist,
    arm: entry.arm,
    chest: entry.chest,
    leg: entry.leg,
  }))

  const today = todayIso()
  const calendarWeekComparison = calendarWeekWeightDelta(series, today)
  const [selectedDate, setSelectedDate] = useState(today)
  const selectedIndex = series.findIndex((e) => e.date === selectedDate)
  const selectedEntry = selectedIndex >= 0 ? series[selectedIndex] : undefined
  const delta = selectedIndex >= 0 ? weeklyDelta(series, selectedIndex) : undefined
  const avg7 = selectedIndex >= 0 ? rollingAverage7(series, selectedIndex) : undefined

  async function handleExportProgress() {
    const json = await exportProgress(athlete.id)
    const file = new File([json], `Fortschritt-${athlete.name}-${todayIso()}.json`, { type: 'application/json' })
    await shareOrDownloadFile(file)
  }

  async function handleImportProgress(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    try {
      await importProgress(await file.text(), athlete.id)
      alert('Fortschritt importiert.')
    } catch {
      alert('Import fehlgeschlagen. Ist die Datei eine gültige Fortschritt-Exportdatei?')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Gewicht &amp; KFA</h2>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} width={44} />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 12 }} />
              {/* Rohgewicht bewusst gedimmt, der geglättete 7-Tage-Schnitt trägt den Akzent. */}
              <Line type="monotone" dataKey="weight" stroke="#a1a1aa" dot={false} name="Gewicht (kg)" connectNulls />
              <Line type="monotone" dataKey="weightAvg7" stroke="var(--color-accent)" dot={false} strokeWidth={2} name="Ø 7 Tage" connectNulls />
              {athlete.targetWeightKg !== undefined && (
                <ReferenceLine
                  y={athlete.targetWeightKg}
                  stroke="#f472b6"
                  strokeDasharray="4 4"
                  label={{ value: 'Ziel', position: 'insideTopRight', fill: '#f472b6', fontSize: 10 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} width={36} />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 12 }} />
              <Line type="monotone" dataKey="bodyFat" stroke="#f472b6" dot={false} name="KFA (%)" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Kalenderwochen-Vergleich</h2>
        {calendarWeekComparison ? (
          <>
            <p className="text-lg font-semibold text-fg">
              {calendarWeekComparison.deltaKg === 0
                ? 'Gewicht gehalten'
                : `${Math.abs(calendarWeekComparison.deltaKg).toFixed(1)} kg ${calendarWeekComparison.deltaKg < 0 ? 'abgenommen' : 'zugenommen'}`}
            </p>
            <p className="text-xs text-muted">
              Ø {calendarWeekComparison.thisWeekAvg.toFixed(1)} kg diese Woche · Ø {calendarWeekComparison.lastWeekAvg.toFixed(1)} kg letzte
              Woche
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">📊 Noch nicht genug Daten für einen Kalenderwochen-Vergleich.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Fortschritt teilen</h2>
        <p className="text-xs text-muted">
          Exportiert die letzten 7 Tage aus Tracking, Ernähr.-Log und Trainings-Log zum Versenden. Beim Importieren
          werden diese Tage für {athlete.name} aktualisiert.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportProgress} className="flex-1">
            Fortschritt exportieren
          </Button>
          <Button variant="secondary" onClick={() => importProgressInputRef.current?.click()} className="flex-1">
            Fortschritt importieren
          </Button>
        </div>
        <input
          ref={importProgressInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            void handleImportProgress(e.target.files)
            e.target.value = ''
          }}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Körpermaße</h2>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} width={44} />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 12 }} />
              <Line type="monotone" dataKey="waist" stroke="#facc15" dot={false} name="Bauch (cm)" connectNulls />
              <Line type="monotone" dataKey="arm" stroke="#22d3ee" dot={false} name="Arm (cm)" connectNulls />
              <Line type="monotone" dataKey="chest" stroke="#e4e4e7" dot={false} name="Brust (cm)" connectNulls />
              <Line type="monotone" dataKey="leg" stroke="#fb923c" dot={false} name="Bein (cm)" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <DayEditor
        athleteId={athlete.id}
        date={selectedDate}
        entry={selectedEntry}
        avg7={avg7}
        delta={delta}
        ffmi={athlete.ffmi}
        heightCm={athlete.heightCm}
      />

      <Card className="flex flex-col gap-1">
        <h2 className="pb-1 text-sm font-semibold uppercase tracking-wide text-muted">Verlauf</h2>
        <div className="flex max-h-64 flex-col-reverse overflow-y-auto">
          {series.map((e) => (
            <button
              key={e.date}
              onClick={() => setSelectedDate(e.date)}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                e.date === selectedDate ? 'bg-surface-2' : ''
              }`}
            >
              <span className="text-muted">{e.date}</span>
              <span className="flex items-center gap-2 text-fg">
                {e.weightKg !== undefined ? `${e.weightKg} kg` : '–'}
                {e.bodyFatPct !== undefined ? ` · ${e.bodyFatPct}%` : ''}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function DayEditor({
  athleteId,
  date,
  entry,
  avg7,
  delta,
  ffmi,
  heightCm,
}: {
  athleteId: string
  date: string
  entry?: DailyEntry
  avg7?: number
  delta?: number
  ffmi?: number
  heightCm: number
}) {
  const current: DailyEntry = entry ?? { id: crypto.randomUUID(), athleteId, date }
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showSaved, setShowSaved] = useState(false)

  const bodyFatFromFfmi =
    ffmi !== undefined && current.weightKg !== undefined ? calculateBodyFatFromFfmi(ffmi, current.weightKg, heightCm) : undefined

  // Merkt sich pro Tag den zuletzt automatisch geschriebenen KFA-Wert, damit ein erneuter
  // Besuch desselben Tages eine manuelle Anpassung nicht überschreibt - nur eine tatsächliche
  // Änderung von FFMI/Gewicht/Größe (also ein neuer berechneter Wert) löst einen neuen Sync aus.
  const lastSyncedRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (bodyFatFromFfmi === undefined || !Number.isFinite(bodyFatFromFfmi)) return
    const key = `${athleteId}:${date}`
    if (lastSyncedRef.current.get(key) === bodyFatFromFfmi) return
    lastSyncedRef.current.set(key, bodyFatFromFfmi)
    void syncBodyFatToDailyEntry(athleteId, date, bodyFatFromFfmi)
  }, [athleteId, date, bodyFatFromFfmi])

  useEffect(() => {
    setSavedAt(null)
    setShowSaved(false)
  }, [date])

  useEffect(() => {
    if (savedAt === null) return
    setShowSaved(true)
    const timeout = setTimeout(() => setShowSaved(false), 1500)
    return () => clearTimeout(timeout)
  }, [savedAt])

  function persist(patch: Partial<DailyEntry>) {
    const updated = { ...current, ...patch, athleteId, date }
    void upsertDailyEntry(updated)
    setSavedAt(Date.now())
  }

  function field<K extends keyof DailyEntry>(key: K) {
    return {
      value: current[key] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const raw = e.target.value
        const isNumeric = key !== 'notes' && key !== 'id' && key !== 'athleteId' && key !== 'date'
        persist({ [key]: isNumeric ? (raw === '' ? undefined : Number(raw)) : raw } as Partial<DailyEntry>)
      },
    }
  }

  function decimalField<K extends keyof DailyEntry>(key: K) {
    return {
      value: current[key] as number | undefined,
      onChange: (n: number | undefined) => persist({ [key]: n } as Partial<DailyEntry>),
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Eintrag {date}</h2>
          <span className={`text-xs text-accent transition-opacity duration-500 ${showSaved ? 'opacity-100' : 'opacity-0'}`}>
            ✓ Gespeichert
          </span>
        </div>
        <span className="text-xs text-muted">
          {avg7 !== undefined ? `Ø7: ${avg7.toFixed(1)} kg` : ''}
          {delta !== undefined ? `  Δ Woche: ${delta.toFixed(1)} kg` : ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gewicht (kg)">
          <DecimalInput {...decimalField('weightKg')} />
        </Field>
        <Field label="KFA (%)">
          <DecimalInput {...decimalField('bodyFatPct')} />
        </Field>
        <Field label="Kalorien">
          <Input type="number" {...field('calories')} />
        </Field>
        <Field label="Protein (g)">
          <Input type="number" {...field('protein')} />
        </Field>
        <Field label="Carbs (g)">
          <Input type="number" {...field('carbs')} />
        </Field>
        <Field label="Fett (g)">
          <Input type="number" {...field('fat')} />
        </Field>
        <Field label="Bauch (cm)">
          <DecimalInput {...decimalField('waist')} />
        </Field>
        <Field label="Arm (cm)">
          <DecimalInput {...decimalField('arm')} />
        </Field>
        <Field label="Brust (cm)">
          <DecimalInput {...decimalField('chest')} />
        </Field>
        <Field label="Bein (cm)">
          <DecimalInput {...decimalField('leg')} />
        </Field>
      </div>
      {bodyFatFromFfmi !== undefined && <p className="text-xs text-muted">KFA automatisch aus FFMI berechnet.</p>}
      <Field label="Notizen">
        <textarea
          {...field('notes')}
          rows={2}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
      </Field>
    </Card>
  )
}
