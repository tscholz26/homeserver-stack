# Homepage

Startseite des Homeservers: ein kleines Dashboard, das begrüßt, den Zustand der
Dienste zeigt und per Kachel weiterschickt. Erreichbar unter
`https://tshomeserv.duckdns.org/` und `https://tshomeserv.duckdns.org/start/`.

## Auf der Startseite

- **Begrüßung** je nach Tageszeit (Morgen/Tag/Abend/Nacht); daneben Uhr und
  Datum, die auf dem Handy ausgeblendet werden. Ein Klick auf die Uhr öffnet den
  Google-Kalender
- **Dienst-Kacheln** für Nextcloud (`/index.php`), Donnerskat (`/skat/`) und
  Kofferpacken (`/koffer/`) – je mit Icon, Status-Punkt und Ziffer. Auf dem
  Handy werden sie zu flachen Zeilen, damit alle drei ohne Scrollen sichtbar
  sind (geprüft bis 360 × 640)
- **Tastenkürzel**: `1`, `2`, `3` springen direkt in den jeweiligen Dienst
- **Wetter** live aus der Wetter-API des Servers (`/home/weather`), mit eigenen
  Icons statt der Bilder von openweathermap.org. Der Klick führt nach außen
  aufs Regenradar von WetterOnline
- **Sonne**: Auf- und Untergang als Bogen, der den Tagesfortschritt füllt,
  plus „noch x h Tageslicht"
- **Status**: jeder Dienst wird jede Minute per HEAD angepingt; alles unter
  HTTP 500 gilt als „läuft" (ein 401 von Nextcloud heißt nur „nicht angemeldet").
  Die Karte führt weiter aufs Dashboard

Neue Dienste kommen als weiterer Eintrag im Array `services` in
[src/services.ts](src/services.ts) dazu, plus ein Icon-Zweig in
[src/components/ServiceIcon.vue](src/components/ServiceIcon.vue).

## Dashboard (`/start/dashboard`)

Serverwerte auf einen Blick, alle fünf Sekunden aktualisiert:

- **Läuft seit** – Uptime des Hosts, nicht des Containers
- **CPU** – Auslastung in Prozent, Load-Average 1/5/15, Temperatur, Modell und
  Kernzahl
- **Stromverbrauch** – Watt des CPU-Pakets aus dem RAPL-Energiezähler.
  Ausdrücklich **nicht** der ganze Rechner: Platten, Board und Netzteilverluste
  kennt der Zähler nicht, ein Gesamtwert wäre geraten
- **Arbeitsspeicher** – belegt/gesamt, verfügbar, Swap
- **Systemplatte** – belegt/gesamt von `/`, inklusive Docker-Images
- **Datenplatte** – belegt/gesamt von `/dev/sda1` (`/home/tristans/data`), wo die
  Nextcloud-Daten liegen
- **Docker-Container** – Name, Image, Zustand, Laufzeit sowie RAM, CPU,
  Neustart-Zähler und Healthcheck-Status je Container
- **Verfügbarkeit** – Zeitleiste der letzten 24 Stunden pro Dienst mit
  Verfügbarkeit in Prozent

Balken werden ab 70 % gelb und ab 90 % rot (`toneFor` in
[src/composables/useSystem.ts](src/composables/useSystem.ts)).

### Woher die Werte kommen

`GET /start/api/system` im Express-Server ([server.js](server.js)) liest:

- **Host-Werte** aus einzelnen, read-only gemounteten Dateien
  (`/proc/uptime`, `/proc/loadavg`, `/proc/meminfo`, `/proc/stat`,
  `/proc/cpuinfo`, `/etc/hostname`, `/etc/os-release`, Thermal-Zonen).
  Bewusst **nicht** ganz `/proc`: dort stehen auch die Umgebungsvariablen
  aller anderen Prozesse, also z. B. Nextclouds Datenbank-Passwort.
  `/proc/sys/kernel/hostname` funktioniert übrigens nicht – im Container liefert
  das den Container-Namen, weil die Datei zum UTS-Namespace gehört
- **Speicherplatz** per `statfs` auf `/` im Container. Der liegt auf dem
  gleichen Dateisystem wie `/var/lib/docker`, bei Standard-Setup also auf der
  Systemplatte. Liegt Dockers `data-root` woanders, zeigt die Karte diese Platte
- **CPU-Auslastung** als Differenz zweier `/proc/stat`-Messungen im 5-Sekunden-
  Takt; ein einzelner Blick liefert nur Summen seit dem Boot
