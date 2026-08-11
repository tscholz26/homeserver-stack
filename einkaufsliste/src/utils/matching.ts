/**
 * Zuordnung eines eingetippten Artikelnamens zu einem Katalogeintrag.
 *
 * Läuft komplett im Browser: der Katalog kommt einmal mit dem State mit, beim
 * Hinzufügen eines Artikels wird nichts mehr nachgeladen.
 */

export interface CatalogEntry {
  name: string
  aliases: string[]
  category_id: string
}

/** Muss zur gleichnamigen Funktion in server.js passen. */
export function normalize(text: string): string {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Alle Schreibweisen eines Eintrags: Name und Aliase. */
function terms(entry: CatalogEntry): string[] {
  return [entry.name, ...(entry.aliases ?? [])].map(normalize).filter(Boolean)
}

/**
 * Levenshtein-Distanz, abgebrochen sobald sie `max` übersteigt – für die
 * 179 Katalogeinträge × Aliase reicht das locker und spart die halbe Matrix.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr: number[] = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost)
      rowMin = Math.min(rowMin, curr[j]!)
    }
    if (rowMin > max) return max + 1
    prev = curr.slice()
  }

  return prev[b.length]!
}

/**
 * Steckt `needle` am Anfang eines Wortes in `haystack`?
 *
 * Der Wortanfang ist wichtig, weil deutsche Komposita sonst reihenweise falsch
 * landen: „Fahrradschlauch“ enthält „lauch“, meint aber kein Gemüse. „Bio
 * Zitronen“ enthält „Zitronen“ dagegen als eigenes Wort.
 */
function containsAtWordStart(haystack: string, needle: string): boolean {
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) return false
    if (at === 0 || /[^\p{L}\p{N}]/u.test(haystack[at - 1]!)) return true
    from = at + 1
  }
}

// Bei kurzen Wörtern trifft eine Distanz von 2 fast alles: „Salami“ läge sonst
// bei „Halumi“ und damit im Kühlregal. Deshalb erst ab dieser Länge überhaupt
// raten, und zwei Abweichungen erst bei richtig langen Wörtern.
const MIN_LENGTH_FOR_DISTANCE = 5
const LENGTH_FOR_TWO_EDITS = 8

function maxDistanceFor(needle: string): number {
  return needle.length >= LENGTH_FOR_TWO_EDITS ? 2 : 1
}

/**
 * Sucht den passenden Katalogeintrag, in dieser Reihenfolge:
 * 1. exakter Treffer auf Name oder Alias
 * 2. Teilstring in beide Richtungen, jeweils am Wortanfang; von mehreren
 *    Treffern gewinnt der mit der ähnlichsten Länge, also „gehackte Tomaten“
 *    vor „Tomaten“
 * 3. Levenshtein-Distanz als Fallback: eine Abweichung, ab acht Zeichen zwei
 *    (kleinste Distanz gewinnt)
 *
 * Ohne Treffer `null` – der Artikel landet dann in „Sonstiges“ und bekommt in
 * der Verwaltung einen Eintrag zum Nachpflegen.
 */
export function findCatalogMatch(input: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const needle = normalize(input)
  if (!needle) return null

  let substringHit: CatalogEntry | null = null
  let substringGap = Infinity
  let distanceHit: CatalogEntry | null = null
  const maxDistance = maxDistanceFor(needle)
  let bestDistance = maxDistance + 1

  for (const entry of catalog) {
    for (const term of terms(entry)) {
      if (term === needle) return entry

      if (containsAtWordStart(needle, term) || containsAtWordStart(term, needle)) {
        const gap = Math.abs(term.length - needle.length)
        if (gap < substringGap) {
          substringHit = entry
          substringGap = gap
        }
      }
    }
  }
  if (substringHit) return substringHit

  if (needle.length < MIN_LENGTH_FOR_DISTANCE) return null

  for (const entry of catalog) {
    for (const term of terms(entry)) {
      if (term.length < MIN_LENGTH_FOR_DISTANCE) continue
      const distance = levenshtein(needle, term, maxDistance)
      if (distance < bestDistance) {
        bestDistance = distance
        distanceHit = entry
      }
    }
  }

  return bestDistance <= maxDistance ? distanceHit : null
}

/**
 * Vorschläge für „welcher Artikel ist das denn?“ in der Verwaltung.
 *
 * Bewusst lockerer als {@link findCatalogMatch}: hier zählt jede Ähnlichkeit,
 * auch mitten im Wort – „Hafermilch“ soll Vollmilch und Kokosmilch vorschlagen,
 * ohne dass die Zuordnung beim Eintippen automatisch passieren würde.
 */
export function suggestCatalogEntries(
  input: string,
  catalog: CatalogEntry[],
  limit = 4,
): CatalogEntry[] {
  const needle = normalize(input)
  if (needle.length < 3) return []

  const bewertet: { entry: CatalogEntry; score: number }[] = []
  // Ein eigener Eintrag überdeckt den gleichnamigen aus dem Seed
  const gesehen = new Set<string>()

  for (const entry of catalog) {
    const key = normalize(entry.name)
    if (gesehen.has(key)) continue
    gesehen.add(key)

    let best = Infinity
    for (const term of terms(entry)) {
      // Enthalten ist der stärkere Hinweis. Sonst zählt die Distanz, aber nur
      // bis zu einem Drittel des kürzeren Wortes – sonst gilt bei langen Namen
      // irgendwann alles als ähnlich.
      if (needle.includes(term) || term.includes(needle)) {
        best = Math.min(best, 0.2 - Math.min(term.length, needle.length) / 100)
        continue
      }
      const grenze = Math.max(2, Math.round(Math.min(needle.length, term.length) / 3))
      const distance = levenshtein(needle, term, grenze)
      if (distance <= grenze) {
        best = Math.min(best, distance / Math.max(needle.length, term.length))
      }
    }
    if (best <= 0.5) bewertet.push({ entry, score: best })
  }

  return bewertet
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.entry)
}
