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
    description: 'Dateien, Fotos, Kalender und Kontakte.',
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
    description: 'Für jede Reise eine eigene Liste zum Abhaken.',
    href: '/koffer/',
    ping: '/koffer/',
  },
]

/** Noch nicht gebaut: eigene Kacheln, die auf eine Platzhalterseite führen. */
export type PlannedId = 'einkaufsliste' | 'verschleiss'

export interface PlannedService {
  id: PlannedId
  name: string
  tagline: string
  description: string
}

export const planned: PlannedService[] = [
  {
    id: 'einkaufsliste',
    name: 'Einkaufsliste',
    tagline: 'Gemeinsam',
    description: 'Eine Liste für alle, auf jedem Gerät gleich – zum Abhaken im Laden.',
  },
  {
    id: 'verschleiss',
    name: 'Verschleiß',
    tagline: 'Rennrad',
    description: 'Welches Teil wie viele Kilometer hat, mit Statistiken aus den Strava-Fahrten.',
  },
]
