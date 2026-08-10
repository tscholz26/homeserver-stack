import { describe, it, expect, vi, afterEach } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'

const GIB = 1024 ** 3

const systemPayload = {
  generatedAt: '2026-08-10T20:30:00.000Z',
  host: {
    hostname: 'ubuntuserv',
    kernel: '6.8.0-137-generic',
    os: 'Ubuntu 24.04.4 LTS',
    uptimeSeconds: 237220,
  },
  cpu: {
    model: 'Intel Core i3-7100',
    cores: 4,
    load: [1.5, 1.2, 0.9],
    usagePercent: 42,
    tempC: 35,
  },
  memory: {
    totalBytes: 16 * GIB,
    availableBytes: 11 * GIB,
    usedBytes: 5 * GIB,
    swapTotalBytes: 4 * GIB,
    swapUsedBytes: 0,
  },
  disks: {
    system: { totalBytes: 54 * GIB, usedBytes: 49 * GIB, freeBytes: 2 * GIB },
    data: { totalBytes: 916 * GIB, usedBytes: 205 * GIB, freeBytes: 666 * GIB },
  },
  power: { watts: 12.4, zone: 'package-0' },
  containers: {
    running: 2,
    total: 3,
    list: [
      {
        name: 'homepage',
        image: 'homepage-homepage',
        state: 'running',
        status: 'Up 2 minutes',
        restarts: 0,
        health: null,
        memoryBytes: 40 * 1024 ** 2,
        cpuPercent: 0.4,
      },
      {
        name: 'nextcloud_app_1',
        image: 'nextcloud:fpm-alpine',
        state: 'running',
        status: 'Up 2 days',
        restarts: 3,
        health: 'healthy',
        memoryBytes: 512 * 1024 ** 2,
        cpuPercent: 1.5,
      },
      {
        name: 'testcontainer',
        image: 'busybox',
        state: 'exited',
        status: 'Exited (0) 1 day ago',
        restarts: 0,
        health: null,
        memoryBytes: null,
        cpuPercent: null,
      },
    ],
  },
  dockerError: null,
}

const uptimePayload = {
  recordedSince: new Date(Date.now() - 3 * 3600_000).toISOString(),
  windowHours: 24,
  sampleCount: 180,
  intervalSeconds: 60,
  services: [
    { id: 'nextcloud', states: ['up', 'up', 'none'], availability: 100 },
    { id: 'donnerskat', states: ['up', 'down', 'none'], availability: 98.3 },
    { id: 'kofferpacken', states: ['partial', 'up', 'none'], availability: 99.4 },
  ],
}

function stubApi(system: unknown = systemPayload, uptime: unknown = uptimePayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const body = String(input).includes('uptime') ? uptime : system
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

async function mountDashboard() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/dashboard', component: DashboardView },
    ],
  })
  router.push('/dashboard')
  await router.isReady()
  return mount(DashboardView, { global: { plugins: [router] } })
}

afterEach(() => vi.unstubAllGlobals())

describe('DashboardView', () => {
  it('zeigt Uptime, CPU, Speicher und Container', async () => {
    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    expect(wrapper.text()).toContain('ubuntuserv')
    expect(wrapper.text()).toContain('2 Tage, 17 Std')
    expect(wrapper.text()).toContain('42 %')
    expect(wrapper.text()).toContain('35 °C')
    expect(wrapper.text()).toContain('5,0 / 16,0 GB')
    expect(wrapper.text()).toContain('2 von 3 laufen')
    expect(wrapper.text()).toContain('nextcloud_app_1')

    // 49 von 54 GB sind 91 % – das muss als kritisch markiert sein
    const disk = wrapper.findAll('.meter').find((meter) => meter.text().includes('Systemplatte'))
    expect(disk?.text()).toContain('91 %')
    expect(disk?.classes()).toContain('crit')

    wrapper.unmount()
  })

  it('zeigt die Datenplatte getrennt von der Systemplatte', async () => {
    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    const data = wrapper.findAll('.meter').find((meter) => meter.text().includes('Datenplatte'))
    expect(data?.text()).toContain('205 / 916 GB')
    expect(data?.text()).toContain('22 %')
    expect(data?.classes()).toContain('ok')

    wrapper.unmount()
  })

  it('nennt beim Stromverbrauch dazu, dass nur das CPU-Paket gemessen wird', async () => {
    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    const power = wrapper.findAll('.meter').find((meter) => meter.text().includes('Stromverbrauch'))
    expect(power?.text()).toContain('12,4 W')
    expect(power?.text()).toContain('CPU-Paket')

    wrapper.unmount()
  })

  it('zeigt RAM, CPU und Neustarts pro Container', async () => {
    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    const rows = wrapper.findAll('.containers li')
    const nextcloud = rows.find((row) => row.text().includes('nextcloud_app_1'))
    expect(nextcloud?.text()).toContain('512 MB')
    expect(nextcloud?.text()).toContain('1,5 %')
    expect(nextcloud?.text()).toContain('3× neu gestartet')
    expect(nextcloud?.text()).toContain('gesund')

    wrapper.unmount()
  })

  it('zeigt den Verfügbarkeits-Verlauf mit Prozentwerten', async () => {
    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    const chart = wrapper.find('.uptime')
    expect(chart.text()).toContain('100,0 %')
    expect(chart.text()).toContain('98,3 %')
    expect(chart.text()).toContain('seit 3 Std')
    expect(chart.findAll('.tick.down').length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('sagt es, wenn die Systemwerte nicht erreichbar sind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 502 })),
    )

    const wrapper = await mountDashboard()
    await flushPromises()

    expect(wrapper.text()).toContain('nicht erreichbar')

    wrapper.unmount()
  })

  it('zeigt die übrigen Werte auch ohne Container-Liste', async () => {
    stubApi({ ...systemPayload, containers: null, dockerError: 'Docker-API antwortete mit 403' })
    const wrapper = await mountDashboard()
    await flushPromises()

    expect(wrapper.text()).toContain('2 Tage, 17 Std')
    expect(wrapper.text()).toContain('Docker-API antwortete mit 403')

    wrapper.unmount()
  })
})
