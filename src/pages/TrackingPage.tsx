import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { Card, DecimalInput, Field, Input, Button, SegmentedControl } from '../components/ui'
import CollapsibleCard from '../components/CollapsibleCard'
import LogDayHeader from '../components/LogDayHeader'
import LogHistoryList from '../components/LogHistoryList'
import type { DayMarker } from '../components/DayStrip'
import { shareOrDownloadFile } from '../lib/share'
import { useSimpleMode } from '../lib/detailLevel'

type Ctx = { athlete: Athlete }

export default function TrackingPage() {
  const { athlete } = useOutletContext<Ctx>()
  const simple = useSimpleMode()
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

  const [chart, setChart] = useState<'weight' | 'bodyFat' | 'measures'>('weight')

  // Punkte in Wochenleiste und Monatskalender: Tage mit Gewicht oder KFA.
  const markers = new Map<string, DayMarker>(
    series.filter((e) => e.weightKg !== undefined || e.bodyFatPct !== undefined).map((e) => [e.date, 'done']),
  )
  const hasData = selectedEntry !== undefined && (selectedEntry.weightKg !== undefined || selectedEntry.bodyFatPct !== undefined)

  const axis = { tick: { fontSize: 10, fill: 'var(--color-muted)' } }
  const tooltip = {
    contentStyle: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 12 },
  }

  return (
    <div className="flex flex-col gap-4">
      <LogDayHeader
        title="Tracking"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        markers={markers}
        status={hasData ? 'logged' : 'none'}
      />

      {/* Beim Tageswechsel neu eingeblendet - so sieht man, dass sich der Inhalt geändert hat. */}
      <div key={selectedDate} className="anim-page flex flex-col gap-4">
        <DayEditor
          athleteId={athlete.id}
          date={selectedDate}
          entry={selectedEntry}
          avg7={avg7}
          delta={delta}
          ffmi={athlete.ffmi}
          heightCm={athlete.heightCm}
          simple={simple}
        />
      </div>

      <Card className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-muted">Kalenderwoche im Vergleich</h2>
        {calendarWeekComparison ? (
          <>
            <p className={`text-xl font-semibold ${calendarWeekComparison.deltaKg < 0 ? 'text-ok' : 'text-fg'}`}>
              {calendarWeekComparison.deltaKg === 0
                ? 'Gewicht gehalten'
                : `${calendarWeekComparison.deltaKg < 0 ? '−' : '+'}${Math.abs(calendarWeekComparison.deltaKg).toFixed(1)} kg`}
            </p>
            <p className="text-xs text-muted">
              Ø {calendarWeekComparison.thisWeekAvg.toFixed(1)} kg diese Woche · Ø {calendarWeekComparison.lastWeekAvg.toFixed(1)} kg letzte
              Woche
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Noch nicht genug Daten für einen Vergleich.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        {/* Ein Diagramm mit Umschalter statt drei untereinander - die Seite bleibt kurz. */}
        {simple ? (
          <h2 className="text-sm font-semibold text-muted">Gewicht</h2>
        ) : (
          <SegmentedControl
            size="sm"
            options={[
              { key: 'weight', label: 'Gewicht' },
              { key: 'bodyFat', label: 'KFA' },
              { key: 'measures', label: 'Maße' },
            ]}
            value={chart}
            onChange={setChart}
          />
        )}
        <div key={chart} className="anim-page h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" {...axis} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} {...axis} width={44} />
              <Tooltip {...tooltip} />
              {(simple || chart === 'weight') && (
                <>
                  {/* Rohgewicht bewusst gedimmt, der geglättete 7-Tage-Schnitt trägt den Akzent. */}
                  <Line type="monotone" dataKey="weight" stroke="#a1a1aa" dot={false} name="Gewicht (kg)" connectNulls />
                  <Line type="monotone" dataKey="weightAvg7" stroke="var(--color-accent)" dot={false} strokeWidth={2.5} name="Ø 7 Tage" connectNulls />
                  {athlete.targetWeightKg !== undefined && (
                    <ReferenceLine
                      y={athlete.targetWeightKg}
                      stroke="#f472b6"
                      strokeDasharray="4 4"
                      label={{ value: 'Ziel', position: 'insideTopRight', fill: '#f472b6', fontSize: 10 }}
                    />
                  )}
                </>
              )}
              {!simple && chart === 'bodyFat' && (
                <Line type="monotone" dataKey="bodyFat" stroke="#f472b6" strokeWidth={2} dot={false} name="KFA (%)" connectNulls />
              )}
              {!simple && chart === 'measures' && (
                <>
                  <Line type="monotone" dataKey="waist" stroke="#facc15" dot={false} name="Bauch (cm)" connectNulls />
                  <Line type="monotone" dataKey="arm" stroke="#22d3ee" dot={false} name="Arm (cm)" connectNulls />
                  <Line type="monotone" dataKey="chest" stroke="#e4e4e7" dot={false} name="Brust (cm)" connectNulls />
                  <Line type="monotone" dataKey="leg" stroke="#fb923c" dot={false} name="Bein (cm)" connectNulls />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <LogHistoryList
        entries={[...series]
          .reverse()
          .filter((e) => e.weightKg !== undefined || e.bodyFatPct !== undefined)
          .map((e) => ({
            date: e.date,
            summary: [e.weightKg !== undefined ? `${e.weightKg} kg` : undefined, e.bodyFatPct !== undefined ? `${e.bodyFatPct} %` : undefined]
              .filter(Boolean)
              .join(' · '),
          }))}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        emptyText="Noch keine Einträge."
      />

      {!simple && (
        <CollapsibleCard title="Fortschritt teilen" defaultExpanded={false}>
          <p className="text-xs text-muted">
            Exportiert die letzten 7 Tage aus Tracking, Ernährungs-Log und Trainings-Log zum Versenden. Beim Importieren
            werden diese Tage für {athlete.name} aktualisiert.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExportProgress} className="flex-1">
              Exportieren
            </Button>
            <Button variant="secondary" onClick={() => importProgressInputRef.current?.click()} className="flex-1">
              Importieren
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
        </CollapsibleCard>
      )}
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
  simple,
}: {
  athleteId: string
  date: string
  entry?: DailyEntry
  avg7?: number
  delta?: number
  ffmi?: number
  heightCm: number
  simple: boolean
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
    // Sicherheitsnetz: unbrauchbare Zahlen (NaN aus einer alten Eingabe) werden nicht
    // gespeichert - sonst kippen Diagramme und Durchschnitte auf NaN.
    for (const [key, val] of Object.entries(updated)) {
      if (typeof val === 'number' && !Number.isFinite(val)) {
        delete (updated as Record<string, unknown>)[key]
      }
    }
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
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted">Messwerte</h2>
          <span className={`text-xs text-ok transition-opacity duration-500 ${showSaved ? 'opacity-100' : 'opacity-0'}`}>✓ Gespeichert</span>
        </div>
        {/* Gewicht ist der tägliche Eintrag schlechthin - groß und zuerst. */}
        <div className="grid grid-cols-2 gap-3">
          <BigField label="Gewicht" unit="kg">
            <DecimalInput {...decimalField('weightKg')} placeholder="–" className="border-0! bg-transparent! px-0! py-0! text-3xl! font-bold" />
          </BigField>
          <BigField label="KFA" unit="%">
            <DecimalInput {...decimalField('bodyFatPct')} placeholder="–" className="border-0! bg-transparent! px-0! py-0! text-3xl! font-bold" />
          </BigField>
        </div>
        {bodyFatFromFfmi !== undefined && <p className="-mt-2 text-xs text-muted">KFA automatisch aus FFMI berechnet.</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-muted">Ø 7 Tage</p>
            <p className="text-base font-semibold tabular-nums text-fg">{avg7 !== undefined ? `${avg7.toFixed(1)} kg` : '–'}</p>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-muted">Δ zur Vorwoche</p>
            <p className={`text-base font-semibold tabular-nums ${delta !== undefined && delta < 0 ? 'text-ok' : 'text-fg'}`}>
              {delta !== undefined ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg` : '–'}
            </p>
          </div>
        </div>
        <Field label="Notizen">
          <textarea
            {...field('notes')}
            rows={2}
            placeholder="Schlaf, Stress, Besonderheiten …"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </Field>
      </Card>

      {/* Kalorien und Makros trägt das Ernährungs-Log ein, Umfänge misst man selten - beides
          eingeklappt. In der Einfach-Ansicht entfällt es ganz. */}
      {!simple && (
        <CollapsibleCard title="Weitere Werte" defaultExpanded={false}>
          <div className="grid grid-cols-2 gap-3">
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
        </CollapsibleCard>
      )}
    </>
  )
}

/** Großes Eingabefeld mit Einheit - für die Werte, die man täglich einträgt. */
function BigField({ label, unit, children }: { label: string; unit: string; children: ReactNode }) {
  return (
    <label className="flex flex-col rounded-2xl bg-surface-2 px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-baseline gap-1">
        {children}
        <span className="shrink-0 text-sm text-muted">{unit}</span>
      </span>
    </label>
  )
}
