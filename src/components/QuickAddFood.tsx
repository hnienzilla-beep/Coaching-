import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { caloriesFromMacros } from '../lib/calculator'
import { Button, DecimalInput, Input } from './ui'

/**
 * Inline-Formular für den "Keine Treffer"-Fall des `SearchPicker`: legt ein Lebensmittel
 * an und wählt es direkt aus. Wird von Ernährungsplan und Ernährungslog genutzt.
 */
export default function QuickAddFood({ query, onCreated }: { query: string; onCreated: (id: string) => void }) {
  const [name, setName] = useState(query)
  const [nameTouched, setNameTouched] = useState(false)
  const [protein, setProtein] = useState(0)
  const [carbs, setCarbs] = useState(0)
  const [fat, setFat] = useState(0)

  // Solange der Nutzer den Namen nicht selbst bearbeitet hat, folgt er weiterhin dem
  // Suchtext - sonst würde beim Weitertippen nach dem ersten "Keine Treffer"-Moment nur
  // das bis dahin eingegebene Präfix als Name übernommen.
  useEffect(() => {
    if (!nameTouched) setName(query)
  }, [query, nameTouched])

  async function create() {
    if (!name.trim()) return
    const id = crypto.randomUUID()
    await db.foodItems.add({ id, name: name.trim(), protein, carbs, fat, kcal: caloriesFromMacros(protein, carbs, fat) })
    onCreated(id)
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-xs text-muted">Keine Treffer – neues Lebensmittel anlegen (Werte je 100 g):</p>
      <Input
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setNameTouched(true)
        }}
        placeholder="Name"
      />
      <div className="grid grid-cols-3 gap-1.5">
        <DecimalInput value={protein} onChange={(n) => setProtein(n ?? 0)} placeholder="Protein" />
        <DecimalInput value={carbs} onChange={(n) => setCarbs(n ?? 0)} placeholder="Carbs" />
        <DecimalInput value={fat} onChange={(n) => setFat(n ?? 0)} placeholder="Fett" />
      </div>
      <Button type="button" variant="primary" onClick={create}>
        + Anlegen &amp; auswählen
      </Button>
    </div>
  )
}
