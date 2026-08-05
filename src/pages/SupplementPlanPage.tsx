import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportSupplementPlan, importSupplementPlan } from '../db/db'
import { shareOrDownloadFile } from '../lib/share'
import type { Athlete, Supplement, SupplementPlanItem, SupplementTiming } from '../models/types'
import { SUPPLEMENT_TIMINGS } from '../models/types'
import { Button, Card, Field, Input, Select } from '../components/ui'
import SearchPicker, { type SearchPickerItem } from '../components/SearchPicker'
import GroupAddChips from '../components/GroupAddChips'
import PlanItemRow from '../components/PlanItemRow'
import PlanPhaseHeader from '../components/PlanPhaseHeader'
import { nextOrder } from '../lib/calculator'
import { useCoachMode } from '../lib/detailLevel'

type Ctx = { athlete: Athlete }

export default function SupplementPlanPage() {
  const { athlete } = useOutletContext<Ctx>()
  const coachMode = useCoachMode()
  const plans = useLiveQuery(() => db.supplementPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const supplements = useLiveQuery(() => db.supplements.orderBy('name').toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  // Frisch angelegte Zeilen starten aufgeklappt - dort fehlt das Supplement noch.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const importInputRef = useRef<HTMLInputElement>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  const items = useLiveQuery(
    () => (currentPlanId ? db.supplementPlanItems.where('planId').equals(currentPlanId).toArray() : []),
    [currentPlanId],
  )

  const supplementMap = new Map((supplements ?? []).map((s) => [s.id, s]))
  const pickerItems: SearchPickerItem[] = (supplements ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    sublabel: s.defaultDose,
  }))

  const editing = mode === 'edit' && coachMode
  const allItems = items ?? []
  // Leseansicht und Kennzahlen überspringen Zeilen ohne Supplement (gerade erst angelegt).
  const visibleItems = editing ? allItems : allItems.filter((i) => i.supplementId !== '')

  const groups = SUPPLEMENT_TIMINGS.map((timing) => ({
    timing,
    items: visibleItems.filter((i) => i.timing === timing),
  })).filter((g) => g.items.length > 0)

  const usedTimings = new Set(groups.map((g) => g.timing))

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
    setMode('view')
  }

  async function renamePhase(planId: string, name: string) {
    await db.supplementPlans.update(planId, { phaseName: name })
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addRow(timing: SupplementTiming) {
    if (!currentPlanId) return
    // Ohne Supplement-Vorauswahl: Dosis und Zeitpunkt werden beim Auswählen aus dem
    // Supplement übernommen, der Zeitpunkt der Gruppe bleibt dabei erhalten.
    const item: SupplementPlanItem = {
      id: crypto.randomUUID(),
      planId: currentPlanId,
      supplementId: '',
      dose: '',
      timing,
    }
    await db.supplementPlanItems.add(item)
    setExpandedIds((prev) => new Set(prev).add(item.id))
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

  const filledCount = allItems.filter((i) => i.supplementId !== '').length

  return (
    <div className="flex flex-col gap-4">
      <PlanPhaseHeader
        title="Supplementplan"
        phases={plans ?? []}
        activePhaseId={currentPlanId}
        onSelect={(id) => {
          setActivePlanId(id)
          setMode('view')
        }}
        onAdd={coachMode ? addPhase : undefined}
        addLabel="+ Phase"
        onRename={activePlan ? (name) => renamePhase(activePlan.id, name) : undefined}
        onDelete={activePlan && plans && plans.length > 1 ? () => deletePhase(activePlan.id) : undefined}
        deleteConfirmText="Diese Phase mit allen Supplementen löschen?"
        subtitle={filledCount ? `${filledCount} ${filledCount === 1 ? 'Supplement' : 'Supplemente'}` : undefined}
        editing={editing}
        actions={
          activePlan && coachMode ? (
            <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setMode(editing ? 'view' : 'edit')}>
              {editing ? 'Fertig' : 'Bearbeiten'}
            </Button>
          ) : undefined
        }
      />

      {activePlan && (
        <Card className="flex flex-col gap-3">
          {groups.length === 0 && (
            <p className="text-sm text-muted">
              💊 Noch keine Supplemente in dieser Phase.
              {coachMode && !editing ? ' Tippe oben auf „Bearbeiten“, um zu planen.' : ''}
            </p>
          )}

          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.timing} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  {/* text-fg statt text-accent: die Athleten-Akzentfarben sind hell und im
                      Hell-Modus als Schrift praktisch unlesbar. */}
                  <div className="text-xs font-semibold uppercase tracking-wide text-fg">{group.timing}</div>
                  {editing && (
                    <Button
                      variant="ghost"
                      onClick={() => addRow(group.timing)}
                      aria-label={`Supplement zu ${group.timing} hinzufügen`}
                    >
                      + Supplement
                    </Button>
                  )}
                </div>

                {editing ? (
                  <div className="flex flex-col gap-1.5">
                    {group.items.map((item) => (
                      <SupplementRow
                        key={item.id}
                        item={item}
                        supplement={supplementMap.get(item.supplementId)}
                        supplementMap={supplementMap}
                        pickerItems={pickerItems}
                        expanded={expandedIds.has(item.id)}
                        onToggle={() => toggleExpanded(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate text-fg">
                          {supplementMap.get(item.supplementId)?.name ?? '–'}
                        </span>
                        <span className="shrink-0 text-muted">{item.dose}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {editing && (
            <GroupAddChips label="Einnahmezeitpunkt hinzufügen" options={SUPPLEMENT_TIMINGS} used={usedTimings} onAdd={addRow} />
          )}
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

function SupplementRow({
  item,
  supplement,
  supplementMap,
  pickerItems,
  expanded,
  onToggle,
}: {
  item: SupplementPlanItem
  supplement?: Supplement
  supplementMap: Map<string, Supplement>
  pickerItems: SearchPickerItem[]
  expanded: boolean
  onToggle: () => void
}) {
  const [picking, setPicking] = useState(item.supplementId === '')

  function update(patch: Partial<SupplementPlanItem>) {
    void db.supplementPlanItems.update(item.id, patch)
  }

  return (
    <PlanItemRow
      title={supplement?.name ?? 'Supplement wählen …'}
      subtitle={[item.dose, item.timing].filter(Boolean).join(' · ')}
      expanded={expanded}
      onToggle={onToggle}
      onDelete={() => db.supplementPlanItems.delete(item.id)}
      deleteLabel={`${supplement?.name ?? 'Supplement'} aus dem Plan entfernen`}
    >
      {picking && (
        <SearchPicker
          items={pickerItems}
          value={item.supplementId || undefined}
          onChange={(id) => {
            const s = supplementMap.get(id)
            // Der Zeitpunkt der Gruppe hat Vorrang, sobald einer gesetzt ist - sonst würde
            // die Zeile beim Auswählen in eine andere Gruppe springen.
            update({ supplementId: id, dose: item.dose || (s?.defaultDose ?? '') })
            setPicking(false)
          }}
          placeholder="Supplement suchen..."
        />
      )}

      <div className="flex items-center gap-2">
        <div className="w-28 shrink-0">
          <Input
            value={item.dose}
            onChange={(e) => update({ dose: e.target.value })}
            placeholder="z.B. 5 g"
            aria-label="Dosis"
          />
        </div>
        <Select
          value={item.timing}
          onChange={(e) => update({ timing: e.target.value as SupplementTiming })}
          className="flex-1"
          aria-label="Einnahmezeitpunkt"
        >
          {SUPPLEMENT_TIMINGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

      {supplement?.notes && (
        <Field label="Hinweis aus der Supplement-Datenbank">
          <span className="text-xs text-muted">{supplement.notes}</span>
        </Field>
      )}

      <div className="flex gap-1">
        <Button variant="ghost" onClick={() => setPicking((v) => !v)}>
          ✎ Supplement tauschen
        </Button>
      </div>
    </PlanItemRow>
  )
}
