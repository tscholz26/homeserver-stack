/**
 * SortableJS verschiebt beim Ziehen den DOM-Knoten selbst. Vue soll aber aus
 * dem Zustand zeichnen – sonst laufen Anzeige und Daten auseinander. Deshalb
 * kommt der Knoten nach dem Ziehen an seinen alten Platz zurück, und erst die
 * Änderung am Zustand verschiebt ihn richtig.
 *
 * Erst herausnehmen, dann einsetzen: Die alte Fassung setzte den Knoten vor
 * `children[oldIndex]`, solange er noch in der Liste stand. Nach oben gezogen
 * ist das sein eigener Nachbar – der Knoten blieb, wo er war, und die Anzeige
 * zeigte etwas anderes, als gespeichert wurde.
 */
export function zurueckAnAltenPlatz(evt: {
  from: HTMLElement
  item: HTMLElement
  oldIndex?: number
}) {
  const { from, item, oldIndex } = evt
  if (oldIndex == null || item.parentNode !== from) return
  from.removeChild(item)
  from.insertBefore(item, from.children[oldIndex] ?? null)
}
