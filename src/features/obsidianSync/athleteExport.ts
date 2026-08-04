import { db } from '../../db/db'
import { ACTIVITY_LEVELS, GOALS, calculate } from '../../lib/calculator'
import type { Athlete, Gender } from '../../models/types'
import { record, requireSettings } from './importLog'
import type { ImportResult } from './importLog'
import { buildFrontmatter } from './markdownBuild'
import { parseAthlet, parseNumber } from './markdownParse'
import { syncFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { withVaultImport } from './syncState'

/**
 * Athleten-Stammdaten als Frontmatter in `20-Fitness/Athlet.md` - alles, was der
 * Kalorienrechner braucht, plus die Zielvorgaben. Damit sind die Werte in Obsidian sichtbar
 * und über den Vault auch änderbar.
 *
 * Dazu kommt die daraus gerechnete Kalorien- und Makro-Vorgabe (`ziel_*`). Die ist reine
 * Ausgabe: Sie wird beim Import nicht gelesen, weil sie sich aus den Stammdaten ergibt.
 */

export const ATHLET_PATH = '20-Fitness/Athlet.md'

const GENDERS: Gender[] = ['Männlich', 'Weiblich']

async function buildAthlet(): Promise<string | null> {
  const settings = requireSettings()
  const athlete = await db.athletes.get(settings.athleteId)
  if (!athlete) return null

  const target = calculate(athlete)

  return [
    ...buildFrontmatter({
      typ: 'athlet',
      name: athlete.name,
      geschlecht: athlete.gender,
      alter: athlete.age,
      groesse_cm: athlete.heightCm,
      gewicht_kg: athlete.weightKg,
      aktivitaet: athlete.activityLevel,
      ziel: athlete.goal,
      protein_pro_kg: athlete.proteinPerKg,
      fett_pro_kg: athlete.fatPerKg,
      kalorien_anpassung: athlete.calorieAdjustmentKcal,
      start: athlete.startDate,
      zielgewicht_kg: athlete.targetWeightKg,
      zieldatum: athlete.targetDate,
      ffmi: athlete.ffmi,
      akzentfarbe: athlete.accentColor,
      grundumsatz_kcal: target.bmr,
      gesamtumsatz_kcal: target.tdee,
      ziel_kalorien: target.targetCalories,
      ziel_protein_g: target.proteinG,
      ziel_kohlenhydrate_g: target.carbsG,
      ziel_fett_g: target.fatG,
    }),
    `# ${athlete.name}`,
    '',
    'Die Felder oben sind die Stammdaten aus der App. Werden sie hier geändert, übernimmt der',
    'nächste Sync sie - unbekannte Werte bei Geschlecht, Aktivität und Ziel werden dabei',
    'ignoriert, weil der Kalorienrechner nur die dort vorgesehenen Stufen kennt.',
    '',
    '## Vorgabe',
    '',
    `- **Kalorien:** ${target.targetCalories} kcal/Tag (Grundumsatz ${target.bmr}, Gesamtumsatz ${target.tdee})`,
    `- **Protein:** ${target.proteinG} g · **Kohlenhydrate:** ${target.carbsG} g · **Fett:** ${target.fatG} g`,
    '',
    'Diese Werte rechnet die App aus den Stammdaten (`grundumsatz_kcal`, `gesamtumsatz_kcal`,',
    '`ziel_*` im Frontmatter). Sie hier zu ändern hat keine Wirkung - der Sync liest sie nicht',
    'zurück. Stellschrauben sind Gewicht, Aktivität, Ziel, `kalorien_anpassung` und die',
    'Makro-Faktoren pro Kilogramm.',
    '',
  ].join('\n')
}

/**
 * Übernimmt die Stammdaten aus dem Vault - immer nur in den in den Sync-Einstellungen gewählten
 * Athleten. Über den Vault wird also nie ein Athlet angelegt, gelöscht oder ausgetauscht.
 *
 * Auswahlfelder (Geschlecht, Aktivität, Ziel) werden nur übernommen, wenn der Wert zu den in der
 * App vorgesehenen Stufen passt - ein Tippfehler in Obsidian würde sonst den Kalorienrechner
 * lahmlegen. Zahlen müssen positiv sein.
 */
export async function importAthlet(content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const fields = parseAthlet(content)
  const athlete = await db.athletes.get(settings.athleteId)
  if (!athlete) return record({ label: 'Stammdaten', changed: 0, skipped: [] })

  const patch: Partial<Athlete> = {}
  const skipped: string[] = []

  const text = (key: string): string | undefined => {
    const value = fields[key]?.trim()
    return value ? value : undefined
  }
  /** Übernimmt eine Zahl, wenn sie lesbar und im erlaubten Bereich ist. */
  const num = (key: string, min = 0): number | undefined => {
    const raw = text(key)
    if (raw === undefined) return undefined
    const value = parseNumber(raw)
    if (value === undefined || value < min) {
      skipped.push(`${key}: ${raw}`)
      return undefined
    }
    return value
  }
  const choice = (key: string, allowed: string[]): string | undefined => {
    const raw = text(key)
    if (raw === undefined) return undefined
    const match = allowed.find((option) => option.toLowerCase() === raw.toLowerCase())
    if (!match) {
      skipped.push(`${key}: ${raw}`)
      return undefined
    }
    return match
  }
  const isoDateField = (key: string): string | undefined => {
    const raw = text(key)
    if (raw === undefined) return undefined
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      skipped.push(`${key}: ${raw}`)
      return undefined
    }
    return raw
  }

  const name = text('name')
  if (name) patch.name = name

  const gender = choice('geschlecht', GENDERS)
  if (gender) patch.gender = gender as Gender

  const activityLevel = choice(
    'aktivitaet',
    ACTIVITY_LEVELS.map((level) => level.label),
  )
  if (activityLevel) patch.activityLevel = activityLevel

  const goal = choice(
    'ziel',
    GOALS.map((g) => g.label),
  )
  if (goal) patch.goal = goal

  const age = num('alter', 1)
  if (age !== undefined) patch.age = Math.round(age)

  const heightCm = num('groesse_cm', 1)
  if (heightCm !== undefined) patch.heightCm = heightCm

  const weightKg = num('gewicht_kg', 1)
  if (weightKg !== undefined) patch.weightKg = weightKg

  const proteinPerKg = num('protein_pro_kg', 0)
  if (proteinPerKg !== undefined) patch.proteinPerKg = proteinPerKg

  const fatPerKg = num('fett_pro_kg', 0)
  if (fatPerKg !== undefined) patch.fatPerKg = fatPerKg

  // Defizit ist negativ, Überschuss positiv - hier ist jedes Vorzeichen erlaubt.
  const adjustmentRaw = text('kalorien_anpassung')
  if (adjustmentRaw !== undefined) {
    const value = parseNumber(adjustmentRaw)
    if (value === undefined) skipped.push(`kalorien_anpassung: ${adjustmentRaw}`)
    else patch.calorieAdjustmentKcal = Math.round(value)
  }

  const startDate = isoDateField('start')
  if (startDate) patch.startDate = startDate

  const targetDate = isoDateField('zieldatum')
  if (targetDate) patch.targetDate = targetDate

  const targetWeightKg = num('zielgewicht_kg', 1)
  if (targetWeightKg !== undefined) patch.targetWeightKg = targetWeightKg

  const ffmi = num('ffmi', 1)
  if (ffmi !== undefined) patch.ffmi = ffmi

  const accentColor = text('akzentfarbe')
  if (accentColor && /^#[0-9a-f]{3,8}$/i.test(accentColor)) patch.accentColor = accentColor

  // Nur schreiben, was sich tatsächlich unterscheidet - sonst löst jeder Import einen
  // Dexie-Schreibvorgang und damit unnötige Neu-Renderings aus.
  const changedKeys = (Object.keys(patch) as (keyof Athlete)[]).filter((key) => patch[key] !== athlete[key])
  if (changedKeys.length > 0) {
    const effective: Partial<Athlete> = {}
    for (const key of changedKeys) Object.assign(effective, { [key]: patch[key] })
    await withVaultImport(async () => {
      await db.athletes.update(athlete.id, effective)
    })
  }

  return record({ label: 'Stammdaten', changed: changedKeys.length, skipped })
}

/** Gleicht Athlet.md in beide Richtungen ab. */
export async function syncAthlet(tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: ATHLET_PATH,
    build: buildAthlet,
    commitMessage: 'Sync: Stammdaten',
    importRemote: async (content) => {
      await importAthlet(content)
    },
    tree,
  })
}
