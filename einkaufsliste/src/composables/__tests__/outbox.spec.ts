import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Der Fall, für den es die Outbox gibt: hinten im Laden ist kein Netz, der
 * Haken wird trotzdem gesetzt und darf beim Reconnect nicht verschwinden.
 */

const LIST = 'liste-1'
const ITEM = 'artikel-1'

function serverStand(done: boolean) {
  return {
    lists: [
      {
        id: LIST,
        name: 'Lebensmittel',
        type: 'kategorisiert',
        storeProfileId: null,
        items: [
          {
            id: ITEM,
            name: 'Butter',
            quantity: '',
            categoryId: 'milch_kuehlwaren',
            matched: true,
            matchedName: 'Butter',
            done,
            addedAt: '2026-08-11T10:00:00.000Z',
          },
        ],
      },
    ],
    categories: [{ id: 'milch_kuehlwaren', emoji: '🥛', label: 'Milch' }],
    defaultCategoryOrder: ['milch_kuehlwaren'],
    catalog: [],
    unmatched: [],
    storeProfiles: [],
  }
}

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Der Store ist ein Singleton und baut beim Import eine SSE-Verbindung auf –
// jsdom kennt EventSource nicht.
class FakeEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  close() {}
}
vi.stubGlobal('EventSource', FakeEventSource)

let netz = true
const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const url = String(input)
  if (url.endsWith('/api/state')) return antwort(serverStand(false))
  if (!netz) throw new TypeError('Failed to fetch')
  if (url.includes('/check')) {
    const { done } = JSON.parse(String(init?.body))
    return antwort(serverStand(done))
  }
  return antwort(serverStand(false))
})
vi.stubGlobal('fetch', fetchMock)

const { useEinkaufStore } = await import('@/composables/useEinkaufStore')
const store = useEinkaufStore()

function artikel() {
  return store.state.lists[0]!.items[0]!
}

describe('Haken ohne Netz', () => {
  beforeEach(async () => {
    netz = true
    await store.flushOutbox()
    await store.refresh()
  })

  it('setzt den Haken sofort und behält ihn ohne Verbindung', async () => {
    netz = false
    await store.setDone(store.state.lists[0]!, ITEM, true)

    expect(artikel().done).toBe(true)
    expect(store.offeneHaken.value).toBe(1)
  })

  it('überlebt den Serverstand, der vom Haken noch nichts weiß', async () => {
    netz = false
    await store.setDone(store.state.lists[0]!, ITEM, true)

    // Genau das passiert beim Reconnect: der Server schickt seinen Stand
    netz = true
    await store.refresh()

    expect(artikel().done).toBe(true)
    expect(store.offeneHaken.value).toBe(1)
  })

  it('schickt den Haken nach, sobald es wieder geht', async () => {
    netz = false
    await store.setDone(store.state.lists[0]!, ITEM, true)

    netz = true
    await store.flushOutbox()

    expect(store.offeneHaken.value).toBe(0)
    expect(artikel().done).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/lists/${LIST}/items/${ITEM}/check`),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('behält nur den letzten Stand eines Artikels', async () => {
    netz = false
    await store.setDone(store.state.lists[0]!, ITEM, true)
    await store.setDone(store.state.lists[0]!, ITEM, false)

    expect(store.offeneHaken.value).toBe(1)
    expect(artikel().done).toBe(false)
  })

  it('verwirft einen Haken, dessen Artikel es nicht mehr gibt', async () => {
    netz = false
    await store.setDone(store.state.lists[0]!, ITEM, true)

    netz = true
    fetchMock.mockImplementationOnce(async () => antwort({ error: 'weg' }, 404))
    await store.flushOutbox()

    expect(store.offeneHaken.value).toBe(0)
  })
})
