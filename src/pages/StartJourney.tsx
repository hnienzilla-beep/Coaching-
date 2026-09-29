import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Pencil, Sparkles } from 'lucide-react'
import { db } from '../db/db'
import { ACCENT_COLORS, todayIso } from '../db/queries'
import { applyAccentColor, getStoredOverviewAccent } from '../lib/accentColor'
import { getPrefs, type TabKey } from '../lib/prefs'
import { createFromStart, type StartAppChoices } from '../lib/startApply'
import {
  DEFAULT_ANSWERS,
  SPLIT_LABELS,
  recommendSupplements,
  splitsFor,
  supplementNamesFor,
  START_SUPPLEMENTS,
  buildMealPlans,
  buildTrainingPlan,
  computeTargets,
  suggestTargetWeight,
  suggestedSplit,
  targetWarning,
  type Allergen,
  type Focus,
  type Restriction,
  type StartAnswers,
} from '../lib/startPlan'
import { getStoredTheme } from '../lib/theme'
import ColorWheel from '../components/ColorWheel'
import { DecimalInput, Input } from '../components/ui'

/*
 * „Dein Start“ - der Einstieg für einen neuen Athleten: kurze Abschnitte mit wenigen Fragen,
 * am Ende eine Zusammenfassung mit Zielen und Plänen, die direkt angelegt werden. Der
 * Zwischenstand wird gemerkt, ein Abbruch setzt beim nächsten Öffnen dort fort.
 */

const DRAFT_KEY = 'coach.start.draft'

const SECTIONS = ['Über dich', 'Dein Ziel', 'Training', 'Ernährung', 'App', 'Fertig'] as const
type Step = { section: (typeof SECTIONS)[number] | null; title: string }
const STEPS: Step[] = [
  { section: null, title: 'Willkommen' },
  { section: 'Über dich', title: 'Wer bist du?' },
  { section: 'Über dich', title: 'Dein Körper' },
  { section: 'Über dich', title: 'Dein Alltag' },
  { section: 'Dein Ziel', title: 'Was willst du erreichen?' },
  { section: 'Dein Ziel', title: 'Dein Zielgewicht' },
  { section: 'Training', title: 'Dein Training' },
  { section: 'Training', title: 'Dauer & Schwerpunkte' },
  { section: 'Training', title: 'Dein Plan-Aufbau' },
  { section: 'Ernährung', title: 'Deine Ernährung' },
  { section: 'App', title: 'Deine App' },
  { section: 'Fertig', title: 'Dein Plan steht' },
]

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const FOCUS: Focus[] = ['Brust', 'Rücken', 'Beine', 'Po', 'Schultern', 'Arme', 'Bauch']
const RESTRICTIONS: { id: Restriction; label: string }[] = [
  { id: 'knie', label: 'Knie' },
  { id: 'schulter', label: 'Schulter' },
  { id: 'ruecken', label: 'Unterer Rücken' },
  { id: 'handgelenk', label: 'Handgelenk' },
  { id: 'ellbogen', label: 'Ellbogen' },
]
const ALLERGENS: { id: Allergen; label: string }[] = [
  { id: 'laktose', label: 'Laktose' },
  { id: 'gluten', label: 'Gluten' },
  { id: 'nuesse', label: 'Nüsse' },
  { id: 'ei', label: 'Ei' },
  { id: 'fisch', label: 'Fisch' },
  { id: 'soja', label: 'Soja' },
]
const BODY_FAT = [
  { pct: 10, text: 'Bauchmuskeln klar sichtbar' },
  { pct: 15, text: 'Bauchmuskeln angedeutet' },
  { pct: 20, text: 'Flacher Bauch, keine Kontur' },
  { pct: 25, text: 'Leichter Bauchansatz' },
  { pct: 30, text: 'Deutlicher Bauch' },
  { pct: 35, text: 'Viel Fett an Bauch & Hüfte' },
]

const DEFAULT_APP: StartAppChoices = {
  weightUnit: 'kg',
  lengthUnit: 'cm',
  volumeUnit: 'ml',
  theme: 'dark',
  accentColor: ACCENT_COLORS[0],
  startTab: 'dashboard',
  hiddenTabs: [],
  reminders: { weigh: false, food: false, water: false },
}

