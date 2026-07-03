import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'

// PointerSensor vereinheitlicht Maus/Touch/Pen über eine reine Bewegungsdistanz - auf iOS
// Safari kann das nach einer Scroll-Geste dazu führen, dass eine nachfolgende Touch-Sequenz
// nicht mehr an JS durchgereicht wird und der Drag gar nicht erst startet. TouchSensor mit
// delay+tolerance (kurzes Halten statt reiner Distanz) unterscheidet einen Drag-Versuch
// zuverlässiger von einem Scroll-Wisch.
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
}
