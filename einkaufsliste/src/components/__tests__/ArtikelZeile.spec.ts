import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtikelZeile from '@/components/ArtikelZeile.vue'
import type { Item } from '@/composables/useEinkaufStore'

function artikel(done = false): Item {
  return {
    id: 'a1',
    name: 'Duschgel',
    quantity: '',
    categoryId: 'drogerie',
    matched: true,
    matchedName: 'Duschgel',
    done,
    addedAt: '2026-08-11T10:00:00.000Z',
  }
}

function zeile(done = false) {
  return mount(ArtikelZeile, {
    props: { item: artikel(done), categories: [], catalog: [], catalogNames: [], sortierbar: true },
  })
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
