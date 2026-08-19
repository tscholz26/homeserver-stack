import { describe, it, expect, vi, afterEach } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const nowSeconds = Math.floor(Date.now() / 1000)

const weatherPayload = {
  name: 'Leipzig',
  weather: [{ description: 'leichter regen', icon: '10d' }],
  main: { temp: 12.4, feels_like: 11.2, humidity: 80 },
  wind: { speed: 3, deg: 315 },
  sys: { sunrise: nowSeconds - 3600, sunset: nowSeconds + 3600 },
}

const adguardPayload = {
  configured: true,
  canPause: true,
  protectionEnabled: true,
  protectionDisabledUntil: null,
  unit: 'hours',
  queries: 12400,
  blocked: 2847,
  series: Array.from({ length: 24 }, (_, hour) => ({ queries: 400 + hour, blocked: 90 + hour })),
}

// Der Netzschutz-Zustand gilt für den einzelnen Test: ohne ihn meldet der
// Server „nicht eingerichtet“ und die Karte taucht gar nicht erst auf.
let adguard: Record<string, unknown> | null = null

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

// Wetter-API, Netzschutz und die Status-Pings der Dienste laufen alle über fetch
function stubFetch(overrides: Record<string, Response> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (overrides[url]) return overrides[url]
      if (url.includes('api/adguard')) {
        if (init?.method === 'POST') {
          const wanted = JSON.parse(String(init.body))
          adguard = {
            ...adguard,
            protectionEnabled: wanted.enabled === true,
            protectionDisabledUntil: null,
          }
        }
        return json(adguard ?? { configured: false })
      }
      if (url === '/home/weather') return json(weatherPayload)
      return new Response(null, { status: 200 })
    }),
  )
}

// RouterLink in der Status-Karte braucht einen Router
async function mountHome() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/dashboard', component: { template: '<div />' } },
      { path: '/bald/:id?', component: { template: '<div />' } },
    ],
  })
  router.push('/')
  await router.isReady()
  return mount(HomeView, { global: { plugins: [router] } })
}

afterEach(() => {
  adguard = null
  vi.unstubAllGlobals()
})

describe('HomeView', () => {
  it('verlinkt jeden Dienst', async () => {
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.findAll('a.tile').map((tile) => tile.attributes('href'))).toEqual([
      '/index.php',
      '/skat/',
      '/koffer/',
      '/einkauf/',
      '/fahrrad/',
    ])

    wrapper.unmount()
  })

  it('zeigt das Wetter und den Status der Dienste', async () => {
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.text()).toContain('12°C')
    expect(wrapper.text()).toContain('Leichter regen')
    expect(wrapper.text()).toContain('80 % Luftfeuchtigkeit')
    expect(wrapper.text()).toContain('11 km/h aus NW')
    expect(wrapper.text()).toContain('Alles läuft')

    // Die Wetterkarte führt bewusst nach draußen aufs Regenradar
    expect(wrapper.find('a.weather').attributes('href')).toBe(
      'https://www.wetteronline.de/regenradar/leipzig',
    )

    wrapper.unmount()
  })

  it('führt von der Status-Karte aufs Dashboard und von der Uhr zum Kalender', async () => {
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.find('a.status').attributes('href')).toBe('/dashboard')
    expect(wrapper.find('a.clock').attributes('href')).toBe('https://calendar.google.com')

    wrapper.unmount()
  })

  it('zeigt keine Platzhalter-Kacheln, solange nichts geplant ist', async () => {
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.findAll('a.plan')).toHaveLength(0)
    expect(wrapper.findAll('a.tile')).toHaveLength(5)
    expect(wrapper.text()).toContain('Alles läuft')

    wrapper.unmount()
  })

  it('zeigt den Netzschutz nur, wenn AdGuard eingerichtet ist', async () => {
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.find('.guard').exists()).toBe(false)

    wrapper.unmount()
  })

  it('zeigt den geblockten Anteil und pausiert den Schutz auf Knopfdruck', async () => {
    adguard = { ...adguardPayload }
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    // 2.847 von 12.400 sind gerundet 23 Prozent
    expect(wrapper.find('.guard').text()).toContain('23 %')
    expect(wrapper.text()).toContain('2.847 von 12.400 Anfragen')
    expect(wrapper.findAll('.guard .bar')).toHaveLength(24)

    await wrapper.find('.guard button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.guard').text()).toContain('Schutz pausiert')

    wrapper.unmount()
  })

  it('schaltet den pausierten Schutz wieder an', async () => {
    adguard = {
      ...adguardPayload,
      protectionEnabled: false,
      protectionDisabledUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
    }
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.find('.guard').text()).toContain('Schutz pausiert')
    expect(wrapper.find('.guard').text()).toContain('läuft in')

    await wrapper.find('.guard button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.guard').text()).toContain('23 %')

    wrapper.unmount()
  })

  it('blendet den Pausenknopf von außerhalb des Heimnetzes aus', async () => {
    adguard = { ...adguardPayload, canPause: false }
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.find('.guard').text()).toContain('23 %')
    expect(wrapper.find('.guard button').exists()).toBe(false)

    wrapper.unmount()
  })

  it('meldet einen Dienst als weg, wenn der Proxy 502 liefert', async () => {
    stubFetch({ '/skat/': new Response(null, { status: 502 }) })
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.text()).toContain('4 von 5 online')
    expect(wrapper.text()).toContain('weg')

    wrapper.unmount()
  })
})
