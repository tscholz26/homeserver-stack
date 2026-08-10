import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('begrüßt und verlinkt jeden Dienst', () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('Willkommen!')
    expect(wrapper.findAll('a.tile').map((tile) => tile.attributes('href'))).toEqual([
      '/index.php',
      '/skat/',
      '/koffer/',
    ])
  })
})
