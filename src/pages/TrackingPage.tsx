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
import {
  calculateBodyFatFromFfmi,
  calendarWeekWeightDelta,
  deltaFromFirst,
  rollingAverage7,
  smoothedValue,
  weeklyDelta,
} from '../lib/calculator'
import { Card, CountUp, DecimalInput, Field, Input, Button, SegmentedControl } from '../components/ui'
import CollapsibleCard from '../components/CollapsibleCard'
import LogDayHeader from '../components/LogDayHeader'
import LogHistoryList from '../components/LogHistoryList'
import type { DayMarker } from '../components/DayStrip'
import { shareOrDownloadFile } from '../lib/share'
import { useSimpleMode } from '../lib/detailLevel'
import { chartLineAnimation } from '../lib/countUp'

type Ctx = { athlete: Athlete }

const MEASURES = [
  { key: 'waist', label: 'Bauch', color: '#facc15' },
  { key: 'arm', label: 'Arm', color: '#22d3ee' },
  { key: 'chest', label: 'Brust', color: '#e4e4e7' },
  { key: 'leg', label: 'Bein', color: '#fb923c' },
] as const satisfies readonly { key: keyof DailyEntry; label: string; color: string }[]

function formatCm(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** "+1,0" / "−3,5" / "±0" - mit echtem Minuszeichen. */
function formatSigned(n: number): string {
  if (n === 0) return '±0'
  return `${n > 0 ? '+' : '−'}${formatCm(Math.abs(n))}`
}

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
    bodyFatAvg: smoothedValue(series, i, 'bodyFatPct', 7),
    waist: entry.waist,
    arm: entry.arm,
    chest: entry.chest,
    leg: entry.leg,
    // Maße als Veränderung seit der ersten Messung - absolut lägen Arm (~38) und Brust (~100)
    // so weit auseinander, dass ein paar cm Veränderung in der Achse untergingen.
    waistDelta: deltaFromFirst(series, i, 'waist'),
    armDelta: deltaFromFirst(series, i, 'arm'),
    chestDelta: deltaFromFirst(series, i, 'chest'),
    legDelta: deltaFromFirst(series, i, 'leg'),
  }))
  const measures = MEASURES.map((m) => {
    const measured = series.filter((e) => e[m.key] !== undefined)
    const latest = measured[measured.length - 1]?.[m.key]
    const first = measured[0]?.[m.key]
    return { ...m, latest, delta: latest !== undefined && first !== undefined ? Math.round((latest - first) * 10) / 10 : undefined }
  }).filter((m) => m.latest !== undefined)
  // Symmetrisch um 0 und eng: schon 1 cm Veränderung ist deutlich zu sehen. Striche je cm,
  // bei großen Spannen je 2 oder 5 cm.
  const measureRange = Math.max(
    1,
    Math.ceil(Math.max(0, ...chartData.flatMap((d) => [d.waistDelta, d.armDelta, d.chestDelta, d.legDelta].map((v) => Math.abs(v ?? 0))))),
  )

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

  const measureStep = measureRange <= 4 ? 1 : measureRange <= 10 ? 2 : 5
  const measureTicks = Array.from(
    { length: Math.floor(measureRange / measureStep) * 2 + 1 },
    (_, i) => (i - Math.floor(measureRange / measureStep)) * measureStep,
  )
  const lineAnimation = chartLineAnimation()
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
                : (
                    <>
                      {calendarWeekComparison.deltaKg < 0 ? '−' : '+'}
                      <CountUp value={Math.abs(calendarWeekComparison.deltaKg)} decimals={1} /> kg
                    </>
                  )}
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
              {chart === 'measures' && !simple ? (
                <YAxis
                  domain={[-measureRange, measureRange]}
                  ticks={measureTicks}
                  tickFormatter={(v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')}
                  {...axis}
                  width={44}
                />
              ) : (
                <YAxis domain={['auto', 'auto']} {...axis} width={44} />
              )}
              <Tooltip
                {...tooltip}
                formatter={
                  chart === 'measures' && !simple
                    ? (value, name, item) => {
                        const m = MEASURES.find((x) => x.label === name)
                        const abs = m ? (item.payload as Record<string, number | undefined>)[m.key] : undefined
                        return [`${formatSigned(Number(value))} cm${abs !== undefined ? ` (${formatCm(abs)} cm)` : ''}`, name]
                      }
                    : (value) => (typeof value === 'number' ? value.toFixed(1) : value)
                }
              />
              {(simple || chart === 'weight') && (
                <>
                  {/* Rohgewicht bewusst gedimmt, der geglättete 7-Tage-Schnitt trägt den Akzent. */}
                  <Line {...lineAnimation} type="monotone" dataKey="weight" stroke="#a1a1aa" dot={false} name="Gewicht (kg)" connectNulls />
                  <Line {...lineAnimation} type="monotone" dataKey="weightAvg7" stroke="var(--color-accent)" dot={false} strokeWidth={2.5} name="Ø 7 Tage" connectNulls />
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
                <>
                  {/* Einzelmessungen nur als gedimmte Punkte - die geglättete Linie (Mittel der letzten
                      sieben Messungen, weich gezeichnet) trägt die Aussage, wie beim Gewicht. */}
                  <Line
                    {...lineAnimation}
                    dataKey="bodyFat"
                    stroke="transparent"
                    dot={{ r: 2, fill: '#f472b6', fillOpacity: 0.4, stroke: 'none' }}
                    activeDot={{ r: 3 }}
                    name="KFA gemessen (%)"
                    connectNulls
                  />
                  <Line {...lineAnimation} type="basis" dataKey="bodyFatAvg" stroke="#f472b6" strokeWidth={2.5} dot={false} name="KFA geglättet (%)" connectNulls />
                </>
              )}
              {!simple && chart === 'measures' && (
                <>
                  <ReferenceLine y={0} stroke="var(--color-muted)" strokeOpacity={0.6} />
                  {measures.map((m) => (
                    <Line
                      {...lineAnimation}
                      key={m.key}
                      type="monotone"
                      dataKey={`${m.key}Delta`}
                      stroke={m.color}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: m.color, stroke: 'none' }}
                      name={m.label}
                      connectNulls
                    />
                  ))}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {!simple && chart === 'measures' && (
          measures.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {measures.map((m) => (
                <div key={m.key} className="flex items-center gap-1.5 tabular-nums">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                  <span className="text-muted">{m.label}</span>
                  <span className="text-fg">{formatCm(m.latest!)} cm</span>
                  {m.delta !== undefined && m.delta !== 0 && <span className="text-muted">· {formatSigned(m.delta)}</span>}
                </div>
              ))}
              <p className="col-span-2 pt-1 text-[11px] text-muted">Linien: Veränderung seit der ersten Messung in cm.</p>
            </div>
          ) : (
            <p className="text-xs text-muted">Noch keine Maße erfasst.</p>
          )
        )}
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
            <p className="text-base font-semibold tabular-nums text-fg">{avg7 !== undefined ? (
                <>
                  <CountUp value={avg7} decimals={1} /> kg
                </>
              ) : (
                '–'
              )}</p>
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
