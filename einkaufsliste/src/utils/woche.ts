import { HALTBARKEITEN, type Haltbarkeit } from '@/utils/haltbarkeit'

export interface WochenAbschnitt<T> {
  id: Haltbarkeit
  emoji: string
  label: string
  eintraege: T[]
}

/**
 * „Diese Woche“ nach Frisch und Vorrat: frisch zuerst, weil das zuerst gekocht
 * werden muss. Innerhalb eines Abschnitts steht oben, was schon am längsten
 * eingeplant ist. Gerichte ohne Angabe kommen ans Ende; leere Abschnitte fallen
 * weg.
 */
export function wocheNachHaltbarkeit<T extends { addedAt: string }>(
  eintraege: T[],
  haltbarkeitVon: (eintrag: T) => Haltbarkeit,
): WochenAbschnitt<T>[] {
  const abschnitte: WochenAbschnitt<T>[] = [
    ...HALTBARKEITEN.map((h) => ({
      id: h.id,
      emoji: h.emoji,
      label: h.lang,
      eintraege: [] as T[],
    })),
    { id: '', emoji: '🍽️', label: 'Noch nicht festgelegt', eintraege: [] },
  ]
  for (const e of eintraege) {
    const h = haltbarkeitVon(e)
    ;(abschnitte.find((a) => a.id === h) ?? abschnitte[abschnitte.length - 1]!).eintraege.push(e)
  }
  for (const a of abschnitte) a.eintraege.sort((x, y) => x.addedAt.localeCompare(y.addedAt))
  return abschnitte.filter((a) => a.eintraege.length > 0)
}