type Draft = { answers: StartAnswers; app: StartAppChoices; step: number }

function loadDraft(): Draft {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null
    if (raw?.answers) return { answers: { ...DEFAULT_ANSWERS, ...raw.answers }, app: { ...DEFAULT_APP, ...raw.app }, step: raw.step ?? 0 }
  } catch {
    // kein Entwurf
  }
  const prefs = getPrefs()
  return {
    answers: { ...DEFAULT_ANSWERS },
    app: { ...DEFAULT_APP, weightUnit: prefs.weightUnit, lengthUnit: prefs.lengthUnit, volumeUnit: prefs.volumeUnit, theme: getStoredTheme() },
    step: 0,
  }
}

export default function StartJourney() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const [saving, setSaving] = useState(false)
  const { answers: a, app, step } = draft
  const today = todayIso()
  const foods = useLiveQuery(() => db.foodItems.toArray(), [])
  const hasAthletes = useLiveQuery(async () => (await db.athletes.count()) > 0, [])

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Ohne Speicher geht der Zwischenstand beim Schließen verloren.
    }
  }, [draft])

  // Akzentfarbe live vorschauen; beim Verlassen zurück auf die Farbe der Übersicht.
  useEffect(() => {
    applyAccentColor(app.accentColor)
  }, [app.accentColor])
  useEffect(() => () => applyAccentColor(getStoredOverviewAccent()), [])

  const set = (patch: Partial<StartAnswers>) => setDraft((d) => ({ ...d, answers: { ...d.answers, ...patch } }))
  const setApp = (patch: Partial<StartAppChoices>) => setDraft((d) => ({ ...d, app: { ...d.app, ...patch } }))
  const go = (to: number) => {
    setDirection(to > step ? 'next' : 'prev')
    setDraft((d) => ({ ...d, step: Math.max(0, Math.min(STEPS.length - 1, to)) }))
    document.getElementById('start-scroll')?.scrollTo({ top: 0 })
  }

  const targets = useMemo(() => computeTargets(a, today), [a, today])
  const weightGoal = a.goal === 'abnehmen' || a.goal === 'aufbauen'
  const suggestion = suggestTargetWeight(a)
  const warning = weightGoal ? targetWarning(a, a.targetWeightKg ?? suggestion) : undefined
  const plan = useMemo(() => buildTrainingPlan(a), [a])
  const recommended = recommendSupplements(a)
  const meals = useMemo(() => (foods ? buildMealPlans(a, targets.result, foods) : []), [a, targets, foods])

  // Pflicht ist nur, was sich nicht sinnvoll raten lässt - der Rest hat Standardwerte.
  const canContinue = step !== 1 || a.firstName.trim().length > 0

  async function finish(answers: StartAnswers = a) {
    setSaving(true)
    const target = answers.goal === 'abnehmen' || answers.goal === 'aufbauen' ? (answers.targetWeightKg ?? suggestTargetWeight(answers)) : undefined
    const athlete = await createFromStart({ ...answers, firstName: answers.firstName.trim() || 'Ich', targetWeightKg: target }, app)
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      // egal
    }
    const start = app.hiddenTabs.includes(app.startTab) ? 'dashboard' : app.startTab
    navigate(`/athlete/${athlete.id}${start === 'dashboard' ? '' : `/${start}`}`, { replace: true })
  }

  async function skip() {
    if (!window.confirm('Überspringen? Für alles Offene nehme ich sinnvolle Standardwerte – du kannst alles später im Profil und in den Plänen ändern.')) return
    await finish()
  }

  // Wischen: nach links weiter, nach rechts zurück.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const current = STEPS[step]
  const sectionIndex = current.section ? SECTIONS.indexOf(current.section) : -1

  const body: ReactNode[] = [
    <Welcome key="w" />,
    <Block key="1">
      <Question label="Wie heißt du?" info="Dein Vorname steht in der Begrüßung und im Wochenrückblick.">
        <Input value={a.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="Vorname" autoFocus />
      </Question>
      <Question label="Geschlecht" info="Männer und Frauen haben bei gleichem Gewicht einen unterschiedlichen Grundumsatz.">
        <Chips options={[{ value: 'Männlich', label: 'Männlich' }, { value: 'Weiblich', label: 'Weiblich' }]} value={a.gender} onChange={(gender) => set({ gender })} />
      </Question>
      <Question label="Geburtsdatum" info="Das Alter fließt in den Kalorienbedarf ein und bleibt so automatisch aktuell.">
        <Input type="date" value={a.birthDate} max={today} onChange={(e) => e.target.value && set({ birthDate: e.target.value })} />
      </Question>
    </Block>,
    <Block key="2">
      <div className="grid grid-cols-2 gap-3">
        <Question label="Größe (cm)">
          <DecimalInput value={a.heightCm} onChange={(n) => n && set({ heightCm: n })} inputMode="decimal" />
        </Question>
        <Question label="Gewicht (kg)">
          <DecimalInput value={a.weightKg} onChange={(n) => n && set({ weightKg: n, targetWeightKg: undefined })} inputMode="decimal" />
        </Question>
      </div>
      <Question label="Körperfett – ungefähr (optional)" info="Hilft beim Vorschlag fürs Zielgewicht. Schätz nach dem Spiegelbild, es muss nicht genau sein.">
        <div className="grid grid-cols-3 gap-2">
          {BODY_FAT.map((b) => {
            const pct = a.gender === 'Weiblich' ? b.pct + 8 : b.pct
            const active = a.bodyFatPct === pct
            return (
              <button
                key={b.pct}
                type="button"
                onClick={() => set({ bodyFatPct: active ? undefined : pct, targetWeightKg: undefined })}
                className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition active:scale-95 ${active ? 'border-accent bg-accent/15' : 'border-border bg-surface-2'}`}
              >
                <Silhouette fat={b.pct} />
                <span className="text-sm font-semibold tabular-nums text-fg">{pct} %</span>
                <span className="text-[10px] leading-tight text-muted">{b.text}</span>
              </button>
            )
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Oder genau:
          <DecimalInput
            value={a.bodyFatPct}
            onChange={(n) => set({ bodyFatPct: n !== undefined && n > 2 && n < 70 ? n : undefined, targetWeightKg: undefined })}
            placeholder="z.B. 18,5"
            aria-label="Körperfett in Prozent"
            inputMode="decimal"
            className="w-24!"
          />
          %
        </label>
      </Question>
    </Block>,
    <Block key="3">
      <Chips
        options={[{ value: 'alltag', label: 'Mit Beispielen' }, { value: 'schritte', label: 'Nach Schritten' }]}
        value={a.activityMode}
        onChange={(activityMode) => set({ activityMode })}
      />
      {a.activityMode === 'alltag' ? (
        <Question label="Wie aktiv ist dein Alltag (ohne Training)?">
          <Options
            options={[
              { value: 'buero', label: 'Überwiegend sitzend', hint: 'Bürojob, Studium, viel am Schreibtisch' },
              { value: 'beine', label: 'Viel auf den Beinen', hint: 'Verkauf, Pflege, Gastro, viel zu Fuß' },
              { value: 'schwer', label: 'Körperlich schwer', hint: 'Bau, Handwerk, Lager' },
            ]}
            value={a.alltag}
            onChange={(alltag) => set({ alltag })}
          />
        </Question>
      ) : (
        <Question label="Wie viele Schritte machst du am Tag?">
          <Options
            options={[
              { value: 'wenig', label: 'Unter 5.000' },
              { value: 'mittel', label: '5.000 – 10.000' },
              { value: 'viel', label: 'Über 10.000' },
            ]}
            value={a.steps}
            onChange={(steps) => set({ steps })}
          />
        </Question>
      )}
    </Block>,
    <Block key="4">
      <Question label="Dein Ziel">
        <Options
          options={[
            { value: 'abnehmen', label: 'Abnehmen', hint: 'Fett verlieren, Muskeln halten' },
            { value: 'aufbauen', label: 'Muskeln aufbauen', hint: 'Mit leichtem Überschuss zunehmen' },
            { value: 'recomp', label: 'Recomp', hint: 'Fett runter, Muskeln rauf – Gewicht bleibt ähnlich' },
            { value: 'halten', label: 'Halten & fitter werden', hint: 'Gewicht halten, Leistung steigern' },
          ]}
          value={a.goal}
          onChange={(goal) => set({ goal, targetWeightKg: undefined })}
        />
      </Question>
      {weightGoal && (
        <Question label="Tempo" info="Langsamer ist leichter durchzuhalten und schont beim Abnehmen die Muskeln.">
          <Options
            options={(['sanft', 'normal', 'ehrgeizig'] as const).map((tempo) => {
              const rate = Math.abs(computeTargets({ ...a, tempo }, today).weeklyRateKg)
              return { value: tempo, label: { sanft: 'Sanft', normal: 'Normal', ehrgeizig: 'Ehrgeizig' }[tempo], hint: `ca. ${rate.toLocaleString('de-DE')} kg pro Woche` }
            })}
            value={a.tempo}
            onChange={(tempo) => set({ tempo })}
          />
        </Question>
      )}
    </Block>,
    <Block key="5">
      {weightGoal ? (
        <Question label="Zielgewicht (kg)" info="Vorschlag aus Größe, Gewicht und – falls angegeben – Körperfett. Du kannst ihn ändern.">
          <DecimalInput value={a.targetWeightKg ?? suggestion} onChange={(n) => set({ targetWeightKg: n })} inputMode="decimal" />
          {warning ? (
            <p className="flex gap-1.5 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warning}
            </p>
          ) : (
            targets.targetDate && (
              <p className="text-xs text-muted">
                Bei deinem Tempo etwa am{' '}
                <span className="font-semibold text-fg">{new Date(`${targets.targetDate}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              </p>
            )
          )}
        </Question>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Bei deinem Ziel bleibt das Gewicht ungefähr gleich – ein Zielgewicht brauchst du nicht.</p>
      )}
      <Question label="Wie möchtest du essen?" info="Bestimmt die Verteilung von Protein, Kohlenhydraten und Fett.">
        <Options
          options={[
            { value: 'ausgewogen', label: 'Ausgewogen', hint: '2,0 g Protein je kg, moderates Fett' },
            { value: 'protein', label: 'High-Protein', hint: '2,3 g Protein und 0,8 g Fett je kg – sättigt gut' },
            { value: 'lowcarb', label: 'Low-Carb', hint: 'Mehr Fett, weniger Kohlenhydrate' },
          ]}
          value={a.macroStyle}
          onChange={(macroStyle) => set({ macroStyle })}
        />
      </Question>
    </Block>,
    <Block key="6">
      <Question label="Wie lange trainierst du schon?">
        <Chips
          options={[
            { value: 'einsteiger', label: 'Einsteiger' },
            { value: 'fortgeschritten', label: '1–3 Jahre' },
            { value: 'erfahren', label: '3+ Jahre' },
          ]}
          value={a.experience}
          onChange={(experience) => set({ experience, split: undefined })}
        />
      </Question>
      <Question label="An welchen Tagen trainierst du?" info="Die Tage bestimmen den Plan-Aufbau. An anderen Tagen zeigt das Dashboard einen Ruhetag.">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => {
            const on = a.trainingDays.includes(i)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => set({ trainingDays: on ? a.trainingDays.filter((x) => x !== i) : [...a.trainingDays, i].sort(), split: undefined })}
                className={`rounded-xl py-2.5 text-sm font-semibold transition active:scale-95 ${on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'}`}
              >
                {d}
              </button>
            )
          })}
        </div>
      </Question>
      <Question label="Wo trainierst du?">
        <Chips
          options={[
            { value: 'studio', label: 'Studio' },
            { value: 'zuhause', label: 'Zuhause' },
            { value: 'beides', label: 'Beides' },
          ]}
          value={a.location}
          onChange={(location) => set({ location })}
        />
        {a.location === 'zuhause' && <p className="text-xs text-muted">Zuhause plane ich mit Kurzhanteln und Körpergewicht.</p>}
      </Question>
    </Block>,
    <Block key="7">
      <Question label="Zeit pro Training">
        <Chips options={([30, 45, 60, 90] as const).map((m) => ({ value: m, label: `${m} min` }))} value={a.durationMin} onChange={(durationMin) => set({ durationMin })} />
      </Question>
      <Question label="Schwerpunkte (bis zu 3, optional)" info="Diese Muskeln bekommen mehr Sätze.">
        <MultiChips options={FOCUS.map((f) => ({ value: f, label: f }))} value={a.focus} max={3} onChange={(focus) => set({ focus })} />
      </Question>
      <Question label="Beschwerden? (optional)" info="Übungen, die diese Stellen belasten, ersetze ich durch schonendere.">
        <MultiChips options={RESTRICTIONS.map((r) => ({ value: r.id, label: r.label }))} value={a.restrictions} onChange={(restrictions) => set({ restrictions })} />
      </Question>
    </Block>,
    <Block key="8">
      <Question label="Plan-Aufbau" info="Vorschlag passend zu deinen Tagen und deiner Erfahrung – du kannst ihn ändern.">
        <Options
          options={splitsFor(a.trainingDays.length).map((s) => ({
            value: s,
            label: SPLIT_LABELS[s],
            hint: s === suggestedSplit(a.trainingDays.length, a.experience) ? 'Empfohlen für dich' : undefined,
          }))}
          value={a.split && splitsFor(a.trainingDays.length).includes(a.split) ? a.split : suggestedSplit(a.trainingDays.length, a.experience)}
          onChange={(split) => set({ split })}
        />
      </Question>
      <Question label="Cardio einplanen?">
        <Chips options={[{ value: 'ja', label: 'Ja' }, { value: 'nein', label: 'Nein' }]} value={a.cardio ? 'ja' : 'nein'} onChange={(v) => set({ cardio: v === 'ja' })} />
        {a.cardio && (
          <Chips options={[30, 60, 90, 120, 150].map((m) => ({ value: m, label: `${m} min/Wo.` }))} value={a.cardioMinutes} onChange={(cardioMinutes) => set({ cardioMinutes })} />
        )}
      </Question>
    </Block>,
    <Block key="9">
      <Question label="Ernährungsform">
        <Chips
          options={[
            { value: 'alles', label: 'Alles' },
            { value: 'vegetarisch', label: 'Vegetarisch' },
            { value: 'vegan', label: 'Vegan' },
            { value: 'pescetarisch', label: 'Pescetarisch' },
          ]}
          value={a.diet}
          onChange={(diet) => set({ diet })}
        />
      </Question>
      <Question label="Unverträglichkeiten (optional)" info="Diese Lebensmittel lasse ich im Ernährungsplan weg.">
        <MultiChips options={ALLERGENS.map((x) => ({ value: x.id, label: x.label }))} value={a.allergens} onChange={(allergens) => set({ allergens })} />
      </Question>
      <Question label="Supplements" info="Vorausgewählt ist, was zu deinen Angaben passt (Training, Ernährungsform, Ziel). Daraus entsteht dein Supplementplan mit üblicher Dosis und Zeitpunkt.">
        <MultiChips
          options={[...new Set([...recommended.map((r) => r.name), ...START_SUPPLEMENTS])].map((s) => ({ value: s, label: s }))}
          value={supplementNamesFor(a)}
          onChange={(supplements) => set({ supplements, supplementsTouched: true })}
        />
        {!a.supplementsTouched && recommended.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            {recommended.map((r) => (
              <li key={r.name}>
                <span className="font-medium text-fg">{r.name}:</span> {r.reason}
              </li>
            ))}
          </ul>
        )}
      </Question>
    </Block>,
    <Block key="10">
      <Question label="Einheiten">
        <div className="grid grid-cols-3 gap-2">
          <Chips options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]} value={app.weightUnit} onChange={(weightUnit) => setApp({ weightUnit })} />
          <Chips options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'inch' }]} value={app.lengthUnit} onChange={(lengthUnit) => setApp({ lengthUnit })} />
          <Chips options={[{ value: 'ml', label: 'ml' }, { value: 'oz', label: 'oz' }]} value={app.volumeUnit} onChange={(volumeUnit) => setApp({ volumeUnit })} />
        </div>
      </Question>
      <Question label="Farbschema">
        <Chips
          options={[
            { value: 'light', label: 'Hell' },
            { value: 'dark', label: 'Dunkel' },
            { value: 'system', label: 'System' },
          ]}
          value={app.theme}
          onChange={(theme) => setApp({ theme })}
        />
      </Question>
      <Question label="Akzentfarbe">
        <div className="flex justify-center">
          <ColorWheel value={app.accentColor} onChange={(accentColor) => setApp({ accentColor })} onCommit={(accentColor) => setApp({ accentColor })} />
        </div>
      </Question>
      <Question label="Welche Bereiche brauchst du?" info="Ausgeblendete Reiter kannst du später in den Einstellungen wieder einschalten.">
        <MultiChips
          options={(['dashboard', 'tracking', 'ernaehrung', 'training'] as TabKey[]).map((t) => ({ value: t, label: TAB_NAMES[t] }))}
          value={(['dashboard', 'tracking', 'ernaehrung', 'training'] as TabKey[]).filter((t) => !app.hiddenTabs.includes(t))}
          min={1}
          onChange={(shown) => setApp({ hiddenTabs: (['dashboard', 'tracking', 'ernaehrung', 'training'] as TabKey[]).filter((t) => !shown.includes(t)) })}
        />
      </Question>
      <Question label="Startseite">
        <Chips
          options={(['dashboard', 'tracking', 'ernaehrung', 'training'] as TabKey[]).filter((t) => !app.hiddenTabs.includes(t)).map((t) => ({ value: t, label: TAB_NAMES[t] }))}
          value={app.startTab}
          onChange={(startTab) => setApp({ startTab })}
        />
      </Question>
      <Question label="Erinnerungen" info="Kommen, solange die App offen oder im Hintergrund ist. Einstellbar später unter Einstellungen → Erinnerungen.">
        <MultiChips
          options={[
            { value: 'weigh', label: 'Wiegen (morgens)' },
            { value: 'food', label: 'Essen eintragen (abends)' },
            { value: 'water', label: 'Wasser trinken' },
          ]}
          value={(['weigh', 'food', 'water'] as const).filter((k) => app.reminders[k])}
          onChange={(on) => {
            setApp({ reminders: { weigh: on.includes('weigh'), food: on.includes('food'), water: on.includes('water') } })
            if (on.length && typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
          }}
        />
      </Question>
    </Block>,
    <Summary
      key="11"
      a={a}
      targets={targets}
      weightGoal={weightGoal}
      plan={plan}
      meals={meals}
      onEdit={go}
    />,
  ]

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-accent">Dein Start</span>
          <div className="flex items-center gap-3">
            {/* Nur wenn es schon einen Athleten gibt - sonst gäbe es nichts, wohin man zurückkann. */}
            {hasAthletes && (
              <button type="button" onClick={() => navigate(-1)} className="text-sm text-muted">
                Abbrechen
              </button>
            )}
            {step < STEPS.length - 1 && (
              <button type="button" onClick={() => void skip()} disabled={saving} className="text-sm text-muted">
                Überspringen
              </button>
            )}
          </div>
        </div>
        {sectionIndex >= 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex gap-1">
              {SECTIONS.map((s, i) => (
                <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full bg-accent transition-[width] duration-500 ${i <= sectionIndex ? 'w-full' : 'w-0'}`} />
                </div>
              ))}
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{current.section}</span>
          </div>
        )}
      </header>

      <main
        id="start-scroll"
        className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = touch.current
          touch.current = null
          if (!s) return
          const dx = e.changedTouches[0].clientX - s.x
          const dy = e.changedTouches[0].clientY - s.y
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
          if (dx > 0 && step > 0) go(step - 1)
          if (dx < 0 && step < STEPS.length - 1 && canContinue) go(step + 1)
        }}
      >
        <div key={step} className={direction === 'next' ? 'anim-slide-from-right' : 'anim-slide-from-left'}>
          {step > 0 && <h1 className="mb-4 text-2xl font-bold tracking-tight text-fg">{current.title}</h1>}
          {body[step]}
        </div>
      </main>

      <footer className="flex shrink-0 gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="flex items-center gap-1 rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium text-fg transition active:scale-95">
            <ChevronLeft size={18} /> Zurück
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => go(step + 1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg transition active:scale-95 disabled:opacity-40"
          >
            {step === 0 ? 'Los geht’s' : 'Weiter'} <ChevronRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void finish()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg transition active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Wird angelegt …' : 'Pläne übernehmen'}
          </button>
        )}
      </footer>
    </div>
  )
}

const DIET_LABELS: Record<StartAnswers['diet'], string> = { alles: 'Mischkost', vegetarisch: 'vegetarisch', vegan: 'vegan', pescetarisch: 'pescetarisch' }

const TAB_NAMES: Record<TabKey, string> = { dashboard: 'Dashboard', tracking: 'Tracking', ernaehrung: 'Ernährung', training: 'Training' }

/* ------------------------------------------------------------------------------------------ */

function Welcome() {
  return (
    <div className="flex flex-col items-center gap-5 pt-10 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-accent/15 text-accent">
        <Sparkles size={36} />
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-fg">Dein Start</h1>
      <p className="text-base text-muted">
        Ein paar kurze Fragen zu dir, deinem Ziel, deinem Training und deiner Ernährung. Daraus erstelle ich deine Kalorien- und Makroziele, einen Trainingsplan und
        einen Ernährungsplan.
      </p>
      <ul className="flex w-full flex-col gap-2 text-left text-sm text-fg">
        {['5 kurze Abschnitte', 'Jederzeit zurück oder überspringen', 'Am Ende alles prüfen und anpassen'].map((t) => (
          <li key={t} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Block({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>
}

function Question({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-fg">{label}</span>
        {info && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Erklärung" aria-expanded={open} className="text-muted">
            <Info size={15} />
          </button>
        )}
      </div>
      {open && info && <p className="anim-pop rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">{info}</p>}
      {children}
    </div>
  )
}

function Chips<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition active:scale-95 ${value === o.value ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function MultiChips<T extends string>({ options, value, onChange, max, min = 0 }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; max?: number; min?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value)
        const blocked = (!on && max !== undefined && value.length >= max) || (on && value.length <= min)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={blocked}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={`rounded-full px-3.5 py-2 text-sm transition active:scale-95 disabled:opacity-40 ${on ? 'bg-accent font-medium text-accent-fg' : 'bg-surface-2 text-fg'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Options<T extends string>({ options, value, onChange }: { options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-col rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[0.98] ${value === o.value ? 'border-accent bg-accent/15' : 'border-border bg-surface-2'}`}
        >
          <span className="text-sm font-semibold text-fg">{o.label}</span>
          {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

/** Stilisierte Silhouette - die Taille wird mit dem Körperfett breiter. */
function Silhouette({ fat }: { fat: number }) {
  const waist = 9 + (fat - 10) * 0.45
  return (
    <svg width="34" height="48" viewBox="0 0 34 48" aria-hidden="true">
      <circle cx="17" cy="6" r="4.5" fill="var(--color-muted)" />
      <path
        d={`M${17 - 10} 13 Q17 11 ${17 + 10} 13 L${17 + waist} 30 Q${17 + waist - 1} 36 ${17 + 7} 38 L${17 + 6} 47 L${17 - 6} 47 L${17 - 7} 38 Q${17 - waist + 1} 36 ${17 - waist} 30 Z`}
        fill="var(--color-muted)"
      />
    </svg>
  )
}

function Summary({
  a,
  targets,
  weightGoal,
  plan,
  meals,
  onEdit,
}: {
  a: StartAnswers
  targets: ReturnType<typeof computeTargets>
  weightGoal: boolean
  plan: ReturnType<typeof buildTrainingPlan>
  meals: ReturnType<typeof buildMealPlans>
  onEdit: (step: number) => void
}) {
  const r = targets.result
  const fmt = (n: number) => n.toLocaleString('de-DE')
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Prüf alles kurz – mit „Anpassen“ springst du zur passenden Frage zurück.</p>
      <SummaryCard title="Kalorien & Makros" onEdit={() => onEdit(5)}>
        <p className="text-3xl font-bold tabular-nums text-accent">
          {fmt(r.targetCalories)} <span className="text-base font-normal text-muted">kcal / Tag</span>
        </p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted">
          {[
            ['Protein', r.proteinG],
            ['Carbs', r.carbsG],
            ['Fett', r.fatG],
          ].map(([label, g]) => (
            <div key={label} className="rounded-lg bg-surface-2 py-1.5">
              <p className="text-base font-semibold tabular-nums text-fg">{g} g</p>
              {label}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Wasser: {(targets.waterMl / 1000).toLocaleString('de-DE')} l pro Tag</p>
      </SummaryCard>
      <SummaryCard title="Ziel" onEdit={() => onEdit(4)}>
        {weightGoal && targets.targetWeightKg !== undefined ? (
          <p className="text-sm text-fg">
            {fmt(a.weightKg)} kg → <span className="font-semibold">{fmt(targets.targetWeightKg)} kg</span>
            {targets.targetDate && (
              <span className="text-muted">
                {' '}
                · etwa am {new Date(`${targets.targetDate}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-fg">{a.goal === 'recomp' ? 'Recomp – Gewicht ungefähr halten' : 'Gewicht halten, fitter werden'}</p>
        )}
      </SummaryCard>
      <SummaryCard title={`Trainingsplan · ${a.trainingDays.length}× pro Woche`} onEdit={() => onEdit(6)}>
        <div className="flex flex-col gap-2">
          {plan.map((d) => (
            <div key={d.name}>
              <p className="text-sm font-semibold text-fg">{d.name}</p>
              <p className="text-xs text-muted">{d.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · ')}</p>
            </div>
          ))}
        </div>
      </SummaryCard>
      <SummaryCard title="Ernährungsplan" onEdit={() => onEdit(9)}>
        <p className="text-xs text-muted">
          Abgestimmt auf {fmt(r.targetCalories)} kcal und deine Makros · {DIET_LABELS[a.diet]}
          {a.allergens.length > 0 && ` · ohne ${a.allergens.map((x) => ALLERGENS.find((y) => y.id === x)?.label).join(', ')}`}
        </p>
        {meals.map((m) => (
          <details key={m.name} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
            <summary className="flex cursor-pointer items-baseline justify-between gap-2 text-sm">
              <span className="text-fg">{m.name}</span>
              <span className="text-xs tabular-nums text-muted">
                {fmt(m.totals.kcal)} kcal · P {m.totals.protein} · C {m.totals.carbs} · F {m.totals.fat}
              </span>
            </summary>
            <div className="mt-1.5 flex flex-col gap-1 pb-1">
              {[...new Set(m.items.map((i) => i.meal))].map((meal) => (
                <p key={meal} className="text-xs text-muted">
                  <span className="font-medium text-fg">{meal}:</span>{' '}
                  {m.items
                    .filter((i) => i.meal === meal)
                    .map((i) => `${i.food} ${i.grams} g`)
                    .join(', ')}
                </p>
              ))}
            </div>
          </details>
        ))}
      </SummaryCard>
      {supplementNamesFor(a).length > 0 && (
        <SummaryCard title="Supplementplan" onEdit={() => onEdit(9)}>
          <p className="text-sm text-fg">{supplementNamesFor(a).join(', ')}</p>
          <p className="text-xs text-muted">Mit üblicher Dosis und Einnahmezeit – im Supplementplan änderbar.</p>
        </SummaryCard>
      )}
    </div>
  )
}

function SummaryCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
        <button type="button" onClick={onEdit} className="flex items-center gap-1 text-xs text-accent">
          <Pencil size={12} /> Anpassen
        </button>
      </div>
      {children}
    </section>
  )
}
