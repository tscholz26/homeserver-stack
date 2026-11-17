import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KategorienWahl from '@/components/KategorienWahl.vue'

const gruppen = [
  { id: 'pasta', emoji: '🍝', label: 'Nudeln & Pasta' },
  { id: 'guenstig', emoji: '💶', label: 'Sehr günstig' },
  { id: 'fleisch', emoji: '🥩', label: 'Mit Fleisch' },
]

function wahl(modelValue: string[], neu: string | null = null) {
  const w = mount(KategorienWahl, {
    props: {
      gruppen,
      modelValue,
      anlegen: async () => neu,
      'onUpdate:modelValue': (v: string[]) => w.setProps({ modelValue: v }),
    },
  })
  return w
}

describe('KategorienWahl', () => {
  it('nimmt eine weitere Kategorie dazu', async () => {
    const w = wahl(['pasta'])
    await w.find('select').setValue('guenstig')
    expect(w.props('modelValue')).toEqual(['pasta', 'guenstig'])
    // Was schon gewählt ist, steht nicht noch einmal zur Auswahl
    const optionen = w.findAll('option').map((o) => o.attributes('value'))
    expect(optionen).not.toContain('pasta')
    expect(optionen).not.toContain('guenstig')
  })

  it('nimmt eine Kategorie wieder heraus, aber nie die letzte', async () => {
    const w = wahl(['pasta', 'guenstig'])
    await w.find('.raus').trigger('click')
    expect(w.props('modelValue')).toEqual(['guenstig'])
    expect(w.find('.raus').exists()).toBe(false)
  })

  it('legt eine neue Kategorie an und wählt sie gleich', async () => {
    const w = wahl(['pasta'], 'neu-id')
    await w.find('select').setValue('__neu__')
    await new Promise((r) => setTimeout(r))
    expect(w.props('modelValue')).toEqual(['pasta', 'neu-id'])
  })

  it('lässt bei abgebrochenem Anlegen alles, wie es war', async () => {
    const w = wahl(['pasta'], null)
    await w.find('select').setValue('__neu__')
    await new Promise((r) => setTimeout(r))
    expect(w.props('modelValue')).toEqual(['pasta'])
  })
})
