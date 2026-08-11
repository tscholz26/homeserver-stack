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

// Wetter-API und die Status-Pings der Dienste laufen beide über fetch
function stubFetch(overrides: Record<string, Response> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input)
      if (overrides[url]) return overrides[url]
      if (url === '/home/weather') {
        return new Response(JSON.stringify(weatherPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
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

afterEach(() => vi.unstubAllGlobals())

describe('HomeView', () => {
  it('verlinkt jeden Dienst', async () => {
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.findAll('a.tile').map((tile) => tile.attributes('href'))).toEqual([
      '/index.php',
      '/skat/',
      '/koffer/',
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

  it('zeigt geplante Dienste als eigene Kacheln zur Platzhalterseite', async () => {
    stubFetch()
    const wrapper = await mountHome()
    await flushPromises()

    const links = wrapper.findAll('a.plan')
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/bald/einkaufsliste',
      '/bald/verschleiss',
    ])
    expect(wrapper.text()).toContain('Einkaufsliste')
    expect(wrapper.text()).toContain('Verschleiß')
    // Sie dürfen nicht als echte Dienste gezählt oder angepingt werden
    expect(wrapper.findAll('a.tile')).toHaveLength(3)
    expect(wrapper.text()).toContain('Alles läuft')

    wrapper.unmount()
  })

  it('meldet einen Dienst als weg, wenn der Proxy 502 liefert', async () => {
    stubFetch({ '/skat/': new Response(null, { status: 502 }) })
    const wrapper = await mountHome()
    await flushPromises()

    expect(wrapper.text()).toContain('2 von 3 online')
    expect(wrapper.text()).toContain('weg')

    wrapper.unmount()
  })
})
