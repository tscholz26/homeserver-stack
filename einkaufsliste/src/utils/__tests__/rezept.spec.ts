import { describe, expect, it } from 'vitest'
import { planeRezept, type ListenArtikel } from '@/utils/rezept'
import type { CatalogEntry } from '@/utils/matching'

const katalog: CatalogEntry[] = [
  { name: 'Cherrytomaten', aliases: ['Kirschtomaten'], category_id: 'obst_gemuese' },
  { name: 'Parmesan', aliases: [], category_id: 'milch_kuehlwaren' },
]

function artikel(teil: Partial<ListenArtikel>): ListenArtikel {
  return {
    id: 'x',
    name: 'Cherrytomaten',
    quantity: '250 g',
    matchedName: 'Cherrytomaten',
    done: false,
    ...teil,
  }
}

describe('planeRezept', () => {
  it('holt Kategorie und Herkunft aus dem Katalog', () => {
    const [zeile] = planeRezept([{ name: 'Parmesan', quantity: '50 g' }], [], katalog)
    expect(zeile?.categoryId).toBe('milch_kuehlwaren')
    expect(zeile?.matchedName).toBe('Parmesan')
    expect(zeile?.vorhandenId).toBeNull()
  })

  it('erkennt denselben Artikel unter anderem Namen', () => {
    // Auf der Liste stehen „Kirschtomaten“, das Rezept will „Cherrytomaten“
    const liste = [artikel({ id: 'a1', name: 'Kirschtomaten' })]
    const [zeile] = planeRezept([{ name: 'Cherrytomaten', quantity: '200 g' }], liste, katalog)

    expect(zeile?.vorhandenId).toBe('a1')
    expect(zeile?.zusammen).toBe('450 g')
  })

  it('stellt unvereinbare Mengen nebeneinander', () => {
    const liste = [artikel({ id: 'a1', quantity: '1 Packung' })]
    const [zeile] = planeRezept([{ name: 'Cherrytomaten', quantity: '200 g' }], liste, katalog)

    expect(zeile?.zusammen).toBe('1 Packung + 200 g')
  })

  it('lässt Abgehaktes in Ruhe', () => {
    const liste = [artikel({ id: 'a1', done: true })]
    const [zeile] = planeRezept([{ name: 'Cherrytomaten', quantity: '200 g' }], liste, katalog)

    expect(zeile?.vorhandenId).toBeNull()
    expect(zeile?.zusammen).toBe('200 g')
  })

  it('vergleicht Unbekanntes über den geschriebenen Namen', () => {
    const liste = [artikel({ id: 'a1', name: 'Blumenerde', matchedName: '', quantity: '1 Sack' })]
    const [zeile] = planeRezept([{ name: 'blumenerde', quantity: '2 Sack' }], liste, katalog)

    expect(zeile?.vorhandenId).toBe('a1')
    expect(zeile?.categoryId).toBe('sonstiges')
  })
})
