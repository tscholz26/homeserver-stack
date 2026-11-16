/**
 * Frisch oder Vorrat: wie schnell die Zutaten eines Rezepts verbraucht sein
 * müssen. Das ist eine Eigenschaft des Rezepts und hängt nicht an der Gruppe –
 * leer heißt „noch nicht festgelegt“.
 */
export type Haltbarkeit = 'frisch' | 'vorrat' | ''

export const HALTBARKEITEN: {
  id: Exclude<Haltbarkeit, ''>
  emoji: string
  label: string
  lang: string
}[] = [
  { id: 'frisch', emoji: '🥗', label: 'Frisch', lang: 'Frisch – schnell verbrauchen' },
  { id: 'vorrat', emoji: '🥫', label: 'Vorrat', lang: 'Vorrat – hält sich länger' },
]

export function haltbarkeitInfo(h: Haltbarkeit) {
  return HALTBARKEITEN.find((x) => x.id === h) ?? null
}
