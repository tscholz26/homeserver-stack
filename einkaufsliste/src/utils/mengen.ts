/**
 * Zwei Mengenangaben zu einer machen.
 *
 * Steht „Cherrytomaten 250 g“ schon auf der Liste und ein Rezept will noch
 * einmal 200 g, soll daraus ein Eintrag mit 450 g werden – nicht zwei Zeilen,
 * die man im Laden beide suchen muss.
 *
 * Zusammengerechnet wird nur, was dieselbe Einheit hat. „1 Packung“ und
 * „200 g“ lassen sich nicht addieren, ohne sich etwas auszudenken; die stehen
 * deshalb nebeneinander („1 Packung + 200 g“). Lieber eine ehrliche Zeile als
 * eine erfundene Zahl.
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
 * Ergibt die Menge, die nach dem Zusammenlegen auf der Zeile steht.
 * Leere Angaben verschwinden, gleiche Einheiten werden addiert, alles andere
 * bleibt nebeneinander sichtbar.
 */
export function mengeZusammenfassen(vorhanden: string, dazu: string): string {
  const a = (vorhanden ?? '').trim()
  const b = (dazu ?? '').trim()
  if (!a) return b
  if (!b) return a

  const links = parseMenge(a)
  const rechts = parseMenge(b)
  if (links && rechts && links.einheit === rechts.einheit) {
    return formatMenge({ zahl: links.zahl + rechts.zahl, einheit: links.einheit })
  }
  return `${a} + ${b}`
}
