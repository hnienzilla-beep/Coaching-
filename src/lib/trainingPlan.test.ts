import { describe, expect, it } from 'vitest'
import { DEFAULT_ANSWERS, type StartAnswers } from './startPlan'
import { LANDMARKS, buildTrainingWeek, maxSetsPerSession, planUnits, recoveryHours, sessionsPerWeek, splitOptions, weeklyTarget, type VolumeMuscle } from './trainingPlan'

const a = (patch: Partial<StartAnswers> = {}): StartAnswers => ({ ...DEFAULT_ANSWERS, firstName: 'Test', ...patch })
const pro = (patch: Partial<StartAnswers> = {}) => a({ experience: 'erfahren', goal: 'aufbauen', ...patch })

describe('Wochenvolumen nach Tabelle', () => {
  it('Ziel bestimmt die Zone', () => {
    expect(weeklyTarget('Brust', a({ goal: 'abnehmen', experience: 'fortgeschritten' }))).toBe(LANDMARKS.Brust.mev)
    expect(weeklyTarget('Brust', a({ goal: 'aufbauen', experience: 'fortgeschritten' }))).toBe(12)
    expect(weeklyTarget('Brust', a({ goal: 'recomp', experience: 'fortgeschritten' }))).toBe(11)
  })
  it('Einsteiger bleiben unten', () => {
    expect(weeklyTarget('Brust', a({ goal: 'aufbauen', experience: 'einsteiger' }))).toBe(12)
  })
  it('Profi-Zone je Muskel', () => {
    expect(weeklyTarget('Bizeps', pro({ volumeZones: { Bizeps: 'MV' } }))).toBe(5)
  })
})

describe('Plan-Grenzen', () => {
  it('höchstens 20 Arbeitssätze und 4 Sätze je Übung, Zeit passt', () => {
    for (const durationMin of [30, 45, 60, 75, 90] as const) {
      const week = buildTrainingWeek(pro({ durationMin, trainingDays: [0, 2, 4] }))
      for (const d of week.days) {
        expect(d.workSets).toBeLessThanOrEqual(20)
        expect(d.minutes).toBeLessThanOrEqual(durationMin)
        for (const e of d.exercises) expect(e.sets).toBeLessThanOrEqual(4)
      }
    }
  })
  it('Profi-Satzgrenze', () => {
    const week = buildTrainingWeek(pro({ maxSets: 12, durationMin: 90 }))
    for (const d of week.days) expect(d.workSets).toBeLessThanOrEqual(12)
  })
  it('Pausen je Übungsart, Aufwärmsätze bei der ersten Grundübung', () => {
    const day = buildTrainingWeek(pro()).days[0]
    const first = day.exercises.find((e) => e.warmupSets > 0)
    expect(first).toBeDefined()
    expect(day.exercises.filter((e) => e.warmupSets > 0)).toHaveLength(1)
    expect(new Set(day.exercises.map((e) => e.restSeconds)).size).toBeGreaterThan(1)
  })
  it('Wiederholungen nach Übung und Ziel', () => {
    const kraft = buildTrainingWeek(pro({ trainingGoal: 'kraft' })).days[0].exercises[0]
    expect(kraft.reps).toBe('4-6')
  })
})

describe('Schwerpunkte je Tag', () => {
  it('kommen nach vorn und bekommen mehr Sätze', () => {
    const plain = buildTrainingWeek(pro({ split: 'pushpullfb', trainingDays: [0, 2, 4, 5] }))
    const week = buildTrainingWeek(pro({ split: 'pushpullfb', trainingDays: [0, 2, 4, 5], focusByUnit: { 'Push Fullbody': ['Seitl. Schulter'] } }))
    const push = week.days.find((d) => d.name === 'Push Fullbody')!
    expect(push.exercises[0].muscle).toBe('Seitl. Schulter')
    expect(push.exercises[0].focus).toBe(true)
    const before = plain.volume.find((v) => v.muscle === 'Seitl. Schulter')!.planned
    const after = week.volume.find((v) => v.muscle === 'Seitl. Schulter')!.planned
    expect(after).toBeGreaterThan(before)
  })
  it('fehlender Muskel bekommt eine Übung', () => {
    const week = buildTrainingWeek(pro({ split: 'pushpullfb', focusByUnit: { 'Pull Fullbody': ['Trapez'] } }))
    const pull = week.days.find((d) => d.name === 'Pull Fullbody')!
    expect(pull.exercises[0].muscle).toBe('Trapez')
    expect(pull.exercises[0].focus).toBe(true)
  })
})

