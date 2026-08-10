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
  disk: { totalBytes: 54 * GIB, usedBytes: 49 * GIB, freeBytes: 2 * GIB },
  containers: {
    running: 2,
    total: 3,
    list: [
      { name: 'homepage', image: 'homepage-homepage', state: 'running', status: 'Up 2 minutes' },
      {
        name: 'nextcloud_app_1',
        image: 'nextcloud:fpm-alpine',
        state: 'running',
        status: 'Up 2 days',
      },
      { name: 'testcontainer', image: 'busybox', state: 'exited', status: 'Exited (0) 1 day ago' },
    ],
  },
  dockerError: null,
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
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(systemPayload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )

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
    const disk = wrapper.findAll('.meter').find((meter) => meter.text().includes('Speicherplatz'))
    expect(disk?.text()).toContain('91 %')
    expect(disk?.classes()).toContain('crit')

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
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...systemPayload,
              containers: null,
              dockerError: 'Docker-API antwortete mit 403',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )

    const wrapper = await mountDashboard()
    await flushPromises()

    expect(wrapper.text()).toContain('2 Tage, 17 Std')
    expect(wrapper.text()).toContain('Docker-API antwortete mit 403')

    wrapper.unmount()
  })
})
