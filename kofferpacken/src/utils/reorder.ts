import type { Category, Item } from '@/composables/usePackStore'

// Gegenstände in Kategorienreihenfolge flach hintereinander – die Anzeige
// richtet sich nach dieser Reihenfolge.
export function flattenItems(categories: Category[], items: Item[]): Item[] {
  return categories.flatMap((c) => items.filter((i) => i.categoryId === c.id))
}

export function reorderCategories(categories: Category[], from: number, to: number): Category[] {
  const next = [...categories]
  if (from < 0 || to < 0 || from >= next.length || to >= next.length || from === to) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

/**
 * Verschiebt einen Gegenstand an Position `toIndex` innerhalb von
 * `toCategoryId` – auch dann, wenn er vorher in einer anderen Kategorie lag.
 */
export function reorderItems(
  categories: Category[],
  items: Item[],
  itemId: string,
  toCategoryId: string,
  toIndex: number,
): Item[] {
  const item = items.find((i) => i.id === itemId)
  if (!item || !categories.some((c) => c.id === toCategoryId)) return items

  const rest = items.filter((i) => i.id !== itemId)
  const target = rest.filter((i) => i.categoryId === toCategoryId)
  const untouched = rest.filter((i) => i.categoryId !== toCategoryId)

  target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, {
    ...item,
    categoryId: toCategoryId,
  })
  return flattenItems(categories, [...untouched, ...target])
}
