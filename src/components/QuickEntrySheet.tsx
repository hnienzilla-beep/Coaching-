import { useEffect, useState } from 'react'
import { caloriesFromMacros } from '../lib/calculator'
import { macroLine } from '../lib/macros'
import { quickMacros, type QuickMacros } from '../lib/quickEntry'
import type { MealType } from '../models/types'
import MealOptions from './MealOptions'
import { suggestedMeal } from '../lib/meals'
import Sheet from './Sheet'
import { Button, DecimalInput, Field, Input, Select } from './ui'

/**
 * Schnell eintragen, ohne Lebensmittel zu suchen - fürs Restaurant, die Party, das Stück Kuchen
 * beim Kollegen. Kalorien reichen; Makros sind optional und präzisieren.
 */
export default function QuickEntrySheet({
  open,
  target,
  onClose,
  onSave,
}: {
  open: boolean
  target: QuickMacros
  onClose: () => void
  onSave: (entry: { name: string; macros: QuickMacros; mealType: MealType }) => Promise<void> | void
}) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState<number | undefined>()
  const [protein, setProtein] = useState<number | undefined>()
  const [carbs, setCarbs] = useState<number | undefined>()
  const [fat, setFat] = useState<number | undefined>()
  const [mealType, setMealType] = useState<MealType>(suggestedMeal())

  useEffect(() => {
    if (!open) return
    setName('')
    setKcal(undefined)
    setProtein(undefined)
    setCarbs(undefined)
    setFat(undefined)
    setMealType(suggestedMeal())
  }, [open])

  const macros = quickMacros({ kcal, protein, carbs, fat }, target)
  const estimated = macros !== undefined && !(protein || carbs || fat)

  return (
    <Sheet
      open={open}
      title="Schnell eintragen"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={!macros}
          onClick={async () => {
            if (!macros) return
            await onSave({ name: name.trim() || 'Schnell-Eintrag', macros, mealType })
            onClose()
          }}
        >
          Eintragen
        </Button>
      }
    >
      <Field label="Was war es? (optional)">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Pizza beim Italiener" />
      </Field>
      <Field label="Kalorien (kcal)">
        <DecimalInput value={kcal} onChange={setKcal} placeholder="z. B. 900" autoFocus />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Protein g">
          <DecimalInput value={protein} onChange={setProtein} placeholder="–" />
        </Field>
        <Field label="Carbs g">
          <DecimalInput value={carbs} onChange={setCarbs} placeholder="–" />
        </Field>
        <Field label="Fett g">
          <DecimalInput value={fat} onChange={setFat} placeholder="–" />
        </Field>
      </div>
      <Field label="Mahlzeit">
        <Select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
          <MealOptions current={mealType} />
        </Select>
      </Field>
      <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
        {macros ? (
          <>
            <span className="tabular-nums text-fg">
              {macroLine({ kcal: caloriesFromMacros(macros.protein, macros.carbs, macros.fat), ...macros })}
            </span>
            {estimated && <p className="mt-1 text-xs text-muted">Makros geschätzt im Verhältnis deiner Tagesvorgabe.</p>}
          </>
        ) : (
          <span className="text-muted">Kalorien oder Makros eingeben.</span>
        )}
      </div>
    </Sheet>
  )
}
