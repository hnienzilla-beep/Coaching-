import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  Apple,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  HeartPulse,
  Home,
  Info,
  LineChart,
  Lock,
  Pencil,
  Repeat,
  Scale,
  Smartphone,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  Utensils,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { db } from '../db/db'
import { ACCENT_COLORS, todayIso } from '../db/queries'
import { applyAccentColor, getStoredOverviewAccent } from '../lib/accentColor'
import { getPrefs, setPrefs, usePrefs, type TabKey } from '../lib/prefs'
import { createFromStart, updateFromStart, type StartAppChoices } from '../lib/startApply'
import {
  DEFAULT_ANSWERS,
  LIFT_LABELS,
  LOCATION_LABELS,
  SPLIT_LABELS,
  VOLUME_MUSCLES,
  buildTrainingWeek,
  catalogByMuscle,
  effectiveSplit,
  planUnits,
  recommendSupplements,
  sessionsPerWeek,
  splitOptions,
  suggestedSplitFor,
  supplementNamesFor,
  supplementInfo,
  START_SUPPLEMENTS,
  buildMealPlans,
  computeTargets,
  suggestTargetWeight,
  targetWarning,
  tier,
  type Allergen,
  type Lift,
  type Restriction,
  type TrainingWeek,
  type StartAnswers,
} from '../lib/startPlan'
import { getStoredTheme } from '../lib/theme'
import { isCreatine } from '../lib/water'
import type { Athlete } from '../models/types'
import ColorWheel from '../components/ColorWheel'
import { Toggle } from '../components/SettingsControls'
import { DecimalInput, Input } from '../components/ui'
import VolumeBars from '../components/VolumeBars'

/*
 * „Dein Start“ - der Einstieg für einen neuen Athleten: kurze Abschnitte mit wenigen Fragen,
 * am Ende eine Zusammenfassung mit Zielen und Plänen, die direkt angelegt werden. Der
 * Zwischenstand wird gemerkt, ein Abbruch setzt beim nächsten Öffnen dort fort.
 */

const DRAFT_KEY = 'coach.start.draft'

