import { describe, expect, it } from 'vitest'
import { zurueckAnAltenPlatz } from '@/utils/sortable'

/** Liste A, B, C, D – und dann so umgestellt, wie SortableJS es beim Ziehen tut. */
function liste() {
  const ul = document.createElement('ul')
  for (const t of ['A', 'B', 'C', 'D']) {
    const li = document.createElement('li')
    li.textContent = t
    ul.append(li)
  }
  return ul
}

function ziehe(ul: HTMLElement, von: number, nach: number) {
  const item = ul.children[von] as HTMLElement
  ul.removeChild(item)
  ul.insertBefore(item, ul.children[nach] ?? null)
  return { from: ul, item, oldIndex: von, newIndex: nach }
}

const text = (ul: HTMLElement) => [...ul.children].map((li) => li.textContent).join('')

describe('zurueckAnAltenPlatz', () => {
  for (const [von, nach] of [
    [0, 1],
    [1, 0],
    [0, 3],
    [3, 0],
    [2, 1],
    [1, 2],
  ] as const) {
    it(`stellt ${von + 1}→${nach + 1} wieder her`, () => {
      const ul = liste()
      const evt = ziehe(ul, von, nach)
      zurueckAnAltenPlatz(evt)
      expect(text(ul)).toBe('ABCD')
    })
  }

  it('lässt einen Knoten in Ruhe, der woanders hängt', () => {
    const ul = liste()
    const fremd = document.createElement('li')
    zurueckAnAltenPlatz({ from: ul, item: fremd, oldIndex: 0 })
    expect(text(ul)).toBe('ABCD')
  })
})
