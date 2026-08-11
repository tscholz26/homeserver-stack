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
  power: {
    watts: 36.8,
    cpuWatts: 12.4,
    estimatedTotalWatts: 36.8,
    baselineWatts: 20,
    psuEfficiency: 0.88,
    zones: ['package-0', 'dram'],
  },
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

// Eine Minute Abstand pro Punkt, die letzten 90 Minuten
const metricsPayload = {
  recordedSince: new Date(Date.now() - 90 * 60_000).toISOString(),
  intervalSeconds: 60,
  windowHours: 24,
  points: Array.from({ length: 90 }, (_, index) => ({
    t: Date.now() - (89 - index) * 60_000,
    // Alles außerhalb der letzten 60 Minuten steht auf 0, innerhalb auf 50.
    // Kommt 50 heraus, wurde wirklich nur das Fenster gemittelt.
    cpu: index < 25 ? 0 : 50,
    mem: index < 25 ? 0 : 50,
    watts: 10,
  })),
}

function stubApi(system: unknown = systemPayload, uptime: unknown = uptimePayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input)
      const body = url.includes('uptime')
        ? uptime
        : url.includes('metrics')
          ? metricsPayload
          : system
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

  it('zeigt den geschätzten Gesamtverbrauch und dazu den gemessenen Anteil', async () => {
    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    const power = wrapper.findAll('.meter').find((meter) => meter.text().includes('Stromverbrauch'))
    // Die Schätzung steht groß da, mit Tilde als Hinweis darauf
    expect(power?.text()).toContain('≈ 36,8 W')
    // und der gemessene Teil mit seinen Zonen daneben
    expect(power?.text()).toContain('Gemessen: 12,4 W')
    expect(power?.text()).toContain('package-0 + dram')
    expect(power?.text()).toContain('20 W für Board, Platten und Lüfter')

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

  it('zeigt den Mittelwert der letzten 60 Minuten auf den Karten', async () => {
    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    // Außerhalb des Fensters steht alles auf 0, drin auf 50 – also muss 50 rauskommen
    const cpu = wrapper.findAll('.meter').find((meter) => meter.text().includes('CPU'))
    expect(cpu?.text()).toContain('Ø 60 min')
    expect(cpu?.text()).toContain('50 %')

    // Beim Strom kommt die Grundlast dazu: (10 + 20) / 0,88 = 34,1 W
    const power = wrapper.findAll('.meter').find((meter) => meter.text().includes('Stromverbrauch'))
    expect(power?.text()).toContain('≈ 34,1 W')

    wrapper.unmount()
  })

  it('öffnet den Verlauf, wenn man auf eine Karte klickt', async () => {
    // jsdom kennt showModal nicht in jeder Version
    HTMLDialogElement.prototype.showModal = vi.fn<() => void>(function (this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn<() => void>(function (this: HTMLDialogElement) {
      this.open = false
    })

    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    const cpu = wrapper.findAll('.meter').find((meter) => meter.text().includes('CPU'))
    await cpu?.trigger('click')
    await flushPromises()

    const dialog = wrapper.find('dialog')
    expect(dialog.text()).toContain('CPU-Auslastung')
    expect(dialog.find('polyline').exists()).toBe(true)

    // Der Schnitt gilt für den angezeigten Zeitraum, nicht stur für 60 Minuten:
    // 65 Punkte mit 50 % und 25 mit 0 % ergeben 36 %
    expect(dialog.text()).toMatch(/Ø \d+ min/)
    expect(dialog.text()).toContain('36 %')

    // Die Achse endet knapp über dem Maximum von 50 %, nicht bei 100 %
    const labels = dialog.findAll('.grid text').map((entry) => entry.text())
    expect(labels).toContain('60')
    expect(labels).not.toContain('100')

    wrapper.unmount()
  })

  it('lässt den Verlauf auf die letzten 60 Minuten umstellen', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn<() => void>(function (this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn<() => void>(function (this: HTMLDialogElement) {
      this.open = false
    })

    stubApi()
    const wrapper = await mountDashboard()
    await flushPromises()

    const cpu = wrapper.findAll('.meter').find((card) => card.text().includes('CPU'))
    await cpu?.trigger('click')
    await flushPromises()

    // Von den 90 Punkten liegen 90 im vollen Fenster …
    expect(wrapper.find('dialog').text()).toContain('90 Messpunkte')

    const button = (label: string) =>
      wrapper.findAll('.switch button').find((entry) => entry.text() === label)

    await button('60 min')?.trigger('click')

    // … und nur die aus der letzten Stunde. 60 oder 61, je nachdem ob der Punkt
    // genau auf der Fenstergrenze noch mitzählt – beides ist richtig.
    expect(wrapper.find('dialog').text()).toMatch(/6[01] Messpunkte/)
    expect(wrapper.find('dialog').text()).toContain('letzte 60 min')

    // In der letzten Stunde stehen alle Punkte auf 50 %, also auch der Schnitt
    expect(wrapper.find('dialog').text()).toContain('Ø 60 min')
    expect(wrapper.find('dialog').text()).toContain('50 %')

    // 8 Std umfasst die 90 Minuten des Verlaufs komplett
    await button('8 Std')?.trigger('click')
    expect(wrapper.find('dialog').text()).toContain('letzte 8 Std')
    expect(wrapper.find('dialog').text()).toContain('Ø 8 Std')
    expect(wrapper.find('dialog').text()).toContain('90 Messpunkte')

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