const SECTIONS = ['Über dich', 'Dein Ziel', 'Training', 'Ernährung', 'App', 'Fertig'] as const
const SECTION_ICONS: Record<(typeof SECTIONS)[number], LucideIcon> = {
  'Über dich': User,
  'Dein Ziel': Target,
  Training: Dumbbell,
  Ernährung: Utensils,
  App: Smartphone,
  Fertig: Check,
}
/** Zwischenbildschirm beim Betreten eines Abschnitts. */
const SECTION_INTROS: Record<(typeof SECTIONS)[number], string> = {
  'Über dich': 'Ein paar Eckdaten – daraus berechne ich deinen Bedarf.',
  'Dein Ziel': 'Wohin soll die Reise gehen?',
  Training: 'Jetzt bauen wir deinen Trainingsplan.',
  Ernährung: 'Essen, das zu deinem Ziel passt.',
  App: 'Zum Schluss machst du die App zu deiner.',
  Fertig: '',
}
/** `guide`: was der Coach in diesem Schritt sagt - mit Vornamen, sobald er bekannt ist. */
type Step = { section: (typeof SECTIONS)[number] | null; title: string; guide?: (name: string) => string }
const hi = (name: string, text: string) => (name ? `${name}, ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text)
const STEPS: Step[] = [
  { section: null, title: 'Willkommen' },
  { section: 'Über dich', title: 'Wer bist du?', guide: () => 'Schön, dass du da bist! Ich führe dich Schritt für Schritt durch. Fang mit deinem Vornamen an.' },
  { section: 'Über dich', title: 'Dein Körper', guide: (n) => hi(n, 'Jetzt deine Eckdaten. Größe und Gewicht reichen – Körperfett ist optional, eine Schätzung nach dem Spiegelbild genügt.') },
  { section: 'Über dich', title: 'Dein Alltag', guide: () => 'Wie viel bewegst du dich außerhalb vom Training? Das macht beim Kalorienbedarf oft mehr aus als das Training selbst.' },
  { section: 'Dein Ziel', title: 'Was willst du erreichen?', guide: (n) => hi(n, 'Was willst du erreichen? Danach richte ich Kalorien, Training und Tempo aus.') },
  { section: 'Dein Ziel', title: 'Dein Zielgewicht', guide: () => 'Ich habe dir ein realistisches Zielgewicht vorgeschlagen. Passt es, einfach weiter – sonst trag dein eigenes ein.' },
  { section: 'Training', title: 'Dein Training', guide: (n) => hi(n, 'Weiter zum Training. Sag mir, wie erfahren du bist und an welchen Tagen du trainieren kannst.') },
  { section: 'Training', title: 'Zeit & Übungen', guide: () => 'Wie viel Zeit hast du pro Einheit? Ich plane so, dass alles reinpasst – und lasse Übungen weg, die dir Beschwerden machen.' },
  { section: 'Training', title: 'Dein Plan-Aufbau', guide: () => 'Diesen Aufbau schlage ich für deine Tage vor. Du kannst ihn ändern – oder einfach weiter.' },
  { section: 'Training', title: 'Deine Schwerpunkte', guide: () => 'Möchtest du bestimmte Muskeln betonen? Das ist optional – ohne Auswahl trainierst du ausgewogen.' },
  { section: 'Ernährung', title: 'Deine Ernährung', guide: (n) => hi(n, 'Fast geschafft! Noch kurz zur Ernährung, dann stelle ich deinen Ernährungs- und Supplementplan zusammen.') },
  { section: 'App', title: 'Deine App', guide: () => 'Letzter Schritt: Einheiten, Farben und welche Bereiche du brauchst. Alles später in den Einstellungen änderbar.' },
  { section: 'Fertig', title: 'Dein Plan steht' },
]

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
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

/**
 * Erneuter Durchlauf für einen bestehenden Athleten: vorbelegt mit seinen letzten Antworten
 * (ältere Athleten ohne gespeicherte Antworten: aus dem Profil), dazu aktuelle Werte und
 * App-Einstellungen. Startet direkt bei der ersten Frage.
 */
function draftFromAthlete(athlete: Athlete, latest: { weightKg?: number; bodyFatPct?: number }): Draft {
  const saved = (athlete.startAnswers ?? {}) as Partial<StartAnswers>
  const prefs = getPrefs()
  return {
    answers: {
      ...DEFAULT_ANSWERS,
      ...saved,
      firstName: athlete.name,
      gender: athlete.gender,
      ...(athlete.birthDate ? { birthDate: athlete.birthDate } : {}),
      ...(athlete.heightCm ? { heightCm: athlete.heightCm } : {}),
      weightKg: latest.weightKg ?? athlete.weightKg ?? saved.weightKg ?? DEFAULT_ANSWERS.weightKg,
      bodyFatPct: latest.bodyFatPct ?? saved.bodyFatPct,
      ...(athlete.trainingDays?.length ? { trainingDays: athlete.trainingDays } : {}),
    },
    app: {
      ...DEFAULT_APP,
      weightUnit: prefs.weightUnit,
      lengthUnit: prefs.lengthUnit,
      volumeUnit: prefs.volumeUnit,
      theme: getStoredTheme(),
      accentColor: athlete.accentColor,
      startTab: prefs.startTab,
      hiddenTabs: prefs.hiddenTabs,
      reminders: { weigh: prefs.reminders.weigh.on, food: prefs.reminders.food.on, water: prefs.reminders.water.on },
    },
    step: 1,
  }
}

/** Bei `?athlete=<id>` wird der bestehende Athlet neu durchlaufen, sonst ein neuer angelegt. */
export default function StartJourney() {
  const [params] = useSearchParams()
  const athleteId = params.get('athlete')
  const initial = useLiveQuery(async () => {
    if (!athleteId) return null
    const athlete = await db.athletes.get(athleteId)
    if (!athlete) return null
    const entries = await db.dailyEntries.where('athleteId').equals(athleteId).sortBy('date')
    return draftFromAthlete(athlete, {
      weightKg: entries.filter((e) => e.weightKg).at(-1)?.weightKg,
      bodyFatPct: entries.filter((e) => e.bodyFatPct).at(-1)?.bodyFatPct,
    })
  }, [athleteId])
  // Einmal laden, danach nicht mehr live nachziehen - sonst überschriebe jede Änderung die Eingaben.
  if (athleteId && initial === undefined) return null
  return <Journey key={athleteId ?? 'neu'} editId={initial ? athleteId! : undefined} initial={initial ?? undefined} />
}

function Journey({ editId, initial }: { editId?: string; initial?: Draft }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => initial ?? loadDraft())
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const [saving, setSaving] = useState(false)
  const { answers: a, app, step } = draft
  const today = todayIso()
  const foods = useLiveQuery(() => db.foodItems.toArray(), [])
  const hasAthletes = useLiveQuery(async () => (await db.athletes.count()) > 0, [])

  useEffect(() => {
    // Der erneute Durchlauf hat keinen Entwurf - er startet immer mit den aktuellen Daten.
    if (editId) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Ohne Speicher geht der Zwischenstand beim Schließen verloren.
    }
  }, [draft, editId])

  // Akzentfarbe live vorschauen; beim Verlassen zurück auf die Farbe der Übersicht.
  useEffect(() => {
    applyAccentColor(app.accentColor)
  }, [app.accentColor])
  useEffect(() => () => applyAccentColor(getStoredOverviewAccent()), [])

  const set = (patch: Partial<StartAnswers>) => setDraft((d) => ({ ...d, answers: { ...d.answers, ...patch } }))
  const setApp = (patch: Partial<StartAppChoices>) => setDraft((d) => ({ ...d, app: { ...d.app, ...patch } }))
  const [building, setBuilding] = useState(false)
  const [intro, setIntro] = useState<(typeof SECTIONS)[number] | null>(null)
  const go = (to: number) => {
    // Vor der Zusammenfassung kurz zeigen, was gerade entsteht.
    if (to === STEPS.length - 1 && step < to) setBuilding(true)
    // Neuer Abschnitt (nur vorwärts): kurzer Zwischenbildschirm.
    else if (to > step && STEPS[to]?.section && STEPS[to].section !== STEPS[step].section) setIntro(STEPS[to].section)
    setDirection(to > step ? 'next' : 'prev')
    setDraft((d) => ({ ...d, step: Math.max(0, Math.min(STEPS.length - 1, to)) }))
    document.getElementById('start-scroll')?.scrollTo({ top: 0 })
  }

  const targets = useMemo(() => computeTargets(a, today), [a, today])
  const weightGoal = a.goal === 'abnehmen' || a.goal === 'aufbauen'
  const suggestion = suggestTargetWeight(a)
  // Während des Tippens (z.B. erst „7“) noch nicht warnen.
  const typedTarget = a.targetWeightKg ?? suggestion
  const warning = weightGoal && typedTarget >= 30 ? targetWarning(a, typedTarget) : undefined
  const week = useMemo(() => buildTrainingWeek(a), [a])
  const units = useMemo(() => planUnits(a), [a])
  const t = tier(a.experience)
  const [customRhythm, setCustomRhythm] = useState(false)
  const recommended = recommendSupplements(a)
  const meals = useMemo(() => (foods ? buildMealPlans(a, targets.result, foods) : []), [a, targets, foods])

  // Pflicht ist nur, was sich nicht sinnvoll raten lässt - der Rest hat Standardwerte.
  const canContinue = step !== 1 || a.firstName.trim().length > 0

  async function finish(answers: StartAnswers = a) {
    setSaving(true)
    const target = answers.goal === 'abnehmen' || answers.goal === 'aufbauen' ? (answers.targetWeightKg ?? suggestTargetWeight(answers)) : undefined
    const final = { ...answers, firstName: answers.firstName.trim() || 'Ich', targetWeightKg: target }
    if (editId) {
      if (!window.confirm('Übernehmen? Trainings-, Ernährungs- und Supplementplan werden durch die neuen ersetzt. Dein Verlauf bleibt erhalten.')) {
        setSaving(false)
        return
      }
      await updateFromStart(editId, final, app)
      navigate(`/athlete/${editId}`, { replace: true })
      return
    }
    const athlete = await createFromStart(final, app)
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
          <DecimalInput value={a.weightKg} onChange={(n) => n && set({ weightKg: n, targetWeightKg: undefined, targetWeightTyped: false })} inputMode="decimal" />
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
                onClick={() => set({ bodyFatPct: active ? undefined : pct, targetWeightKg: undefined, targetWeightTyped: false })}
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
            onChange={(n) => set({ bodyFatPct: n !== undefined && n > 2 && n < 70 ? n : undefined, targetWeightKg: undefined, targetWeightTyped: false })}
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
            { value: 'abnehmen', label: 'Abnehmen', hint: 'Fett verlieren, Muskeln halten', icon: TrendingDown },
            { value: 'aufbauen', label: 'Muskeln aufbauen', hint: 'Mit leichtem Überschuss zunehmen', icon: TrendingUp },
            { value: 'recomp', label: 'Recomp', hint: 'Fett runter, Muskeln rauf – Gewicht bleibt ähnlich', icon: Repeat },
            { value: 'halten', label: 'Halten & fitter werden', hint: 'Gewicht halten, Leistung steigern', icon: HeartPulse },
          ]}
          value={a.goal}
          onChange={(goal) => set({ goal, targetWeightKg: undefined, targetWeightTyped: false })}
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
          {/* Einmal selbst getippt, bleibt das Feld frei - auch leer, damit man die Zahl komplett neu eingeben kann. */}
          <DecimalInput
            value={a.targetWeightTyped ? a.targetWeightKg : (a.targetWeightKg ?? suggestion)}
            onChange={(n) => set({ targetWeightKg: n, targetWeightTyped: true })}
            placeholder={`Vorschlag: ${suggestion.toLocaleString('de-DE')}`}
            inputMode="decimal"
          />
          {a.targetWeightTyped && a.targetWeightKg !== suggestion && (
            <button type="button" onClick={() => set({ targetWeightKg: undefined, targetWeightTyped: false })} className="self-start text-xs text-accent">
              Vorschlag übernehmen ({suggestion.toLocaleString('de-DE')} kg)
            </button>
          )}
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
      <Question label="Wie lange trainierst du schon?" info="Danach richtet sich, wie viele Fragen ich dir zum Training stelle – Einsteiger bekommen nur das Nötigste.">
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
      <Question label="Wie planst du deine Trainingstage?" info="Feste Tage: z.B. immer Mo/Mi/Fr. Rotierend: ein Rhythmus unabhängig vom Wochentag, z.B. jeden zweiten Tag.">
        <Chips
          options={[
            { value: 'fixed', label: 'Feste Wochentage' },
            { value: 'rotation', label: 'Rotierend' },
          ]}
          value={a.scheduleMode}
          onChange={(scheduleMode) => set({ scheduleMode, split: undefined, dayUnits: undefined })}
        />
      </Question>
      {a.scheduleMode === 'fixed' ? (
        <Question label="An welchen Tagen trainierst du?" info="An den anderen Tagen zeigt das Dashboard einen Ruhetag.">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d, i) => {
              const on = a.trainingDays.includes(i)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ trainingDays: on ? a.trainingDays.filter((x) => x !== i) : [...a.trainingDays, i].sort((x, y) => x - y), split: undefined, dayUnits: undefined })}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition active:scale-95 ${on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'}`}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </Question>
      ) : (
        <>
          <Question label="Dein Rhythmus" info="Trainingstage an, Pausentage aus – dann beginnt es von vorn. Verpasst du eine Einheit, rückt sie einfach nach.">
            <Chips
              options={[
                { value: '1/1', label: '1 an / 1 aus' },
                { value: '2/1', label: '2 an / 1 aus' },
                { value: '3/1', label: '3 an / 1 aus' },
                { value: 'eigen', label: 'Eigener' },
              ]}
              value={['1/1', '2/1', '3/1'].includes(`${a.rotation.on}/${a.rotation.off}`) && !customRhythm ? `${a.rotation.on}/${a.rotation.off}` : 'eigen'}
              onChange={(v) => {
                setCustomRhythm(v === 'eigen')
                if (v !== 'eigen') {
                  const [on, off] = v.split('/').map(Number)
                  set({ rotation: { ...a.rotation, on, off }, split: undefined })
                }
              }}
            />
            {(customRhythm || !['1/1', '2/1', '3/1'].includes(`${a.rotation.on}/${a.rotation.off}`)) && (
              <div className="flex flex-wrap gap-3">
                <Stepper label="Tage an" value={a.rotation.on} min={1} max={6} onChange={(on) => set({ rotation: { ...a.rotation, on }, split: undefined })} />
                <Stepper label="Tage aus" value={a.rotation.off} min={1} max={3} onChange={(off) => set({ rotation: { ...a.rotation, off }, split: undefined })} />
              </div>
            )}
            <p className="text-xs text-muted">≈ {fmtNum(sessionsPerWeek(a))} Einheiten pro Woche</p>
          </Question>
          <Question label="Ab wann?">
            <Input type="date" value={a.rotation.start} onChange={(e) => e.target.value && set({ rotation: { ...a.rotation, start: e.target.value } })} />
          </Question>
        </>
      )}
      <Question label="Wo trainierst du?">
        <Options
          options={(['studio', 'basic', 'zuhause'] as const).map((l) => ({ value: l, label: LOCATION_LABELS[l].label, hint: LOCATION_LABELS[l].hint, icon: { studio: Warehouse, basic: Dumbbell, zuhause: Home }[l] }))}
          value={a.location === 'beides' ? 'studio' : a.location}
          onChange={(location) => set({ location })}
        />
      </Question>
    </Block>,
    <Block key="7">
      <Question label="Zeit pro Training" info="Ich rechne mit etwa 45 s pro Satz plus Pause (Grundübungen länger, Isolation kürzer), Aufwärmsätzen und Cardio – und plane so viele Sätze, wie hineinpassen.">
        <Chips options={([30, 45, 60, 75, 90] as const).map((m) => ({ value: m, label: `${m} min` }))} value={a.durationMin} onChange={(durationMin) => set({ durationMin })} />
      </Question>
      {t >= 2 && (
        <Question label="Trainingsziel" info="Bestimmt Wiederholungen und Pausen: Kraft 4–6 Wdh., Muskelaufbau 6–10 (Grundübungen) bzw. 10–15, Fitness mehr Wiederholungen.">
          <Chips
            options={[
              { value: 'kraft', label: 'Kraft' },
              { value: 'aufbau', label: 'Muskelaufbau' },
              { value: 'fitness', label: 'Fitness' },
            ]}
            value={a.trainingGoal ?? 'aufbau'}
            onChange={(trainingGoal) => set({ trainingGoal })}
          />
        </Question>
      )}
      {t >= 2 && (
        <Question label="Übungsvorliebe">
          <Chips
            options={[
              { value: 'frei', label: 'Freie Gewichte' },
              { value: 'gemischt', label: 'Gemischt' },
              { value: 'maschinen', label: 'Maschinen' },
            ]}
            value={a.preference ?? 'gemischt'}
            onChange={(preference) => set({ preference })}
          />
        </Question>
      )}
      <Question label="Beschwerden? (optional)" info="Übungen, die diese Stellen belasten, ersetze ich durch schonendere.">
        <MultiChips options={RESTRICTIONS.map((r) => ({ value: r.id, label: r.label }))} value={a.restrictions} onChange={(restrictions) => set({ restrictions })} />
      </Question>
      {t >= 3 && (
        <>
          <Question label="Welche Grundübungen beherrschst du sicher?" info="Nicht gewählte ersetze ich durch sicherere Varianten (z.B. Beinpresse statt Kniebeuge).">
            <MultiChips
              options={(Object.keys(LIFT_LABELS) as Lift[]).map((l) => ({ value: l, label: LIFT_LABELS[l] }))}
              value={a.mastered ?? (Object.keys(LIFT_LABELS) as Lift[])}
              onChange={(mastered) => set({ mastered })}
            />
          </Question>
          <Question label="Maximal Sätze pro Training" info="Nur Arbeitssätze – Aufwärmen und Cardio zählen nicht.">
            <Stepper label="Sätze" value={a.maxSets ?? 20} min={12} max={25} onChange={(maxSets) => set({ maxSets })} />
          </Question>
          <Question label="Dauer eines Satzes">
            <Chips options={[30, 45, 60].map((v) => ({ value: v, label: `${v} s` }))} value={a.setSeconds ?? 45} onChange={(setSeconds) => set({ setSeconds })} />
          </Question>
          <Question label="Pause – Grundübungen">
            <Chips options={[90, 120, 150, 180, 240].map((v) => ({ value: v, label: fmtRest(v) }))} value={a.restCompound ?? (a.trainingGoal === 'kraft' ? 180 : 150)} onChange={(restCompound) => set({ restCompound })} />
          </Question>
          <Question label="Pause – Isolationsübungen">
            <Chips options={[45, 60, 75, 90, 120].map((v) => ({ value: v, label: fmtRest(v) }))} value={a.restIsolation ?? (a.trainingGoal === 'kraft' ? 90 : 75)} onChange={(restIsolation) => set({ restIsolation })} />
          </Question>
        </>
      )}
    </Block>,
    <Block key="8">
      <Question label="Plan-Aufbau" info="Vorschlag passend zu deinen Tagen bzw. deinem Rhythmus und deiner Erfahrung – du kannst ihn ändern.">
        <Options
          options={splitOptions(a).map((sp) => ({
            value: sp,
            label: SPLIT_LABELS[sp],
            hint: sp === suggestedSplitFor(a) ? 'Empfohlen für dich' : undefined,
          }))}
          value={effectiveSplit(a)}
          onChange={(split) => set({ split, dayUnits: undefined })}
        />
      </Question>
      {t >= 3 && (
        <Question label="Gleiche Einheit mehrmals pro Woche" info="A/B-Varianten: die zweite Einheit bekommt andere Übungen für dieselben Muskeln. Gleiche Übungen machen Fortschritte leichter messbar.">
          <Chips
            options={[
              { value: 'gleich', label: 'Gleiche Übungen' },
              { value: 'ab', label: 'A/B-Varianten' },
            ]}
            value={a.variants ?? 'gleich'}
            onChange={(variants) => set({ variants, dayUnits: undefined })}
          />
        </Question>
      )}
      <Question label="Cardio einplanen?" info="Kommt ans Ende der Einheit und wird von der Trainingszeit abgezogen.">
        <Chips options={[{ value: 'ja', label: 'Ja' }, { value: 'nein', label: 'Nein' }]} value={a.cardio ? 'ja' : 'nein'} onChange={(v) => set({ cardio: v === 'ja' })} />
        {a.cardio && (
          <Chips options={[30, 60, 90, 120, 150].map((m) => ({ value: m, label: `${m} min/Wo.` }))} value={a.cardioMinutes} onChange={(cardioMinutes) => set({ cardioMinutes })} />
        )}
      </Question>
    </Block>,
    <Block key="8b">
      <p className="text-sm text-muted">Bis zu zwei Muskeln je Trainingstag – sie kommen an den Anfang der Einheit und bekommen mehr Sätze.</p>
      {units.map((u) => (
        <Question key={u.key} label={`${u.key} · ${(a.focusByUnit[u.key] ?? []).length}/2`}>
          <MultiChips
            options={VOLUME_MUSCLES.map((m) => ({ value: m, label: m }))}
            value={a.focusByUnit[u.key] ?? []}
            max={2}
            onChange={(list) => set({ focusByUnit: { ...a.focusByUnit, [u.key]: list } })}
          />
          {(a.focusByUnit[u.key] ?? []).length >= 2 && <p className="text-xs text-muted">Zwei gewählt – zum Wechseln erst einen abwählen.</p>}
        </Question>
      ))}
      {t >= 2 && (
        <Question label="Lieblingsübungen & Ausschlüsse (optional)" info="Einmal tippen: ★ Favorit – wird bevorzugt. Nochmal: ✕ ausgeschlossen – ich nehme eine Alternative. Nochmal: neutral.">
          <div className="flex flex-col gap-1.5">
            {catalogByMuscle().map((g) => (
              <details key={g.muscle} className="rounded-xl bg-surface-2 px-3 py-2">
                <summary className="cursor-pointer text-sm text-fg">
                  {g.muscle}
                  {countMarks(g.names, a) && <span className="ml-1.5 text-xs text-muted">{countMarks(g.names, a)}</span>}
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.names.map((n) => {
                    const fav = a.favorites?.includes(n)
                    const ex = a.excluded?.includes(n)
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => set(cycleMark(n, a))}
                        className={`rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${fav ? 'bg-accent font-medium text-accent-fg' : ex ? 'bg-surface text-muted line-through' : 'bg-surface text-fg'}`}
                      >
                        {fav ? '★ ' : ex ? '✕ ' : ''}
                        {n}
                      </button>
                    )
                  })}
                </div>
              </details>
            ))}
          </div>
        </Question>
      )}
      {t >= 3 && (
        <Question label="Volumen je Muskel" info="Sätze pro Woche nach MV (Erhalt), MEV (Minimum für Wachstum) und MAV (optimaler Bereich). Auto richtet sich nach deinem Ziel.">
          <div className="flex flex-col gap-1.5">
            {VOLUME_MUSCLES.map((m) => (
              <div key={m} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{m}</span>
                <div className="flex gap-1">
                  {(['auto', 'MV', 'MEV', 'MAV', 'MRV'] as const).map((z) => {
                    const on = (a.volumeZones?.[m] ?? 'auto') === z
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => {
                          const next = { ...a.volumeZones }
                          if (z === 'auto') delete next[m]
                          else next[m] = z
                          set({ volumeZones: next })
                        }}
                        className={`rounded-lg px-2 py-1 text-xs transition active:scale-95 ${on ? 'bg-accent font-medium text-accent-fg' : 'bg-surface-2 text-muted'}`}
                      >
                        {z === 'auto' ? 'Auto' : z}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Question>
      )}
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
        <SupplementList a={a} chosen={supplementNamesFor(a)} recommended={recommended.map((r) => r.name)} onAdd={(name) => set({ supplements: [...supplementNamesFor(a), name], supplementsTouched: true })} />
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
      week={week}
      unitNames={units.map((u) => u.key)}
      set={set}
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
            {!editId && step < STEPS.length - 1 && (
              <button type="button" onClick={() => void skip()} disabled={saving} className="text-sm text-muted">
                Überspringen
              </button>
            )}
          </div>
        </div>
        {sectionIndex >= 0 && current.section && (
          <div className="mt-2.5 flex flex-col gap-2">
            <div className="flex gap-1">
              {SECTIONS.map((s, i) => (
                <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full bg-accent transition-[width] duration-500 ${i <= sectionIndex ? 'w-full' : 'w-0'}`} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              <span className="flex items-center gap-1.5">
                <SectionIcon section={current.section} />
                {current.section}
              </span>
              <span className="tabular-nums normal-case tracking-normal">
                Schritt {step} von {STEPS.length - 1}
              </span>
            </div>
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
          {step > 0 && step < STEPS.length - 1 && (
            <div className="anim-title mb-5 flex flex-col gap-1">
              <h1 className="text-[1.7rem] leading-tight font-bold tracking-tight text-fg">{current.title}</h1>
              {current.guide && <Guide key={step} text={current.guide(a.firstName.trim())} />}
            </div>
          )}
          {body[step]}
        </div>
      </main>

      {building && <BuildingPlan onDone={() => setBuilding(false)} />}
      {intro && <SectionIntro section={intro} onDone={() => setIntro(null)} />}

      <footer className="relative flex shrink-0 gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Weicher Übergang statt harter Linie: der Inhalt verschwindet sanft hinter den Knöpfen. */}
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-bg to-transparent" />
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} aria-label="Zurück" className="flex items-center gap-1 rounded-xl bg-surface-2 px-4 py-3.5 text-sm font-medium text-fg transition active:scale-95">
            <ChevronLeft size={18} /> Zurück
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => go(step + 1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-fg shadow-lg shadow-accent/15 transition active:scale-95 disabled:opacity-40"
          >
            {step === 0
              ? 'Los geht’s'
              : STEPS[step + 1].section !== current.section && STEPS[step + 1].section !== 'Fertig'
                ? `Weiter: ${STEPS[step + 1].section}`
                : STEPS[step + 1].section === 'Fertig'
                  ? 'Plan erstellen'
                  : 'Weiter'}{' '}
            <ChevronRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void finish()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-fg shadow-lg shadow-accent/15 transition active:scale-95 disabled:opacity-50"
          >
            {saving ? (editId ? 'Wird übernommen …' : 'Wird angelegt …') : editId ? 'Pläne übernehmen' : 'Los geht’s – App starten'}
          </button>
        )}
      </footer>
    </div>
  )
}

const DIET_LABELS: Record<StartAnswers['diet'], string> = { alles: 'Mischkost', vegetarisch: 'vegetarisch', vegan: 'vegan', pescetarisch: 'pescetarisch' }

const TAB_NAMES: Record<TabKey, string> = { dashboard: 'Dashboard', tracking: 'Tracking', ernaehrung: 'Ernährung', training: 'Training' }

/* ------------------------------------------------------------------------------------------ */

/** Sprechblase des Coaches, der durch „Dein Start“ führt. */
function Guide({ text }: { text: string }) {
  return (
    <div className="anim-guide mt-2 flex items-start gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg shadow-md shadow-accent/20">
        <Sparkles size={15} />
      </span>
      <p className="relative rounded-2xl rounded-tl-md border border-border bg-surface px-3 py-2 text-sm leading-snug text-fg">{text}</p>
    </div>
  )
}

/** Zwischenbildschirm beim Betreten eines Abschnitts - antippen überspringt ihn. */
function SectionIntro({ section, onDone }: { section: (typeof SECTIONS)[number]; onDone: () => void }) {
  const finish = useRef(onDone)
  useEffect(() => {
    finish.current = onDone
  }, [onDone])
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const end = window.setTimeout(() => finish.current(), reduced ? 700 : 1700)
    return () => window.clearTimeout(end)
  }, [])
  const Icon = SECTION_ICONS[section]
  const index = SECTIONS.indexOf(section)
  const count = SECTIONS.length - 1
  return (
    <button
      type="button"
      onClick={() => finish.current()}
      aria-label={`Abschnitt ${section} – weiter`}
      className="anim-intro fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-hidden bg-bg px-8 text-center"
    >
      <span aria-hidden="true" className="anim-intro-glow pointer-events-none absolute top-1/2 left-1/2 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      <span className="relative grid h-24 w-24 place-items-center">
        <span aria-hidden="true" className="anim-intro-ring absolute inset-0 rounded-[1.75rem] border-2 border-accent" />
        <span aria-hidden="true" className="anim-intro-ring absolute inset-0 rounded-[1.75rem] border-2 border-accent [animation-delay:350ms]" />
        <span className="anim-intro-icon relative grid h-24 w-24 place-items-center rounded-[1.75rem] bg-accent text-accent-fg shadow-2xl shadow-accent/30">
          <Icon size={42} />
        </span>
      </span>
      <span className="anim-intro-text relative flex flex-col gap-1.5 [animation-delay:150ms]">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Abschnitt {index + 1} von {count}
        </span>
        <span className="text-3xl font-bold tracking-tight text-fg">{section}</span>
      </span>
      <span className="anim-intro-text relative max-w-64 text-sm text-muted [animation-delay:280ms]">{SECTION_INTROS[section]}</span>
      <span className="anim-intro-text relative mt-2 flex gap-1.5 [animation-delay:400ms]">
        {SECTIONS.slice(0, count).map((x, i) => (
          <span key={x} className={`h-1.5 rounded-full transition-all ${i < index ? 'w-4 bg-accent/60' : i === index ? 'anim-intro-dot w-8 bg-accent' : 'w-4 bg-fg/15'}`} />
        ))}
      </span>
    </button>
  )
}

const BUILD_STEPS = ['Kalorien & Makros berechnen', 'Trainingsplan zusammenstellen', 'Ernährungsplan erstellen', 'Supplements abstimmen']

/** Kurze Lade-Animation, während der Plan entsteht - die Punkte haken sich nacheinander ab. */
function BuildingPlan({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(0)
  const [tick] = useState(() => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 300 : 1100))
  // Der Aufrufer übergibt jedes Mal eine neue Funktion - die Animation soll trotzdem nur einmal laufen.
  const finish = useRef(onDone)
  useEffect(() => {
    finish.current = onDone
  }, [onDone])
  useEffect(() => {
    const timer = window.setInterval(() => setDone((n) => n + 1), tick)
    const end = window.setTimeout(() => finish.current(), tick * (BUILD_STEPS.length + 1.5))
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(end)
    }
  }, [tick])
  return (
    <div role="status" aria-live="polite" className="anim-backdrop fixed inset-0 z-50 grid place-items-center bg-bg/95 px-8 backdrop-blur-sm">
      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <span className="relative grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-surface-2 border-t-accent" />
          <Sparkles size={28} className="text-accent" />
        </span>
        <p className="text-lg font-semibold text-fg">Dein Plan wird erstellt …</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="anim-build-bar h-full rounded-full bg-accent" style={{ animationDuration: `${((BUILD_STEPS.length + 1.5) * tick) / 1000}s` }} />
        </div>
        <ul className="flex w-full flex-col gap-2.5">
          {BUILD_STEPS.map((label, i) => {
            const ok = done > i
            return (
              <li key={label} className={`flex items-center gap-2.5 text-sm transition-opacity duration-300 ${done >= i ? 'opacity-100' : 'opacity-30'}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${ok ? 'border-accent bg-accent text-accent-fg' : 'border-border'}`}>
                  {ok && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={ok ? 'text-fg' : 'text-muted'}>{label}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Flame, title: 'Kalorien & Makros', text: 'Dein Tagesziel, passend zu Körper und Ziel' },
  { icon: Dumbbell, title: 'Trainingsplan', text: 'Für deine Tage, deine Zeit und dein Studio' },
  { icon: Apple, title: 'Ernährungsplan', text: 'Mahlzeiten, die zu deinen Zielen passen' },
  { icon: LineChart, title: 'Fortschritt', text: 'Gewicht, Maße und Wochenrückblick' },
]

function Welcome() {
  return (
    <div className="relative flex flex-col items-center gap-5 pt-4 text-center">
      {/* Weiches Leuchten hinter dem Logo */}
      <div aria-hidden="true" className="pointer-events-none absolute top-14 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
      <span className="anim-pop relative grid h-20 w-20 place-items-center rounded-[1.6rem] bg-accent text-accent-fg shadow-xl shadow-accent/25">
        <Sparkles size={36} />
      </span>
      <div className="anim-title relative flex flex-col gap-2">
        <h1 className="text-[2rem] leading-tight font-bold tracking-tight text-fg">Willkommen!</h1>
        <p className="text-base text-muted">In etwa 3 Minuten zu deinem persönlichen Plan – abgestimmt auf dich, dein Ziel und deinen Alltag.</p>
      </div>
      <div className="anim-list relative grid w-full grid-cols-2 gap-2 text-left">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
              <Icon size={18} />
            </span>
            <span className="text-sm font-semibold text-fg">{title}</span>
            <span className="text-xs leading-snug text-muted">{text}</span>
          </div>
        ))}
      </div>
      <div className="relative flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface p-3 text-left">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">So läuft’s</span>
        <div className="flex items-start justify-between gap-1">
          {SECTIONS.filter((x) => x !== 'Fertig').map((sec, i) => {
            const Icon = SECTION_ICONS[sec]
            return (
              <div key={sec} className="flex flex-1 flex-col items-center gap-1 text-center">
                <span className="relative grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-fg">
                  <Icon size={16} />
                  <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-fg">{i + 1}</span>
                </span>
                <span className="text-[10px] leading-tight text-muted">{sec}</span>
              </div>
            )
          })}
        </div>
      </div>
      <ul className="relative flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {[
          { icon: Clock, text: 'ca. 3 Minuten' },
          { icon: Pencil, text: 'Alles später änderbar' },
          { icon: Lock, text: 'Daten bleiben auf deinem Gerät' },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-1.5">
            <Icon size={13} /> {text}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Infos zu den Supplements - bleiben stehen, egal was an- oder abgewählt wird: Gewähltes mit
 * Wirkung, Grund, Dosis und Zeitpunkt; Empfohlenes, das abgewählt wurde, gedimmt zum Zurückholen.
 */
function SupplementList({ a, chosen, recommended, onAdd }: { a: StartAnswers; chosen: string[]; recommended: string[]; onAdd: (name: string) => void }) {
  const skipped = recommended.filter((n) => !chosen.includes(n))
  if (chosen.length === 0 && skipped.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {chosen.map((name) => {
        const info = supplementInfo(name, a)
        return (
          <li key={name} className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-fg">{name}</span>
              {info.reason && <span className="rounded-full bg-accent/15 px-1.5 py-px text-[10px] font-medium text-accent">Empfohlen</span>}
            </span>
            {info.reason && <span className="text-fg">{info.reason}</span>}
            {info.about && <span>{info.about}</span>}
            {(info.dose || info.timing) && (
              <span>
                {[info.dose, info.timing].filter(Boolean).join(' · ')}
                {info.notes ? ` · ${info.notes}` : ''}
              </span>
            )}
            {info.extra && <span className="text-accent">{info.extra}</span>}
          </li>
        )
      })}
      {skipped.map((name) => {
        const info = supplementInfo(name, a)
        return (
          <li key={name} className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-fg">{name}</span> · empfohlen, nicht ausgewählt
              {info.reason && <span className="block">{info.reason}</span>}
            </span>
            <button type="button" onClick={() => onAdd(name)} className="shrink-0 rounded-lg bg-surface-2 px-2 py-1 font-medium text-accent">
              Hinzufügen
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Block({ children }: { children: ReactNode }) {
  return <div className="anim-list flex flex-col gap-3">{children}</div>
}

function Question({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
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

function Options<T extends string>({ options, value, onChange }: { options: { value: T; label: string; hint?: string; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => {
        const on = value === o.value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[0.98] ${on ? 'border-accent bg-accent/15' : 'border-border bg-surface-2'}`}
          >
            {Icon && (
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${on ? 'bg-accent text-accent-fg' : 'bg-surface text-muted'}`}>
                <Icon size={18} />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-fg">{o.label}</span>
              {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
            </span>
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${on ? 'border-accent bg-accent text-accent-fg' : 'border-border'}`}>
              {on && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SectionIcon({ section }: { section: (typeof SECTIONS)[number] }) {
  const Icon = SECTION_ICONS[section]
  return (
    <span className="grid h-5 w-5 place-items-center rounded-md bg-accent/15 text-accent">
      <Icon size={12} />
    </span>
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
  week,
  unitNames,
  set,
  meals,
  onEdit,
}: {
  a: StartAnswers
  targets: ReturnType<typeof computeTargets>
  weightGoal: boolean
  week: TrainingWeek
  unitNames: string[]
  set: (patch: Partial<StartAnswers>) => void
  meals: ReturnType<typeof buildMealPlans>
  onEdit: (step: number) => void
}) {
  const r = targets.result
  const fmt = (n: number) => n.toLocaleString('de-DE')
  return (
    <div className="anim-list flex flex-col gap-3">
      <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl border border-border bg-surface px-4 pt-6 pb-5 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />
        <span className="anim-pop relative grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-accent/25">
          <Check size={28} strokeWidth={2.5} />
        </span>
        <h1 className="relative text-2xl font-bold tracking-tight text-fg">Dein Plan steht{a.firstName.trim() ? `, ${a.firstName.trim()}` : ''}!</h1>
        <p className="relative text-sm text-muted">Prüf alles kurz – mit „Anpassen“ springst du zur passenden Frage zurück.</p>
      </div>
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
        <p className="text-xs text-muted">
          Wasser: {(targets.waterMl / 1000).toLocaleString('de-DE')} l pro Tag · 1 l je 20 kg{supplementNamesFor(a).some(isCreatine) ? ' + 1 l wegen Kreatin' : ''}
        </p>
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
      <SummaryCard
        title={`Trainingsplan · ${a.scheduleMode === 'rotation' ? `${a.rotation.on} an / ${a.rotation.off} aus` : `${a.trainingDays.length}× pro Woche`}`}
        onEdit={() => onEdit(6)}
      >
        <TrainingSummary a={a} week={week} unitNames={unitNames} set={set} />
      </SummaryCard>
      <SummaryCard title="Ernährungsplan" onEdit={() => onEdit(10)}>
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
        <SummaryCard title="Supplementplan" onEdit={() => onEdit(10)}>
          <p className="text-sm text-fg">{supplementNamesFor(a).join(', ')}</p>
          <p className="text-xs text-muted">Mit üblicher Dosis und Einnahmezeit – im Supplementplan änderbar.</p>
        </SummaryCard>
      )}
      <NextSteps />
    </div>
  )
}

/** Einstieg in die App: die ersten drei Dinge nach dem Anlegen, dazu die Tipps je Bereich. */
function NextSteps() {
  const prefs = usePrefs()
  const steps: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: Scale, title: 'Morgens wiegen', text: 'Unter Tracking – der Wochenschnitt zeigt deinen echten Trend.' },
    { icon: Utensils, title: 'Essen eintragen', text: 'Unter Ernährung – oder einfach deinem Ernährungsplan folgen.' },
    { icon: Dumbbell, title: 'Erstes Training starten', text: 'Unter Training – Sätze abhaken, Gewichte merkt sich die App.' },
  ]
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">So geht’s weiter</h2>
      <ol className="flex flex-col gap-2.5">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex items-start gap-3">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <Icon size={17} />
              <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-fg">{i + 1}</span>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-fg">{title}</span>
              <span className="text-xs text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="overflow-hidden rounded-xl bg-surface-2">
        <Toggle
          label="Tipps in der App zeigen"
          hint="Kurze Hinweise beim ersten Öffnen jedes Bereichs"
          on={prefs.tour}
          onChange={(on) => setPrefs(on ? { tour: true, toursSeen: [] } : { tour: false })}
        />
      </div>
    </section>
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

const fmtNum = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const fmtRest = (sec: number) => (sec < 60 || sec % 30 ? `${sec} s` : `${fmtNum(sec / 60)} min`)

/** Kurzinfo je Muskelgruppe: wie viele Favoriten/Ausschlüsse gesetzt sind. */
function countMarks(names: string[], a: StartAnswers): string {
  const fav = names.filter((n) => a.favorites?.includes(n)).length
  const ex = names.filter((n) => a.excluded?.includes(n)).length
  return [fav ? `★ ${fav}` : '', ex ? `✕ ${ex}` : ''].filter(Boolean).join(' · ')
}

/** Neutral → Favorit → ausgeschlossen → neutral. */
function cycleMark(name: string, a: StartAnswers): Partial<StartAnswers> {
  const favorites = a.favorites ?? []
  const excluded = a.excluded ?? []
  if (favorites.includes(name)) return { favorites: favorites.filter((n) => n !== name), excluded: [...excluded, name] }
  if (excluded.includes(name)) return { excluded: excluded.filter((n) => n !== name) }
  return { favorites: [...favorites, name] }
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center rounded-xl bg-surface-2">
        <button type="button" aria-label={`${label} weniger`} disabled={value <= min} onClick={() => onChange(value - 1)} className="px-3 py-2 text-fg disabled:opacity-30">
          −
        </button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums text-fg">{value}</span>
        <button type="button" aria-label={`${label} mehr`} disabled={value >= max} onClick={() => onChange(value + 1)} className="px-3 py-2 text-fg disabled:opacity-30">
          +
        </button>
      </div>
    </div>
  )
}

/**
 * Trainingsplan in der Zusammenfassung: Einheiten mit Dauer und Sätzen, Übungen tauschen
 * und ± Sätze, Einheit je Wochentag, Hinweise und das Wochenvolumen je Muskel.
 */
function TrainingSummary({ a, week, unitNames, set }: { a: StartAnswers; week: TrainingWeek; unitNames: string[]; set: (patch: Partial<StartAnswers>) => void }) {
  const setSets = (key: string, sets: number) => set({ setOverrides: { ...a.setOverrides, [key]: Math.max(1, Math.min(4, sets)) } })
  const daysOf = (unit: number) => week.schedule.filter((x) => x.unit === unit).map((x) => WEEKDAYS[x.weekday])
  return (
    <div className="flex flex-col gap-3">
      {a.scheduleMode === 'fixed' && week.schedule.length > 0 && unitNames.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Einheit je Tag</span>
          <div className="flex flex-wrap gap-1.5">
            {week.schedule.map((x, i) => (
              <label key={x.weekday} className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-fg">
                <span className="font-semibold">{WEEKDAYS[x.weekday]}</span>
                <select
                  value={x.unit}
                  onChange={(e) => {
                    const next = week.schedule.map((y) => y.unit)
                    next[i] = Number(e.target.value)
                    set({ dayUnits: next })
                  }}
                  className="bg-transparent text-xs text-fg outline-none"
                  aria-label={`Einheit am ${WEEKDAYS[x.weekday]}`}
                >
                  {unitNames.map((n, u) => (
                    <option key={n} value={u}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
      {week.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          {week.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle size={13} className="mt-px shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
      {week.days.map((d, u) => (
        <div key={d.name} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-fg">{d.name}</p>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              ≈ {d.minutes} min · {d.workSets}/{d.maxSets} Sätze
            </span>
          </div>
          {a.scheduleMode === 'fixed' && daysOf(u).length > 0 && <p className="-mt-1 text-[11px] text-muted">{daysOf(u).join(', ')}</p>}
          {d.exercises.map((e) => (
            <div key={e.key} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                {e.alternatives.length > 1 ? (
                  <select
                    value={e.name}
                    onChange={(ev) => set({ exerciseSwaps: { ...a.exerciseSwaps, [e.key]: ev.target.value } })}
                    className="w-full truncate bg-transparent text-sm text-fg outline-none"
                    aria-label={`${e.name} tauschen`}
                  >
                    {e.alternatives.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="truncate text-sm text-fg">{e.name}</p>
                )}
                <p className="truncate text-[11px] text-muted">
                  {e.cardio ? e.reps : `${e.reps} Wdh. · Pause ${fmtRest(e.restSeconds)}${e.warmupSets ? ` · ${e.warmupSets} Aufwärmsätze` : ''}`}
                  {e.note ? ` · ${e.note}` : ''}
                </p>
              </div>
              {e.focus && <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-px text-[10px] font-medium text-accent">Fokus</span>}
              {!e.cardio && (
                <div className="flex shrink-0 items-center rounded-lg bg-surface">
                  <button type="button" aria-label="Satz weniger" disabled={e.sets <= 1} onClick={() => setSets(e.key, e.sets - 1)} className="px-2 py-1 text-fg disabled:opacity-30">
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-semibold tabular-nums text-fg">{e.sets}</span>
                  <button type="button" aria-label="Satz mehr" disabled={e.sets >= 4} onClick={() => setSets(e.key, e.sets + 1)} className="px-2 py-1 text-fg disabled:opacity-30">
                    +
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      {(Object.keys(a.setOverrides ?? {}).length > 0 || Object.keys(a.exerciseSwaps ?? {}).length > 0) && (
        <button type="button" onClick={() => set({ setOverrides: {}, exerciseSwaps: {} })} className="self-start text-xs text-accent">
          Eigene Änderungen zurücksetzen
        </button>
      )}
      <details className="rounded-lg bg-surface-2 px-2.5 py-1.5">
        <summary className="cursor-pointer text-sm text-fg">Wochenvolumen je Muskel</summary>
        <div className="mt-2">
          <VolumeBars rows={week.volume.map((v) => ({ muscle: v.muscle, value: v.planned, target: v.target }))} />
        </div>
      </details>
    </div>
  )
}

