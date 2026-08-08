import { createId, type Category, type Item } from '@/composables/usePackStore'

export interface Catalog {
  categories: Category[]
  items: Item[]
}

// Format: Kategorien in eckigen Klammern, Gegenstände in den Zeilen darunter.
// Eingerückt wird nicht – der Parser trimmt ohnehin jede Zeile, Einrückung wäre
// also reine Zierde, die beim Tippen nur stört.
export function serializeCatalog(categories: Category[], items: Item[]): string {
  const lines: string[] = []
  for (const category of categories) {
    lines.push(`[${category.name}]`)
    for (const item of items.filter((i) => i.categoryId === category.id)) {
      lines.push(item.name)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

/**
 * Liest das Textformat zurück in einen Katalog. Bestehende IDs werden über die
 * Namen wiederverwendet, damit gesetzte Haken erhalten bleiben – auch dann,
 * wenn ein Gegenstand in eine andere Kategorie verschoben wurde.
 */
export function parseCatalog(text: string, existing: Catalog): Catalog {
  const categories: Category[] = []
  const items: Item[] = []

  const usedCategoryIds = new Set<string>()
  const usedItemIds = new Set<string>()

  const existingCategories = new Map(existing.categories.map((c) => [c.name.toLowerCase(), c]))
  const existingItems = new Map<string, Item[]>()
  for (const item of existing.items) {
    const key = item.name.toLowerCase()
    const list = existingItems.get(key)
    if (list) list.push(item)
    else existingItems.set(key, [item])
  }

  let current: Category | null = null
  const seenCategoryNames = new Set<string>()
  const seenItemNames = new Set<string>()

  const lines = text.split('\n')
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n]!.trim()
    if (!raw) continue

    const heading = raw.match(/^\[(.*)\]$/)
    if (heading) {
      const name = heading[1]!.trim()
      if (!name) throw new Error(`Zeile ${n + 1}: Die Kategorie hat keinen Namen.`)
      if (seenCategoryNames.has(name.toLowerCase())) {
        throw new Error(`Zeile ${n + 1}: Die Kategorie „${name}“ kommt mehrfach vor.`)
      }
      seenCategoryNames.add(name.toLowerCase())
      seenItemNames.clear()

      const known = existingCategories.get(name.toLowerCase())
      const id = known && !usedCategoryIds.has(known.id) ? known.id : createId()
      usedCategoryIds.add(id)
      current = { id, name }
      categories.push(current)
      continue
    }

    if (!current) {
      throw new Error(
        `Zeile ${n + 1}: „${raw}“ steht vor der ersten Kategorie. Kategorien sehen so aus: [Name]`,
      )
    }
    if (seenItemNames.has(raw.toLowerCase())) {
      throw new Error(`Zeile ${n + 1}: „${raw}“ steht zweimal in derselben Kategorie.`)
    }
    seenItemNames.add(raw.toLowerCase())

    // Erst einen gleichnamigen Gegenstand aus derselben Kategorie nehmen, sonst
    // irgendeinen gleichnamigen – so überlebt auch ein Umzug die Bearbeitung.
    const candidates = existingItems.get(raw.toLowerCase()) ?? []
    const sameCategory = candidates.find(
      (c) => c.categoryId === current!.id && !usedItemIds.has(c.id),
    )
    const anyOther = candidates.find((c) => !usedItemIds.has(c.id))
    const id = (sameCategory ?? anyOther)?.id ?? createId()
    usedItemIds.add(id)
    items.push({ id, categoryId: current.id, name: raw })
  }

  if (categories.length === 0) {
    throw new Error('Die Liste ist leer – mindestens eine Kategorie wird gebraucht.')
  }
  return { categories, items }
}
