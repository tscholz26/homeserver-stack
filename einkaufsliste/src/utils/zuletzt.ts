/**
 * Wann ein Rezept zuletzt auf der Einkaufsliste gelandet ist. Daraus ergibt
 * sich die Reihenfolge beim Planen: was lange nicht dran war, steht oben.
 */

const TAG = 24 * 60 * 60 * 1000

/**
 * Lange nicht gewählt zuerst. Nie gewählte Rezepte stehen ganz oben – sie
 * sind am längsten nicht dran gewesen. Bei Gleichstand bleibt die Reihenfolge
 * aus dem Rezeptbuch (sort ist stabil).
 */
export function nachZuletzt<T extends { id: string }>(
  rezepte: T[],
  zuletzt: Record<string, string>,
): T[] {
  return [...rezepte].sort((a, b) => {
    const za = zuletzt[a.id] ?? ''
    const zb = zuletzt[b.id] ?? ''
    if (za === zb) return 0
    return za < zb ? -1 : 1
  })
}

/** „heute“, „gestern“, „vor 5 Tagen“, „vor 3 Wochen“, „vor 4 Monaten“. */
export function wieLangeHer(iso: string, jetzt = new Date()): string {
  const damals = new Date(iso)
  if (Number.isNaN(damals.getTime())) return ''
  // Nach Kalendertagen zählen, nicht nach 24-Stunden-Blöcken: gestern Abend
  // ist „gestern“, auch wenn erst zwölf Stunden vergangen sind.
  const tag = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const tage = Math.round((tag(jetzt) - tag(damals)) / TAG)
  if (tage <= 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 14) return `vor ${tage} Tagen`
  if (tage < 60) return `vor ${Math.floor(tage / 7)} Wochen`
  const monate = Math.floor(tage / 30)
  if (monate < 24) return `vor ${monate} Monaten`
  return `vor ${Math.floor(tage / 365)} Jahren`
}
