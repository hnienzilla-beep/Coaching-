import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportSupplementPlan, importSupplementPlan } from '../db/db'
import { shareOrDownloadFile } from '../lib/share'
import { nextOrder } from '../lib/calculator'
import type { Athlete, Supplement, SupplementPlanItem, SupplementTiming } from '../models/types'
import { SUPPLEMENT_TIMINGS } from '../models/types'
import { Button, Card, Select } from '../components/ui'
import SearchPicker from '../components/SearchPicker'
import { useCoachMode } from '../lib/coachMode'

type Ctx = { athlete: Athlete }

function sortByTiming<T extends { timing: SupplementTiming }>(items: T[]): T[] {
  return [...items].sort((a, b) => SUPPLEMENT_TIMINGS.indexOf(a.timing) - SUPPLEMENT_TIMINGS.indexOf(b.timing))
}

export default function SupplementPlanPage() {
  const { athlete } = useOutletContext<Ctx>()
  const [coachMode] = useCoachMode()
  const plans = useLiveQuery(() => db.supplementPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const supplements = useLiveQuery(() => db.supplements.orderBy('name').toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const importInputRef = useRef<HTMLInputElement>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  const items = useLiveQuery(
    () => (currentPlanId ? db.supplementPlanItems.where('planId').equals(currentPlanId).toArray() : []),
    [currentPlanId],
  )
  const sortedItems = sortByTiming(items ?? [])

  const supplementMap = new Map((supplements ?? []).map((s) => [s.id, s]))
  const pickerItems = (supplements ?? []).map((s) => ({ id: s.id, label: s.name, sublabel: s.defaultDose }))

  async function addPhase() {
    const order = nextOrder(plans ?? [])
    const id = crypto.randomUUID()
    await db.supplementPlans.add({ id, athleteId: athlete.id, phaseName: `Phase ${order + 1}`, order })
    setActivePlanId(id)
  }

  async function deletePhase(planId: string) {
    await db.supplementPlanItems.where('planId').equals(planId).delete()
    await db.supplementPlans.delete(planId)
    setActivePlanId(null)
  }

  async function renamePhase(planId: string, name: string) {
    await db.supplementPlans.update(planId, { phaseName: name })
  }

  async function addRow() {
    if (!currentPlanId || !supplements?.length) return
    const first = supplements[0]
    const item: SupplementPlanItem = {
      id: crypto.randomUUID(),
      planId: currentPlanId,
      supplementId: first.id,
      dose: first.defaultDose,
      timing: first.defaultTiming,
    }
    await db.supplementPlanItems.add(item)
  }

  async function handleExportPlan() {
    if (!activePlan) return
    const json = await exportSupplementPlan(activePlan.id)
    const file = new File([json], `Supplementplan-${activePlan.phaseName}.json`, { type: 'application/json' })
    await shareOrDownloadFile(file)
  }

  async function handleImportPlan(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const newPlanId = await importSupplementPlan(text, athlete.id)
      setActivePlanId(newPlanId)
    } catch {
      alert('Import fehlgeschlagen. Ist die Datei eine gültige Supplementplan-Vorlage?')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {plans?.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlanId(p.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              p.id === currentPlanId ? 'bg-accent text-black font-medium' : 'bg-surface-2 text-muted'
            }`}
          >
            {p.phaseName}
          </button>
        ))}
        {coachMode && (
          <button onClick={addPhase} className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted">
            + Phase
          </button>
        )}
      </div>

      {activePlan && mode === 'view' && (
        <SupplementOverview
          phaseName={activePlan.phaseName}
          items={sortedItems}
          supplementMap={supplementMap}
          onEdit={coachMode ? () => setMode('edit') : undefined}
        />
      )}

      {activePlan && mode === 'edit' && coachMode && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={activePlan.phaseName}
              onChange={(e) => renamePhase(activePlan.id, e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold text-fg outline-none focus:border-accent"
            />
            {plans && plans.length > 1 && (
              <Button variant="danger" onClick={() => deletePhase(activePlan.id)}>
                Phase löschen
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {sortedItems.map((item) => {
              const supplement = supplementMap.get(item.supplementId)
              return (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchPicker
                        items={pickerItems}
                        value={item.supplementId}
                        onChange={(id) => {
                          const s = supplementMap.get(id)
                          db.supplementPlanItems.update(item.id, {
                            supplementId: id,
                            dose: s?.defaultDose ?? item.dose,
                            timing: s?.defaultTiming ?? item.timing,
                          })
                        }}
                        placeholder="Supplement suchen..."
                      />
                    </div>
                    <Button variant="ghost" onClick={() => db.supplementPlanItems.delete(item.id)}>
                      ✕
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={item.dose}
                      onChange={(e) => db.supplementPlanItems.update(item.id, { dose: e.target.value })}
                      placeholder="Dosis, z.B. 5 g"
                      className="w-28 min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                    <Select
                      value={item.timing}
                      onChange={(e) => db.supplementPlanItems.update(item.id, { timing: e.target.value as SupplementTiming })}
                      className="flex-1"
                    >
                      {SUPPLEMENT_TIMINGS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {supplement?.notes && <div className="pl-1 text-xs text-muted">{supplement.notes}</div>}
                </div>
              )
            })}
          </div>

          <Button variant="secondary" onClick={addRow}>
            + Supplement hinzufügen
          </Button>

          <Button variant="primary" onClick={() => setMode('view')}>
            Fertig
          </Button>
        </Card>
      )}

      {activePlan && coachMode && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportPlan} className="flex-1">
            Plan exportieren
          </Button>
          <Button variant="secondary" onClick={() => importInputRef.current?.click()} className="flex-1">
            Plan importieren
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              void handleImportPlan(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}
    </div>
  )
}

function SupplementOverview({
  phaseName,
  items,
  supplementMap,
  onEdit,
}: {
  phaseName: string
  items: SupplementPlanItem[]
  supplementMap: Map<string, Supplement>
  onEdit?: () => void
}) {
  const groups = SUPPLEMENT_TIMINGS.map((timing) => ({
    timing,
    items: items.filter((i) => i.timing === timing),
  })).filter((g) => g.items.length > 0)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{phaseName}</h2>
        {onEdit && (
          <Button variant="secondary" onClick={onEdit}>
            Bearbeiten
          </Button>
        )}
      </div>

      {groups.length === 0 && <p className="text-sm text-muted">💊 Noch keine Supplements in dieser Phase.</p>}

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.timing}>
            <div className="pb-1 text-xs font-semibold uppercase tracking-wide text-accent">{group.timing}</div>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const supplement = supplementMap.get(item.supplementId)
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <span className="text-fg">{supplement?.name ?? '–'}</span>
                    <span className="text-muted">{item.dose}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
