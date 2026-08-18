export type ServiceId =
  | 'nextcloud'
  | 'donnerskat'
  | 'kofferpacken'
  | 'einkaufsliste'
  | 'fahrradtracker'

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
  {
    id: 'einkaufsliste',
    name: 'Einkaufsliste',
    tagline: 'Besorgungen',
    description: 'Sortiert nach Supermarkt-Reihenfolge, auf beiden Handys gleichzeitig.',
    href: '/einkauf/',
    ping: '/einkauf/',
  },
  {
    id: 'fahrradtracker',
    name: 'Fahrradtracker',
    tagline: 'Verschleiß',
    description: 'Kilometer der Verschleißteile am Rad, gefüttert aus Wahoo.',
    href: '/fahrrad/',
    ping: '/fahrrad/',
  },
]

/** Noch nicht gebaut: eigene Kacheln, die auf eine Platzhalterseite führen.
 *  Gerade ist nichts geplant – der Verschleißtracker ist gebaut und steht oben
 *  als Fahrradtracker. */
export type PlannedId = never

export interface PlannedService {
  id: PlannedId
  name: string
  tagline: string
  description: string
}

export const planned: PlannedService[] = []
