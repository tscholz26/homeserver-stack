import { describe, it, expect, vi, afterEach } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'

const nowSeconds = Math.floor(Date.now() / 1000)

const weatherPayload = {
  name: 'Leipzig',
  weather: [{ description: 'leichter regen', icon: '10d' }],
  main: { temp: 12.4, feels_like: 11.2, humidity: 80 },
  wind: { speed: 3 },
  sys: { sunrise: nowSeconds - 3600, sunset: nowSeconds + 3600 },
}

// Wetter-API und die Status-Pings der Dienste laufen beide über fetch
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) =>
      String(input) === '/home/weather'
        ? new Response(JSON.stringify(weatherPayload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(null, { status: 200 }),
    ),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('verlinkt jeden Dienst', async () => {
    stubFetch()
    const wrapper = mount(App)
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
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('12°C')
    expect(wrapper.text()).toContain('Leichter regen')
    expect(wrapper.text()).toContain('Alles läuft')

    // Die Wetterkarte führt bewusst nach draußen aufs Regenradar
    expect(wrapper.find('a.weather').attributes('href')).toBe(
      'https://www.wetteronline.de/regenradar/leipzig',
    )

    wrapper.unmount()
  })

  it('meldet einen Dienst als weg, wenn der Proxy 502 liefert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        String(input) === '/skat/'
          ? new Response(null, { status: 502 })
          : new Response(null, { status: 200 }),
      ),
    )

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('2 von 3 online')
    expect(wrapper.text()).toContain('weg')

    wrapper.unmount()
  })
})
