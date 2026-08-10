export type ServiceId = 'nextcloud' | 'donnerskat' | 'kofferpacken'

export interface Service {
  id: ServiceId
  name: string
  tagline: string
  description: string
  // Unter / liegt diese Startseite; /index.php ist Nextclouds Einstieg und
  // leitet wie bisher auf Login bzw. Dashboard weiter.
  href: string
  // Wird per HEAD angepingt, um den Status-Punkt zu setzen
  ping: string
}

export const services: Service[] = [
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    tagline: 'Deine Cloud',
    description: 'Dateien, Fotos, Kalender und Kontakte – alles auf eigener Hardware.',
    href: '/index.php',
    ping: '/status.php',
  },
  {
    id: 'donnerskat',
    name: 'Donnerskat',
    tagline: 'Skat-Turnier',
    description: 'Runden eintragen, Ergebnisse und Statistiken über alle Abende hinweg.',
    href: '/skat/',
    ping: '/skat/',
  },
  {
    id: 'kofferpacken',
    name: 'Kofferpacken',
    tagline: 'Packliste',
    description: 'Nie wieder das Ladekabel vergessen – Packlisten für jede Reise.',
    href: '/koffer/',
    ping: '/koffer/',
  },
]

// Wechselt täglich, damit die Seite nicht jeden Tag gleich aussieht
export const taglines = [
  'Läuft auf eigener Hardware, nicht in irgendeiner Cloud.',
  'Kein Tracking, keine Werbung, keine Cookie-Banner.',
  'Selbst gehostet, selbst gebaut, selbst kaputt gemacht.',
  'Deine Daten bleiben da, wo der Strom bezahlt wird.',
  'Uptime ist ein Hobby.',
  'Wenn es nicht geht, liegt es am DNS.',
  'Backups laufen. Wahrscheinlich.',
]

export function taglineOfTheDay(now = new Date()): string {
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  )
  return taglines[dayOfYear % taglines.length] ?? 'Selbst gehostet.'
}
