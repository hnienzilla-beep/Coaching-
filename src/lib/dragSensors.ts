import { MouseSensor, TouchSensor, useSensor, useSensors, type Modifier } from '@dnd-kit/core'

/** Verschieben nur senkrecht - Listen wandern nicht seitlich aus dem Bild. */
export const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

// PointerSensor vereinheitlicht Maus/Touch/Pen über eine reine Bewegungsdistanz - auf iOS
// Safari kann das nach einer Scroll-Geste dazu führen, dass eine nachfolgende Touch-Sequenz
// nicht mehr an JS durchgereicht wird und der Drag gar nicht erst startet. Deshalb ein eigener
// TouchSensor. Gezogen wird nur am Griff (`touch-none`, dort scrollt nichts) - ein kurzes
// Anziehen von wenigen Pixeln reicht, ohne Halten.
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
  )
}