- **Stromverbrauch** aus `/sys/devices/virtual/powercap/intel-rapl/intel-rapl:0/energy_uj`.
  Der Zähler läuft in Mikrojoule hoch, Watt ist die Differenz pro Sekunde
  (Überlauf bei `max_energy_range_uj` wird abgefangen). Die Datei ist
  root-only (0400); im Container läuft der Server als root, deshalb geht es.
  Gemountet wird das `powercap`-Verzeichnis, weil die Volume-Kurzschreibweise an
  den Doppelpunkten im Zonenpfad scheitert
- **Datenplatte** per `statfs` auf `/home/tristans/data/.dashboard-df` – ein
  leeres Verzeichnis, das nur dafür existiert. So kommt der Container an die
  Belegung von `/dev/sda1`, ohne die Nextcloud-Daten sehen zu können
- **Container** über den `docker-socket-proxy`, der nur `GET /containers`
  durchlässt. Der Docker-Socket direkt im Webcontainer wäre Root-Zugriff auf den
  Host; über den Proxy sind `stop`, `exec`, `/images` und `/info` mit 403 dicht.
  RAM, CPU, Neustarts und Health kommen aus `/containers/<id>/json` und
  `/containers/<id>/stats`. Ein stats-Abruf dauert rund eine Sekunde (Docker
  misst intern zweimal), deshalb sammelt ein Hintergrundlauf die Werte einmal
  pro Minute und die API gibt den letzten Stand aus
- **Verfügbarkeit**: alle 60 Sekunden geht eine HTTPS-Anfrage über Caddy an
  `/status.php`, `/skat/` und `/koffer/` – mit dem echten Hostnamen im SNI, also
  genau der Weg eines Besuchers, womit auch ein Proxy-Problem auffällt. Alles
  unter HTTP 500 gilt als „läuft". Die Messpunkte landen in
  `data/uptime.json` (atomar geschrieben, 48 Stunden Vorhaltezeit) und werden
  vom Server zu 96 Abschnitten zusammengefasst.
  **Der Verlauf beginnt mit dem ersten Start dieser Version** – rückwirkend gibt
  es keine Daten, die Leiste füllt sich erst über den Tag

### Die Seite ist öffentlich

`/start/dashboard` und `/start/api/system` sind aus dem Internet erreichbar wie
der Rest der Domain – wer die Adresse kennt, sieht Container-Namen, Images und
die Auslastung. Nur im Heimnetz erlauben geht in der Caddyfile innerhalb von
`handle_path /start/* { … }`:

```
@adminExtern {
    path /dashboard* /api/*
    not remote_ip private_ranges
}
respond @adminExtern 403
```

## Technik

- Vue 3 + TypeScript + Vite, Base-Pfad `/start/`, vue-router mit den Routen
  `/` und `/dashboard`
- Backend: Express ([server.js](server.js)), Port 2607 – liefert `dist`, die
  System-API und den SPA-Fallback
- **Helles Design**: warmes Off-White, Karten mit weichem Schatten, dazu vier
  langsam wandernde Pastellschleier und ein feines Korn – alles in CSS
  ([src/assets/base.css](src/assets/base.css)). Farben und Flächen stehen dort
  als Variablen, die Akzentfarbe pro Dienst in der jeweiligen Komponente.
  `prefers-reduced-motion` schaltet alle Animationen ab
- Alle Assets liegen unter `/start/`, damit sie sich nicht mit Nextcloud unter
  `/` kreuzen – so kann die Seite unter beiden Pfaden ausgeliefert werden

### Routing in Caddy

Nextcloud liegt weiterhin unter `/` und beansprucht alles, was nicht
ausdrücklich woanders hinzeigt. Deshalb greift die Startseite nur den **exakten**
Pfad `/` ab (`handle /`, kein `/*`) und zusätzlich `/start/*`:

```
handle_path /start/* {
    reverse_proxy homepage:2607
}

handle /start {
    redir * /start/
}

handle / {
    reverse_proxy homepage:2607
}
```

Nextcloud-Pfade wie `/login`, `/status.php` oder `/remote.php/dav/` laufen
unverändert weiter zum `php_fastcgi`-Block. Nach dem Bearbeiten der Caddyfile
reicht `caddy reload` **nicht**: die Datei ist einzeln gemountet, der Container
sieht nach einem Editor-Speichern noch die alte. Also
`docker compose up -d --force-recreate` im Ordner `caddy`.

## Entwicklung

```sh
npm install
node server.js        # API auf :2607
npm run dev           # Vite-Devserver, proxied /start/api → :2607
npm run test:unit
```

Ohne die Host-Mounts (also außerhalb von Docker) stehen die Systemwerte auf
`null` und das Dashboard zeigt Striche; Wetter und Status-Pings gehen im
Devserver ins Leere, weil die Pfade auf dem Server liegen.

## Deployment

```sh
docker compose up -d --build
```

Der Container `homepage` hängt im `caddy-network`, dazu kommt
`homepage-docker-api` (Socket-Proxy) in einem eigenen Netz.
