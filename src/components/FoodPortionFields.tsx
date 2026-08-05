import { GRAM_PRESETS } from '../lib/macros'
import { Input } from './ui'
import SearchPicker, { type SearchPickerItem } from './SearchPicker'
import QuickAddFood from './QuickAddFood'

/**
 * Lebensmittel + Portionsgröße - identisch im Ernährungsplan und im Ernährungslog, deshalb
 * hier einmal statt zweimal. Rendert ein Fragment, den Rahmen setzt die aufrufende Zeile.
 */
export default function FoodPortionFields({
  pickerItems,
  foodItemId,
  grams,
  onChange,
}: {
  pickerItems: SearchPickerItem[]
  foodItemId: string
  grams: number
  onChange: (patch: { foodItemId?: string; grams?: number }) => void
}) {
  const favorites = pickerItems.filter((f) => f.favorite)

  return (
    <>
      <SearchPicker
        items={pickerItems}
        value={foodItemId || undefined}
        onChange={(id) => onChange({ foodItemId: id })}
        placeholder="Lebensmittel suchen..."
        noResultsAction={(query) => <QuickAddFood query={query} onCreated={(id) => onChange({ foodItemId: id })} />}
      />

      {!foodItemId && favorites.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {favorites.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange({ foodItemId: f.id })}
              className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent"
            >
              ⭐ {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="w-20 shrink-0">
          <Input
            type="number"
            inputMode="numeric"
            value={grams}
            onChange={(e) => onChange({ grams: Number(e.target.value) })}
            aria-label="Menge in Gramm"
          />
        </div>
        <span className="text-xs text-muted">g</span>
        <div className="flex flex-1 gap-1">
          {/* Aktive Vorauswahl in text-fg statt text-accent: die Athleten-Akzentfarben sind hell
              und im Hell-Modus als Schrift praktisch unlesbar. */}
          {GRAM_PRESETS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange({ grams: g })}
              className={`flex-1 rounded-lg border px-1 py-1.5 text-xs ${
                grams === g ? 'border-fg bg-fg/10 font-medium text-fg' : 'border-border text-muted'
              }`}
            >
              {g}g
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