describe('Rhythmus', () => {
  it('Rotation: Einheiten pro Woche und Split-Vorschläge', () => {
    const r = a({ scheduleMode: 'rotation', rotation: { on: 1, off: 1, start: '2026-01-01' } })
    expect(sessionsPerWeek(r)).toBe(3.5)
    expect(splitOptions(r)[0]).toBe('ganzkoerper')
    expect(splitOptions(a({ scheduleMode: 'rotation', rotation: { on: 3, off: 1, start: '2026-01-01' } }))[0]).toBe('ppl')
  })
  it('A/B-Varianten bei doppelter Häufigkeit', () => {
    const units = planUnits(pro({ variants: 'ab', split: 'pushpullfb', trainingDays: [0, 1, 3, 4] }))
    expect(units.map((u) => u.key)).toEqual(['Push Fullbody · A', 'Pull Fullbody · A', 'Push Fullbody · B', 'Pull Fullbody · B'])
    const week = buildTrainingWeek(pro({ variants: 'ab', split: 'pushpullfb', trainingDays: [0, 1, 3, 4] }))
    expect(week.days[0].exercises[0].name).not.toBe(week.days[2].exercises[0].name)
  })
  it('Regeneration nach Volumen', () => {
    expect(recoveryHours('Brust', 6)).toBe(48)
    expect(recoveryHours('Brust', 8)).toBe(72)
    expect(recoveryHours('Quadrizeps', 8)).toBe(96)
  })
  it('warnt bei gleichen Muskeln an aufeinanderfolgenden Tagen', () => {
    const week = buildTrainingWeek(pro({ split: 'ganzkoerper', trainingDays: [0, 1, 2] }))
    expect(week.warnings.length).toBeGreaterThan(0)
  })
  it('Einheit je Wochentag änderbar', () => {
    const week = buildTrainingWeek(pro({ split: 'pushpullfb', trainingDays: [0, 2, 4, 5], dayUnits: [0, 0, 1, 1] }))
    expect(week.schedule.map((x) => x.unit)).toEqual([0, 0, 1, 1])
  })
})

describe('Übungsauswahl', () => {
  it('Einsteiger bekommen einfache Varianten, Ausschlüsse und Favoriten wirken', () => {
    const beginner = buildTrainingWeek(a({ experience: 'einsteiger', goal: 'aufbauen' })).days.flatMap((d) => d.exercises.map((e) => e.name))
    expect(beginner).not.toContain('Kniebeuge')
    expect(beginner).not.toContain('Bankdrücken')
    const adv = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', excluded: ['Kniebeuge'], favorites: ['Bankdrücken (Kurzhantel)'] }))
    const names = adv.days.flatMap((d) => d.exercises.map((e) => e.name))
    expect(names).not.toContain('Kniebeuge')
    expect(names).toContain('Bankdrücken (Kurzhantel)')
  })
  it('Tausch und eigene Satzzahl', () => {
    const base = buildTrainingWeek(pro())
    const first = base.days[0].exercises[0]
    const other = first.alternatives.find((n) => n !== first.name)!
    const week = buildTrainingWeek(pro({ exerciseSwaps: { [first.key]: other }, setOverrides: { [first.key]: 1 } }))
    const swapped = week.days[0].exercises.find((e) => e.key === first.key)!
    expect(swapped.name).toBe(other)
    expect(swapped.sets).toBe(1)
  })
  it('Basic-Studio ohne Maschinen', () => {
    const names = buildTrainingWeek(pro({ location: 'basic' })).days.flatMap((d) => d.exercises.map((e) => e.name))
    expect(names.some((n) => /Maschine|Beinpresse|Beinbeuger$|Beinstrecker/.test(n))).toBe(false)
  })})

