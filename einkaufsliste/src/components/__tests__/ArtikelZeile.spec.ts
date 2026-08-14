import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtikelZeile from '@/components/ArtikelZeile.vue'
import type { Item } from '@/composables/useEinkaufStore'

function artikel(done = false, quantity = ''): Item {
  return {
    id: 'a1',
    name: 'Duschgel',
    quantity,
    categoryId: 'drogerie',
    matched: true,
    matchedName: 'Duschgel',
    done,
    addedAt: '2026-08-11T10:00:00.000Z',
  }
}

function zeile(done = false, quantity = '') {
  return mount(ArtikelZeile, {
    props: {
      item: artikel(done, quantity),
      categories: [],
      catalog: [],
      catalogNames: [],
      sortierbar: true,
    },
  })
}

/** Der Stepper meldet nur; die neue Menge kommt als Prop zurück, wie im Store. */
async function tippen(w: ReturnType<typeof zeile>, richtung: 'Mehr' | 'Weniger') {
  const knopf = w.findAll('.stufe').find((k) => k.attributes('aria-label')?.startsWith(richtung))
  await knopf!.trigger('click')
  const gemeldet = w.emitted('menge') ?? []
  const neu = (gemeldet[gemeldet.length - 1] as [string])[0]
  await w.setProps({ item: { ...w.props('item'), quantity: neu } })
  return neu
}

describe('ArtikelZeile', () => {
  it('meldet den umgekehrten Zustand, statt einen eigenen zu führen', async () => {
    const w = zeile(false)
    await w.find('.haken').trigger('click')
    expect(w.emitted('check')).toEqual([[true]])

    // Der Haken gehört dem Zustand von oben: solange der noch nicht nachgezogen
    // hat, bleibt die Zeile offen. Genau hier lief die alte Checkbox im DOM
    // davon und blieb grün, obwohl der Artikel wieder offen war.
    expect(w.find('.box').classes()).not.toContain('an')
    expect(w.find('.haken').attributes('aria-checked')).toBe('false')

    w.unmount()
  })

  it('zeigt genau das, was der Artikel sagt', async () => {
    const w = zeile(true)
    expect(w.find('.box').classes()).toContain('an')
    expect(w.classes()).toContain('erledigt')

    await w.setProps({ item: artikel(false) })
    expect(w.find('.box').classes()).not.toContain('an')
    expect(w.classes()).not.toContain('erledigt')

    await w.find('.haken').trigger('click')
    const gemeldet = w.emitted('check') ?? []
    expect(gemeldet[gemeldet.length - 1]).toEqual([true])

    w.unmount()
  })
})

describe('Mengen-Stepper', () => {
  it('macht aus keiner Angabe mit einem Tipp eine Zwei', async () => {
    const w = zeile()
    // Ohne Menge gibt es nur das +, kein − ins Nichts
    expect(w.findAll('.stufe')).toHaveLength(1)
    expect(await tippen(w, 'Mehr')).toBe('2')

    // Jetzt lässt sich auch wieder zurück
    expect(w.findAll('.stufe')).toHaveLength(2)
    expect(await tippen(w, 'Weniger')).toBe('')
    w.unmount()
  })

  it('bleibt bei Gewichten bei der Portion, mit der es losging', async () => {
    const w = zeile(false, '250 g')
    expect(await tippen(w, 'Mehr')).toBe('500 g')
    expect(await tippen(w, 'Mehr')).toBe('750 g')
    // Zurück in denselben Schritten, nicht halbiert
    expect(await tippen(w, 'Weniger')).toBe('500 g')
    w.unmount()
  })

  it('lässt Unrechenbares ohne Knöpfe', async () => {
    const w = zeile(false, 'nach Geschmack')
    expect(w.findAll('.stufe')).toHaveLength(0)
    expect(w.find('.menge').text()).toBe('nach Geschmack')
    w.unmount()
  })

  it('hält sich beim Einkaufen raus', async () => {
    // Abgehakt wird nichts mehr geplant – da ist der Stepper nur im Weg
    const w = zeile(true, '2 Packungen')
    expect(w.findAll('.stufe')).toHaveLength(0)
    w.unmount()
  })
})
