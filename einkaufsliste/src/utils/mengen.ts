/**
 * Mengenangaben zusammenlegen.
 *
 * Steht „Cherrytomaten 250 g“ schon auf der Liste und ein Rezept will noch
 * einmal 200 g, soll daraus ein Eintrag mit 450 g werden – nicht zwei Zeilen,
 * die man im Laden beide suchen muss.
 *
 * Was sich nicht rechnen lässt („1 Packung“ und „200 g“), steht nebeneinander.
 * Aber: jede Angabe nur einmal. Zwanzig Rezepte mit „nach Geschmack“ ergeben
 * „nach Geschmack“, nicht zwanzig davon – daran ist die erste Fassung
 * gescheitert.
 */

/** Schreibweisen derselben Einheit, damit „St.“ und „Stück“ zusammenfinden. */
const EINHEITEN: Record<string, string> = {
  '': '',
  g: 'g',
  gramm: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilogramm: 'kg',
  ml: 'ml',
  l: 'l',
  liter: 'l',
  st: 'St.',
  'st.': 'St.',
  stk: 'St.',
  'stk.': 'St.',
  stueck: 'St.',
  stück: 'St.',
  x: 'St.',
  pck: 'Packung',
  'pck.': 'Packung',
  packung: 'Packung',
  packungen: 'Packung',
  päckchen: 'Päckchen',
  pkg: 'Packung',
  dose: 'Dose',
  dosen: 'Dose',
  glas: 'Glas',
  gläser: 'Glas',
  bund: 'Bund',
  zehe: 'Zehe',
  zehen: 'Zehe',
  kugel: 'Kugel',
  kugeln: 'Kugel',
  scheibe: 'Scheibe',
  scheiben: 'Scheibe',
  becher: 'Becher',
  flasche: 'Flasche',
  flaschen: 'Flasche',
  tube: 'Tube',
  tuben: 'Tube',
  el: 'EL',
  tl: 'TL',
  prise: 'Prise',
  prisen: 'Prise',
}

/** Einheiten, die im Plural anders heißen – „2 Dose“ liest sich falsch. */
const PLURAL: Record<string, string> = {
  Packung: 'Packungen',
  Dose: 'Dosen',
  Glas: 'Gläser',
  Zehe: 'Zehen',
  Kugel: 'Kugeln',
  Scheibe: 'Scheiben',
  Flasche: 'Flaschen',
  Tube: 'Tuben',
  Prise: 'Prisen',
}

interface Menge {
  zahl: number
  einheit: string
}

/** `"250 g"` → `{ zahl: 250, einheit: 'g' }`; `"1 Pck."` → `Packung`. */
export function parseMenge(text: string): Menge | null {
  const treffer = /^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(text ?? '')
  if (!treffer) return null

  const zahl = Number(treffer[1]!.replace(',', '.'))
  if (!Number.isFinite(zahl)) return null

  const roh = treffer[2]!.trim().toLowerCase()
  const einheit = EINHEITEN[roh]
  // Unbekannte Einheit („2 große“) lieber stehen lassen als falsch verrechnen
  return einheit === undefined ? null : { zahl, einheit }
}

/** Zahlen deutsch schreiben: 1.5 → „1,5“, 3.0 → „3“. */
function formatZahl(zahl: number): string {
  return String(Math.round(zahl * 1000) / 1000).replace('.', ',')
}

export function formatMenge(menge: Menge): string {
  if (!menge.einheit) return formatZahl(menge.zahl)
  const einheit = menge.zahl === 1 ? menge.einheit : (PLURAL[menge.einheit] ?? menge.einheit)
  return `${formatZahl(menge.zahl)} ${einheit}`
}

/**
 * Eine bereits zusammengelegte Angabe wieder in ihre Teile zerlegen, damit ein
 * dritter Zusatz nicht einfach hinten angehängt wird.
 */
function teile(text: string): string[] {
  // Nur am eigenen Trennzeichen schneiden: „500+ g“ und „16 (+1)“ sind eine
  // Angabe, kein zusammengelegtes Paar.
  return text
    .split(/\s\+\s/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Fasst beliebig viele Angaben zu einer zusammen: gleiche Einheiten addiert,
 * alles andere einmalig nebeneinander.
 */
export function mengenZusammenfassen(angaben: string[]): string {
  const summen = new Map<string, number>()
  const rest: string[] = []
  const gesehen = new Set<string>()

  for (const angabe of angaben.flatMap(teile)) {
    const menge = parseMenge(angabe)
    if (menge) {
      summen.set(menge.einheit, (summen.get(menge.einheit) ?? 0) + menge.zahl)
      continue
    }
    const key = angabe.toLowerCase()
    if (gesehen.has(key)) continue
    gesehen.add(key)
    rest.push(angabe)
  }

  const gerechnet = [...summen].map(([einheit, zahl]) => formatMenge({ zahl, einheit }))
  return [...gerechnet, ...rest].join(' + ')
}

/** Zwei Angaben zu einer machen – der Normalfall beim Hinzufügen. */
export function mengeZusammenfassen(vorhanden: string, dazu: string): string {
  return mengenZusammenfassen([vorhanden ?? '', dazu ?? ''])
}

// ── Eine Portion mehr ────────────────────────────────────────────────────────
// Beim Planen fällt einem ein, dass man die Cherrytomaten noch für ein zweites
// Gericht braucht. Dafür soll ein Tipp reichen – aber „ein Schritt“ heißt je
// nach Einheit etwas anderes: bei Stück, Packungen und Löffeln ist es eins, bei
// Gewicht und Volumen so viel, wie schon dasteht. 250 g werden zu 500 g, nicht
// zu 251 g.
const GEWICHT_VOLUMEN = new Set(['g', 'kg', 'ml', 'l'])

/** Um wie viel ein Schritt die Zahl verändert; null = nicht rechenbar. */
export function portionsSchritt(basis: string): number | null {
  const menge = parseMenge(basis)
  if (!menge) return null
  if (!GEWICHT_VOLUMEN.has(menge.einheit)) return 1
  return menge.zahl > 0 ? menge.zahl : null
}

/**
 * Eine Portion dazu oder weg.
 *
 * `basis` ist die Menge, die vor dem ersten Tipp dastand – nur so bleibt der
 * Schritt über mehrere Tipps derselbe und ein `−` landet wieder genau dort, wo
 * das `+` losgelaufen ist.
 *
 * Rückgabe `null`, wenn sich an der Angabe nichts rechnen lässt
 * („nach Geschmack“, „250 g + 1 Packung“) – dann gibt es auch keine Knöpfe.
 */
export function mengeStufen(aktuell: string, basis: string, richtung: 1 | -1): string | null {
  const schritt = portionsSchritt(basis)
  if (schritt === null) return null

  // Ohne Angabe steht implizit eine Einheit da: das erste + macht daraus zwei
  const jetzt = aktuell.trim()
    ? parseMenge(aktuell)
    : { zahl: 1, einheit: parseMenge(basis)?.einheit ?? '' }
  if (!jetzt) return null

  const zahl = Math.round((jetzt.zahl + richtung * schritt) * 1000) / 1000
  // Unter eine Portion geht es nicht
  if (zahl < schritt) return aktuell
  // Eine blanke Eins ist keine Angabe, sondern der Normalfall
  if (!jetzt.einheit && zahl <= 1) return ''
  return formatMenge({ zahl, einheit: jetzt.einheit })
}
