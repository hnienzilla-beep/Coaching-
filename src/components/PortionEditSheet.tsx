import { useEffect, useState } from 'react'
import { caloriesFromMacros } from '../lib/calculator'
import { macroLine } from '../lib/macros'
import { suggestPortions, useFoodPortionHistory, useStandardPortions } from '../lib/portionPresets'
import type { FoodItem, MealType } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { AmountInput } from './AddFoodSheet'
import Sheet from './Sheet'
import { Button, Field, Select } from './ui'

/**
 * Menge (und Mahlzeit) eines Eintrags ändern oder ihn entfernen - gleich im Ernährungslog und
 * im Plan-/Rezept-Editor. `entry` null heißt geschlossen.
 */
export default function PortionEditSheet({
  entry,
  food,
  showMealType = true,
  onSave,
  onRemove,
  onClose,
}: {
  entry: { grams: number; mealType: MealType } | null
  food?: Pick<FoodItem, 'name' | 'protein' | 'carbs' | 'fat'> & { id?: string }
  showMealType?: boolean
  onSave: (grams: number, mealType: MealType) => void | Promise<void>
  onRemove: () => void | Promise<void>
  onClose: () => void
}) {
  const [grams, setGrams] = useState<number | undefined>(entry?.grams)
  const [mealType, setMealType] = useState<MealType>(entry?.mealType ?? MEAL_TYPES[0])
  const standards = useStandardPortions()
  const suggestion = suggestPortions(useFoodPortionHistory(food?.id) ?? [], standards)

  useEffect(() => {
    if (!entry) return
    setGrams(entry.grams)
    setMealType(entry.mealType)
  }, [entry])

  if (!entry) return null
  const valid = grams !== undefined && grams > 0
  const f = (grams ?? 0) / 100
  const preview = food
    ? {
        kcal: caloriesFromMacros(food.protein * f, food.carbs * f, food.fat * f),
        protein: food.protein * f,
        carbs: food.carbs * f,
        fat: food.fat * f,
      }
    : undefined

  return (
    <Sheet
      open
      title={food?.name ?? 'Eintrag bearbeiten'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              await onRemove()
              onClose()
            }}
          >
            Entfernen
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!valid}
            onClick={async () => {
              if (!valid) return
              await onSave(grams, mealType)
              onClose()
            }}
          >
            Übernehmen
          </Button>
        </div>
      }
    >
      <AmountInput
        value={grams}
        onChange={setGrams}
        presets={suggestion.presets}
        learned={suggestion.learned}
        editableStandards
        unit="g"
        label="Menge in Gramm"
      />
      {showMealType && (
        <Field label="Mahlzeit">
          <Select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
            {MEAL_TYPES.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {preview && <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm tabular-nums text-fg">{macroLine(preview)}</p>}
    </Sheet>
  )
}
