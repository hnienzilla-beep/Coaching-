import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, exportSupplementPlan, importSupplementPlan } from '../db/db'
import { savePhaseOrder } from '../db/queries'
import { shareOrDownloadFile } from '../lib/share'
import type { Athlete, Supplement, SupplementPlanItem, SupplementTiming } from '../models/types'
import { SUPPLEMENT_TIMINGS } from '../models/types'
import { Button, Field, Input, ListRow, SectionHeader, Select } from '../components/ui'
import CollapsibleCard from '../components/CollapsibleCard'
import PlanPhaseHeader from '../components/PlanPhaseHeader'
import Sheet from '../components/Sheet'
import { nextOrder } from '../lib/calculator'
import { useCoachMode } from '../lib/detailLevel'
import { useDragSensors } from '../lib/dragSensors'

type Ctx = { athlete: Athlete }

export default function SupplementPlanPage() {
  const { athlete } = useOutletContext<Ctx>()
  const coachMode = useCoachMode()
  const plans = useLiveQuery(() => db.supplementPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const supplements = useLiveQuery(() => db.supplements.orderBy('name').toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  // Anlegen und Bearbeiten im Sheet: `item` fehlt beim Anlegen, `timing` ist dann die Gruppe.
  const [sheet, setSheet] = useState<{ item?: SupplementPlanItem; timing: SupplementTiming } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  const items = useLiveQuery(
    () => (currentPlanId ? db.supplementPlanItems.where('planId').equals(currentPlanId).sortBy('order') : []),
    [currentPlanId],
  )

  // Zahl der Supplemente je Phase für die Phasen-Übersicht - eine Abfrage über alle Phasen
  // statt einer je Chip. Zeilen ohne Supplement zählen nicht mit.
  const planIdKey = (plans ?? []).map((p) => p.id).join(',')
  const itemCounts = useLiveQuery(async () => {
    const planIds = planIdKey === '' ? [] : planIdKey.split(',')
    const all = await db.supplementPlanItems.where('planId').anyOf(planIds).toArray()
    const counts = new Map<string, number>()
    for (const item of all) {
      if (item.supplementId !== '') counts.set(item.planId, (counts.get(item.planId) ?? 0) + 1)
    }
    return counts
  }, [planIdKey])

  const sensors = useDragSensors()
  const supplementMap = new Map((supplements ?? []).map((s) => [s.id, s]))

  const editing = mode === 'edit' && coachMode
  const allItems = items ?? []
  // Leseansicht und Kennzahlen überspringen Zeilen ohne Supplement (gerade erst angelegt).
  const visibleItems = editing ? allItems : allItems.filter((i) => i.supplementId !== '')

  const groups = SUPPLEMENT_TIMINGS.map((timing) => ({
    timing,
    items: visibleItems.filter((i) => i.timing === timing),
  })).filter((g) => g.items.length > 0)


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

  async function saveItem(values: Pick<SupplementPlanItem, 'supplementId' | 'dose' | 'timing'>) {
    if (!currentPlanId || !sheet) return
    if (sheet.item) {
      await db.supplementPlanItems.update(sheet.item.id, values)
    } else {
      await db.supplementPlanItems.add({ id: crypto.randomUUID(), planId: currentPlanId, order: nextOrder(allItems), ...values })
    }
  }

  // Wie im Ernährungsplan wirkt Drag & Drop nur innerhalb einer Zeitpunkt-Gruppe - der
  // Zeitpunkt selbst ändert sich nur über das Auswahlfeld der Zeile. Jede Gruppe bekommt
  // deshalb ihren eigenen DndContext und ihre eigenen order-Werte 0..n.
  async function handleDragEndInGroup(groupItems: SupplementPlanItem[], event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupItems.findIndex((i) => i.id === active.id)
    const newIndex = groupItems.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(groupItems, oldIndex, newIndex)
    await db.transaction('rw', db.supplementPlanItems, async () => {
      for (let i = 0; i < reordered.length; i++) {
        await db.supplementPlanItems.update(reordered[i].id, { order: i })
      }
    })
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
        phases={(plans ?? []).map((p) => ({
          id: p.id,
          phaseName: p.phaseName,
          count: itemCounts?.get(p.id) ?? 0,
        }))}
        activePhaseId={currentPlanId}
        onSelect={(id) => {
          setActivePlanId(id)
          setMode('view')
        }}
        onAdd={coachMode ? addPhase : undefined}
        addLabel="+ Phase"
        onRename={activePlan ? (name) => renamePhase(activePlan.id, name) : undefined}
        onDelete={activePlan && plans && plans.length > 1 ? () => deletePhase(activePlan.id) : undefined}
        onReorder={
          coachMode
            ? (ids) => {
                // Ohne gesetztes activePlanId zeigt die Seite die erste Phase - nach dem
                // Verschieben wäre das eine andere, und die gerade bearbeitete Phase wäre weg.
                setActivePlanId(currentPlanId)
                void savePhaseOrder('supplementPlans', ids)
              }
            : undefined
        }
        countLabel={(n) => `${n} ${n === 1 ? 'Supplement' : 'Supplemente'}`}
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
        <div className="flex flex-col gap-4">
          {groups.length === 0 && (
            <p className="px-1 text-center text-sm text-muted">
              Noch keine Supplemente in dieser Phase.
              {coachMode && !editing ? ' Tippe oben auf „Bearbeiten“, um zu planen.' : ''}
            </p>
          )}

          {groups.map((group) => (
            <section key={group.timing} className="flex flex-col gap-1.5">
              <SectionHeader
                title={group.timing}
                action={
                  editing ? (
                    <button
                      type="button"
                      onClick={() => setSheet({ timing: group.timing })}
                      aria-label={`Supplement zu ${group.timing} hinzufügen`}
                      className="rounded-full px-2.5 py-0.5 text-lg leading-none text-muted hover:text-fg"
                    >
                      +
                    </button>
                  ) : undefined
                }
              />
              {editing ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEndInGroup(group.items, e)}>
                  <SortableContext items={group.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    {group.items.map((item) => (
                      <SortableSupplementRow
                        key={item.id}
                        item={item}
                        supplement={supplementMap.get(item.supplementId)}
                        onEdit={() => setSheet({ item, timing: item.timing })}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                group.items.map((item) => (
                  <ListRow
                    key={item.id}
                    title={supplementMap.get(item.supplementId)?.name ?? '–'}
                    subtitle={supplementMap.get(item.supplementId)?.notes}
                    value={item.dose}
                  />
                ))
              )}
            </section>
          ))}

          {editing && (
            <Button variant="secondary" onClick={() => setSheet({ timing: SUPPLEMENT_TIMINGS[0] })}>
              + Supplement hinzufügen
            </Button>
          )}
        </div>
      )}

      <SupplementItemSheet
        key={sheet ? (sheet.item?.id ?? `new-${sheet.timing}`) : 'closed'}
        state={sheet}
        supplements={supplements ?? []}
        onSave={saveItem}
        onRemove={sheet?.item ? () => db.supplementPlanItems.delete(sheet.item!.id) : undefined}
        onClose={() => setSheet(null)}
      />

      {activePlan && coachMode && (
        <CollapsibleCard title="Export & Import" defaultExpanded={false}>
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
        </CollapsibleCard>
      )}
    </div>
  )
}

function SortableSupplementRow({ item, supplement, onEdit }: { item: SupplementPlanItem; supplement?: Supplement; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <ListRow
        leading={
          <span {...attributes} {...listeners} className="-ml-1 shrink-0 touch-none px-1 text-lg text-muted" aria-label="Verschieben">
            ⠿
          </span>
        }
        title={supplement?.name ?? 'Supplement wählen …'}
        value={item.dose}
        onClick={onEdit}
        ariaLabel={`${supplement?.name ?? 'Supplement'} bearbeiten`}
        onSwipeDelete={() => db.supplementPlanItems.delete(item.id)}
      />
    </div>
  )
}

/**
 * Supplement im Plan anlegen oder ändern: auswählen (Dosis kommt aus der Datenbank), Dosis und
 * Zeitpunkt anpassen. Ersetzt die leeren Zeilen, die vorher erst angelegt und dann gefüllt wurden.
 */
function SupplementItemSheet({
  state,
  supplements,
  onSave,
  onRemove,
  onClose,
}: {
  state: { item?: SupplementPlanItem; timing: SupplementTiming } | null
  supplements: Supplement[]
  onSave: (values: Pick<SupplementPlanItem, 'supplementId' | 'dose' | 'timing'>) => Promise<void>
  onRemove?: () => Promise<void>
  onClose: () => void
}) {
  const [supplementId, setSupplementId] = useState(state?.item?.supplementId ?? '')
  const [dose, setDose] = useState(state?.item?.dose ?? '')
  const [timing, setTiming] = useState<SupplementTiming>(state?.timing ?? SUPPLEMENT_TIMINGS[0])
  const [query, setQuery] = useState('')

  if (!state) return null
  const selected = supplements.find((s) => s.id === supplementId)
  const q = query.trim().toLowerCase()
  const matches = supplements.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 30)

  return (
    <Sheet
      open
      tall={!state.item}
      title={state.item ? (selected?.name ?? 'Supplement') : 'Supplement hinzufügen'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {onRemove && (
            <Button
              variant="danger"
              onClick={async () => {
                await onRemove()
                onClose()
              }}
            >
              Entfernen
            </Button>
          )}
          <Button
            variant="primary"
            className="flex-1"
            disabled={!supplementId}
            onClick={async () => {
              await onSave({ supplementId, dose, timing })
              onClose()
            }}
          >
            {state.item ? 'Übernehmen' : 'Hinzufügen'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Dosis">
          <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="z.B. 5 g" />
        </Field>
        <Field label="Zeitpunkt">
          <Select value={timing} onChange={(e) => setTiming(e.target.value as SupplementTiming)}>
            {SUPPLEMENT_TIMINGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {selected?.notes && <p className="text-xs text-muted">Hinweis: {selected.notes}</p>}

      <Input type="search" placeholder="Supplement suchen …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Supplement suchen" />
      <div className="flex flex-col gap-1.5">
        {matches.length === 0 && <p className="px-1 text-sm text-muted">Keine Treffer – neue Supplemente legst du in der Supplement-Datenbank an.</p>}
        {matches.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            subtitle={s.defaultTiming}
            value={s.id === supplementId ? '✓' : s.defaultDose}
            onClick={() => {
              setSupplementId(s.id)
              // Die Standard-Dosis nur übernehmen, solange keine eigene eingetragen ist.
              if (!dose) setDose(s.defaultDose)
            }}
          />
        ))}
      </div>
    </Sheet>
  )
}