describe('Hybrid-Splits', () => {
  it('5 Tage: Push FB, Pull FB, Push, Pull, Beine und weitere', () => {
    expect(splitOptions(a({ trainingDays: [0, 1, 2, 3, 4] }))).toEqual(expect.arrayContaining(['fbppl', 'okukarme', 'torsolimbsfb', 'fbokuk']))
    const week = buildTrainingWeek(pro({ trainingDays: [0, 1, 2, 3, 4], split: 'fbppl' }))
    expect(week.days.map((d) => d.name)).toEqual(['Push Fullbody', 'Pull Fullbody', 'Push', 'Pull', 'Beine'])
    expect(week.schedule.map((x) => x.unit)).toEqual([0, 1, 2, 3, 4])
    for (const d of week.days) expect(d.workSets).toBeLessThanOrEqual(20)
  })
  it('Push/Pull Fullbody nach eigener Vorlage', () => {
    const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split: 'pushpullfb', trainingDays: [0, 1, 3, 4], durationMin: 75 }))
    const push = week.days[0].exercises.map((e) => e.name)
    const pull = week.days[1].exercises.map((e) => e.name)
    expect(push.slice(0, 3)).toEqual(['Schrägbankdrücken (Smith Maschine)', 'Bankdrücken (Kurzhantel)', 'Butterfly (Maschine)'])
    expect(push).toEqual(expect.arrayContaining(['Beinpresse', 'Beinstrecker', 'Seitheben']))
    expect(pull).toEqual(expect.arrayContaining(['Latzug', 'Rudern (Maschine) (einarmig)', 'T-Bar', 'Preacher Curls (kurzhantel)']))
  })
  it('Trapez: Rudervarianten inkl. T-Bar', () => {
    const week = buildTrainingWeek(pro({ split: 'okuk', trainingDays: [0, 1, 3, 4], focusByUnit: { 'Oberkörper A': ['Trapez'] } }))
    const ok = week.days.find((d) => d.name === 'Oberkörper A')!
    expect(ok.exercises[0].name).toBe('T-Bar')
    expect(ok.exercises[0].alternatives).toEqual(expect.arrayContaining(['Kabelrudern (breit, zur Brust)', 'Seal Row', 'Shrugs (Kurzhantel)']))
  })
})

describe('RDLs treffen auch den Po', () => {
  it('zählen voll für Beinbeuger und Po', async () => {
    const { catalogExercise, muscleShare, volumeFromRecords } = await import('./trainingPlan')
    const rdl = catalogExercise('Rumänisches Kreuzheben')!
    expect(muscleShare(rdl, 'Beinbeuger')).toBe(1)
    expect(muscleShare(rdl, 'Po')).toBe(1)
    const { setRecords } = await import('./muscles')
    const records = setRecords({ date: '2026-09-30', exercise: 'Rumänisches Kreuzheben' }, 'Beinbeuger')
    expect(records.map((r) => r.muscle)).toEqual(['Beinbeuger', 'Po'])
    const v = volumeFromRecords(records)
    expect(v.get('Po')).toBe(1)
    expect(v.get('Beinbeuger')).toBe(1)
  })
})

describe('Push/Pull Fullbody decken ihre Beine ab', () => {
  it('Push: Waden, Quads, Adduktoren - Pull: Beinbeuger, Bauch - auch beim Abnehmen und mit 30 min', () => {
    for (const goal of ['abnehmen', 'aufbauen'] as const)
      for (const durationMin of [30, 60] as const) {
        const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal, durationMin, split: 'pushpullfb', trainingDays: [0, 1, 3, 4] }))
        const muscles = (i: number) => new Set(week.days[i].exercises.map((e) => e.muscle))
        for (const m of ['Waden', 'Quadrizeps', 'Adduktoren'] as const) expect(muscles(0).has(m), `${goal} ${durationMin} ${m}`).toBe(true)
        for (const m of ['Beinbeuger', 'Bauch'] as const) expect(muscles(1).has(m), `${goal} ${durationMin} ${m}`).toBe(true)
      }
  })
})

