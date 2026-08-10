import { computed, onUnmounted, ref } from 'vue'
import { services, type ServiceId } from '@/services'

export type Status = 'checking' | 'online' | 'offline'

const REFRESH_MS = 60 * 1000

/**
 * Pingt jeden Dienst per HEAD an. Alles unter 500 gilt als „läuft“ – ein 401
 * von Nextcloud heißt ja nur, dass niemand angemeldet ist. Erst ein 502 vom
 * Proxy (Container aus) oder ein Netzwerkfehler ist ein echtes Problem.
 */
export function useStatus() {
  const statuses = ref<Record<ServiceId, Status>>({
    nextcloud: 'checking',
    donnerskat: 'checking',
    kofferpacken: 'checking',
  })

  async function check() {
    await Promise.all(
      services.map(async (service) => {
        try {
          const response = await fetch(service.ping, { method: 'HEAD', cache: 'no-store' })
          statuses.value[service.id] = response.status < 500 ? 'online' : 'offline'
        } catch {
          statuses.value[service.id] = 'offline'
        }
      }),
    )
  }

  check()
  const timer = setInterval(check, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  const onlineCount = computed(
    () => Object.values(statuses.value).filter((status) => status === 'online').length,
  )
  const allOnline = computed(() => onlineCount.value === services.length)

  return { statuses, onlineCount, allOnline }
}
