import { describe, expect, it } from 'vitest'
import { nachZuletzt, wieLangeHer } from '@/utils/zuletzt'

describe('nachZuletzt', () => {
  const rezepte = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

  it('stellt lange nicht Gewähltes nach oben', () => {
    const zuletzt = {
      a: '2026-11-10T10:00:00Z',
      b: '2026-09-01T10:00:00Z',
      c: '2026-10-01T10:00:00Z',
    }
    expect(nachZuletzt(rezepte, zuletzt).map((r) => r.id)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('lässt ohne Verlauf die Reihenfolge des Rezeptbuchs stehen', () => {
    expect(nachZuletzt(rezepte, {}).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('verändert die übergebene Liste nicht', () => {
    const kopie = [...rezepte]
    nachZuletzt(rezepte, { a: '2026-11-10T10:00:00Z' })
    expect(rezepte).toEqual(kopie)
  })
})

describe('wieLangeHer', () => {
  const jetzt = new Date(2026, 10, 16, 9, 0)

  it('zählt Kalendertage', () => {
    expect(wieLangeHer(new Date(2026, 10, 16, 1, 0).toISOString(), jetzt)).toBe('heute')
    expect(wieLangeHer(new Date(2026, 10, 15, 22, 0).toISOString(), jetzt)).toBe('gestern')
    expect(wieLangeHer(new Date(2026, 10, 11, 12, 0).toISOString(), jetzt)).toBe('vor 5 Tagen')
  })

  it('wird mit dem Abstand gröber', () => {
    expect(wieLangeHer(new Date(2026, 9, 26).toISOString(), jetzt)).toBe('vor 3 Wochen')
    expect(wieLangeHer(new Date(2026, 6, 1).toISOString(), jetzt)).toBe('vor 4 Monaten')
    expect(wieLangeHer(new Date(2023, 10, 1).toISOString(), jetzt)).toBe('vor 3 Jahren')
  })

  it('gibt bei Unsinn nichts aus', () => {
    expect(wieLangeHer('kein Datum', jetzt)).toBe('')
  })
})