describe('Schwerpunkt immer im Plan, Schultern getrennt', () => {
  it('Fokus-Übung bleibt auch bei 30 min und Satzgrenze 12', () => {
    for (const m of ['Hint. Schulter', 'Seitl. Schulter', 'Trapez', 'Adduktoren', 'Vord. Schulter'] as const) {
      const week = buildTrainingWeek(pro({ durationMin: 30, maxSets: 12, split: 'pushpullfb', focusByUnit: { 'Push Fullbody': [m], 'Pull Fullbody': [m] } }))
      for (const d of week.days) expect(d.exercises.some((e) => e.muscle === m && e.focus), `${d.name} ${m}`).toBe(true)
    }
  })
  it('seitliche und hintere Schulter getrennt', () => {
    const week = buildTrainingWeek(pro({ split: 'pushpullfb' }))
    expect(week.volume.map((v) => v.muscle)).toEqual(expect.arrayContaining(['Seitl. Schulter', 'Hint. Schulter']))
    const all = week.days.flatMap((d) => d.exercises)
    expect(all.find((e) => e.name === 'Seitheben')?.muscle).toBe('Seitl. Schulter')
    expect(all.find((e) => /Reverse|Face/.test(e.name))?.muscle).toBe('Hint. Schulter')
  })
})

describe('Zwei Schwerpunkte je Einheit', () => {
  it('Push FB und Pull FB je zwei Fokus-Muskeln vorne', () => {
    const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split: 'pushpullfb', trainingDays: [0, 1, 3, 4], focusByUnit: { 'Push Fullbody': ['Brust', 'Quadrizeps'], 'Pull Fullbody': ['Rücken', 'Bizeps'] } }))
    const [push, pull] = week.days
    expect(push.exercises.slice(0, 2).map((e) => [e.muscle, e.focus])).toEqual([['Brust', true], ['Quadrizeps', true]])
    expect(pull.exercises.slice(0, 2).map((e) => [e.muscle, e.focus])).toEqual([['Rücken', true], ['Bizeps', true]])
  })
})

describe('Volumen je Einheit verteilt, Fokus nur an seinem Tag', () => {
  it('ohne Fokus gleich viele Sätze je Einheit, mit Fokus nur der Fokus-Tag mehr', () => {
    const base = { experience: 'fortgeschritten' as const, goal: 'aufbauen' as const, split: 'pushpullfb' as const, trainingDays: [0, 1, 3, 4], durationMin: 90 as const, variants: 'gleich' as const }
    const plain = buildTrainingWeek(a(base))
    const ab = buildTrainingWeek(a({ ...base, split: 'okuk' }))
    // OK A und OK B trainieren die Brust gleich stark
    const chest = (d: (typeof ab.days)[number]) => d.exercises.filter((e) => e.muscle === 'Brust').reduce((n, e) => n + e.sets, 0)
    expect(chest(ab.days[0])).toBe(chest(ab.days[2]))
    const focus = buildTrainingWeek(a({ ...base, split: 'okuk', focusByUnit: { 'Oberkörper A': ['Brust'] } }))
    expect(chest(focus.days[0])).toBe(chest(focus.days[2]) + 1)
    expect(plain.days.length).toBe(2)
  })
})

describe('Gleiches Volumen an allen Tagen eines Muskels', () => {
  const setsOf = (d: { exercises: { muscle: string; sets: number; cardio?: boolean }[] }, m: string) => d.exercises.filter((e) => e.muscle === m && !e.cardio).reduce((n, e) => n + e.sets, 0)
  it('Push FB (Fokus Seitl. Schulter + Trizeps) hat genau einen Satz mehr als Push, alle anderen Muskeln gleich', () => {
    const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split: 'fbppl', trainingDays: [0, 1, 2, 3, 4], durationMin: 75, focusByUnit: { 'Push Fullbody': ['Seitl. Schulter', 'Trizeps'] } }))
    const byName = new Map(week.days.map((d) => [d.name, d]))
    for (const m of ['Seitl. Schulter', 'Trizeps']) expect(setsOf(byName.get('Push Fullbody')!, m), m).toBe(setsOf(byName.get('Push')!, m) + 1)
  })
  it('ohne Fokus: jeder Muskel an jedem seiner Tage gleich (außer Pflicht-Minimum)', () => {
    for (const split of ['fbppl', 'okuk', 'ppl', 'pushpullfb', 'ganzkoerper', 'torsolimbs', 'okukarme'] as const) {
      const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split, trainingDays: [0, 1, 2, 3, 4], durationMin: 60 }))
      for (const m of ['Brust', 'Rücken', 'Seitl. Schulter', 'Hint. Schulter', 'Bizeps', 'Trizeps', 'Quadrizeps', 'Beinbeuger']) {
        const vals = week.days.map((d) => setsOf(d, m)).filter((n) => n > 2)
        if (vals.length > 1) expect(Math.max(...vals) - Math.min(...vals), `${split} ${m} ${vals}`).toBe(0)
      }
    }
  })
})

