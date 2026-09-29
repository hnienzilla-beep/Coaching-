import { activeMeals, mealLabel, usePrefs } from '../lib/prefs'

/** `<option>`s der eingeschalteten Mahlzeiten mit ihren Namen - plus die aktuelle, falls sie ausgeschaltet ist. */
export default function MealOptions({ current }: { current?: string }) {
  const prefs = usePrefs()
  const meals = activeMeals(prefs)
  return (
    <>
      {current && !meals.some((m) => m.slot === current) && <option value={current}>{mealLabel(current, prefs)}</option>}
      {meals.map((m) => (
        <option key={m.slot} value={m.slot}>
          {m.name}
        </option>
      ))}
    </>
  )
}
