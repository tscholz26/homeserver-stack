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
  return menge.einheit ? `${formatZahl(menge.zahl)} ${menge.einheit}` : formatZahl(menge.zahl)
}

/**
 * Eine bereits zusammengelegte Angabe wieder in ihre Teile zerlegen, damit ein
 * dritter Zusatz nicht einfach hinten angehängt wird.
 */
function teile(text: string): string[] {
  return text
    .split('+')
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