describe('Obergrenze je Muskel und Training', () => {
  it('Obergrenze je Muskel und Training - am Fokus-Tag +1', () => {
    for (const split of ['fbppl', 'okuk', 'ppl', 'pushpullfb', 'ganzkoerper', 'bro', 'arnold'] as const)
      for (const days of [[0, 3], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4]]) {
        const week = buildTrainingWeek(a({ experience: 'erfahren', goal: 'aufbauen', split, trainingDays: days, durationMin: 90, maxSets: 25, focusByUnit: { 'Push Fullbody': ['Seitl. Schulter'] } }))
        for (const d of week.days) {
          const per = new Map<VolumeMuscle, number>()
          for (const e of d.exercises) if (!e.cardio) per.set(e.muscle, (per.get(e.muscle) ?? 0) + e.sets)
          for (const [m, n] of per) expect(n, `${split} ${days.length} ${d.name} ${m}`).toBeLessThanOrEqual(maxSetsPerSession(m) + (d.focus.includes(m) ? 1 : 0))
        }
      }
  })
})

describe('Schulterköpfe getrennt mit halben Werten', () => {
  it('Seitl./Hint. Schulter: MAV 8-11', () => {
    expect(LANDMARKS['Seitl. Schulter']).toEqual({ mv: 0, mev: 4, mavLo: 8, mavHi: 11, mrv: 13 })
    expect(LANDMARKS['Hint. Schulter']).toEqual({ mv: 0, mev: 4, mavLo: 8, mavHi: 11, mrv: 13 })
    expect(weeklyTarget('Seitl. Schulter', a({ goal: 'aufbauen', experience: 'fortgeschritten' }))).toBe(8)
  })
})

describe('Beine: Kniebeuge-Übung + Beinstrecker', () => {
  it('jede Einheit mit Quadrizeps hat eine Kniebeuge-Grundübung und Beinstrecker', () => {
    for (const split of ['fbppl', 'okuk', 'ppl', 'pushpullfb', 'ganzkoerper', 'torsolimbs', 'okukarme', 'bro'] as const)
      for (const goal of ['abnehmen', 'aufbauen'] as const) {
        const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal, split, trainingDays: [0, 1, 2, 3, 4], durationMin: 45 }))
        for (const d of week.days) {
          if (!d.exercises.some((e) => e.muscle === 'Quadrizeps')) continue
          const names = d.exercises.map((e) => e.name)
          expect(names, `${split} ${goal} ${d.name}`).toContain('Beinstrecker')
          expect(names.some((n) => /Beinpresse|Kniebeuge|Squat/.test(n)), `${split} ${goal} ${d.name}: ${names}`).toBe(true)
        }
      }
  })
})

describe('Pull ohne RDL', () => {
  it('Pull-Einheit enthält kein Kreuzheben', () => {
    for (const split of ['ppl', 'fbppl', 'pplokuk'] as const) {
      const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split, trainingDays: [0, 1, 2, 3, 4] }))
      const pull = week.days.find((d) => d.name === 'Pull')!
      expect(pull.exercises.map((e) => e.name).some((n) => /Kreuzheben|Good Morning/.test(n)), split).toBe(false)
    }
  })
})

describe('Wochenziel wird eingehalten, wenn der Plan Platz hat', () => {
  it('PPL 6 Tage: alle Muskeln (außer indirekten) mindestens am Ziel', () => {
    for (const goal of ['aufbauen', 'recomp', 'abnehmen'] as const) {
      const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal, split: 'ppl', trainingDays: [0, 1, 2, 3, 4, 5], durationMin: 90 }))
      for (const v of week.volume) if (!['Trapez', 'Vord. Schulter', 'Adduktoren'].includes(v.muscle)) expect(v.planned + 0.5, `${goal} ${v.muscle}`).toBeGreaterThanOrEqual(v.target)
    }
  })
  it('zu wenig Platz: Hinweis, wie viel fehlt', () => {
    const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split: 'ganzkoerper', trainingDays: [0, 2, 4], durationMin: 60 }))
    expect(week.warnings.some((w) => w.startsWith('Unter dem Wochenziel'))).toBe(true)
  })
})

