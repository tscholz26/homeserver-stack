import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'
import { STORAGE_KEY } from '../composables/useTournamentStore'

describe('App', () => {
  it('renders menu and entry page', async () => {
    localStorage.removeItem(STORAGE_KEY)
    router.push('/eintragung')
    await router.isReady()
    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('Eintragung')
    expect(wrapper.text()).toContain('Spielerverwaltung')
    expect(wrapper.text()).toContain('Uebersicht')
  })
})