describe('Split-Struktur bleibt erhalten', () => {
  const pushM = ['Brust', 'Seitl. Schulter', 'Trizeps', 'Vord. Schulter', 'Bauch', 'Waden']
  const pullM = ['Rücken', 'Hint. Schulter', 'Bizeps', 'Trapez', 'Bauch', 'Waden']
  const legM = ['Quadrizeps', 'Beinbeuger', 'Po', 'Waden', 'Bauch', 'Adduktoren']
  it('PPL: Push nur Push-Muskeln, Pull nur Pull-Muskeln, Beine nur Beine - bei 3, 5, 6 Tagen und jedem Ziel', () => {
    for (const days of [[0, 2, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5]])
      for (const goal of ['aufbauen', 'recomp', 'abnehmen'] as const) {
        const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal, split: 'ppl', trainingDays: days, durationMin: 60 }))
        const allowed: Record<string, string[]> = { Push: pushM, Pull: pullM, Beine: legM }
        for (const d of week.days) for (const e of d.exercises) if (!e.cardio) expect(allowed[d.name], `${days.length} ${goal} ${d.name}: ${e.name}`).toContain(e.muscle)
        const pull = week.days.find((d) => d.name === 'Pull')!
        expect(pull.exercises.some((e) => e.muscle === 'Bizeps'), `${days.length} ${goal} Pull Bizeps`).toBe(true)
        expect(pull.exercises.some((e) => e.muscle === 'Rücken'), `${days.length} ${goal} Pull Rücken`).toBe(true)
      }
  })
})

describe('Struktur der Einheiten nach Vorgabe', () => {
  const week = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split: 'ppl', trainingDays: [0, 1, 2, 3, 4, 5], durationMin: 60 }))
  const day = (n: string) => week.days.find((d) => d.name === n)!.exercises.map((e) => e.muscle)
  it('Push: Brust schräg, Brust flach, Fliegende, Seitheben, Trizeps, Schulterdrücken', () => {
    expect(day('Push').slice(0, 6)).toEqual(['Brust', 'Brust', 'Brust', 'Seitl. Schulter', 'Trizeps', 'Vord. Schulter'])
  })
  it('Pull: Latzug, Rudern eng, Rudern breit, Reverse Fly, Bizeps, Hammercurls', () => {
    expect(day('Pull').slice(0, 3)).toEqual(['Rücken', 'Rücken', 'Trapez'])
    const names = week.days.find((d) => d.name === 'Pull')!.exercises.map((e) => e.name)
    expect(names.indexOf('Reverse kablefly (einarmig)')).toBeLessThan(names.indexOf('Preacher Curls (kurzhantel)'))
    expect(names).toEqual(expect.arrayContaining(['Latzug', 'Hammercurls']))
  })
  it('Beine: Kniebeuge-Übung, Beinstrecker, Beinbeuger, RDL, Waden', () => {
    const names = week.days.find((d) => d.name === 'Beine')!.exercises.map((e) => e.name)
    expect(names.slice(0, 4)).toEqual(['Beinpresse', 'Beinstrecker', 'Beinbeuger', 'Rumänisches Kreuzheben'])
  })
  it('Kürzen nach Priorität: erst Sätze auf 2, dann hintere Übungen', () => {
    for (const split of ['ppl', 'okuk', 'pushpullfb', 'ganzkoerper', 'torsolimbs', 'arnold', 'bro'] as const) {
      const w = buildTrainingWeek(a({ experience: 'fortgeschritten', goal: 'aufbauen', split, trainingDays: [0, 2, 4], durationMin: 45 }))
      for (const d of w.days) expect(d.exercises.filter((e) => !e.cardio).length, `${split} ${d.name}`).toBeGreaterThanOrEqual(4)
    }
  })
})
