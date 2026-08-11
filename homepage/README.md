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
- **Stromverbrauch** – gemessener CPU-Anteil plus geschätzter Rest, deshalb mit
  „≈“ davor. Die Karte nennt beide Teile getrennt
- **Arbeitsspeicher** – belegt/gesamt, verfügbar, Swap
- **Systemplatte** – belegt/gesamt von `/`, inklusive Docker-Images
- **Datenplatte** – belegt/gesamt von `/dev/sda1` (`/home/tristans/data`), wo die
  Nextcloud-Daten liegen
- **Docker-Container** – Name, Image, Zustand, Laufzeit sowie RAM, CPU,
  Neustart-Zähler und Healthcheck-Status je Container
- **Verfügbarkeit** – Zeitleiste der letzten 24 Stunden pro Dienst mit
  Verfügbarkeit in Prozent, direkt über den Containern
- **Verlauf**: CPU, Arbeitsspeicher und Stromverbrauch zeigen den Mittelwert der
  letzten 60 Minuten auf der Karte; ein Klick öffnet den Verlauf als Kurve mit
  Jetzt-, Ø-, Minimal- und Maximalwert, umschaltbar zwischen den letzten
  60 Minuten und 24 Stunden

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
- **Stromverbrauch** aus den RAPL-Zählern unter
  `/sys/devices/virtual/powercap/intel-rapl/`.
  Der Zähler läuft in Mikrojoule hoch, Watt ist die Differenz pro Sekunde
  (Überlauf bei `max_energy_range_uj` wird abgefangen). Die Datei ist
  root-only (0400); im Container läuft der Server als root, deshalb geht es.
  Gemountet wird das `powercap`-Verzeichnis, weil die Volume-Kurzschreibweise an
  den Doppelpunkten im Zonenpfad scheitert.

  Summiert werden das Paket (`package-0`) und, falls vorhanden, `dram`.
  `core` und `uncore` bleiben außen vor, die stecken schon im Paketwert. Für
  alles ohne Zähler – Board, Chipsatz, Platten, Lüfter, Netzwerk – kommt eine
  Grundlast dazu, danach wird durch den Netzteil-Wirkungsgrad geteilt:

  | Variable | Standard | Bedeutung |
  | --- | --- | --- |
  | `BASE_POWER_WATTS` | `20` | Grundlast des restlichen Rechners in Watt |
  | `PSU_EFFICIENCY` | `0.88` | Wirkungsgrad des Netzteils |

  Der Standard passt zu diesem Rechner (i3-7100, 16 GB, eine HDD, eine SSD) und
  liegt im Leerlauf bei rund 25 W.

  **Genauer geht es auf diesem Rechner nicht.** Es gibt keinen
  Leistungssensor: `/sys/class/power_supply/` ist leer, in `hwmon` stehen nur
  Temperaturchips, kein IPMI/BMC, keine USV, und RAPL bietet hier keine
  Plattform-Domain (`psys`) – nur `package-0` (mit `core`/`uncore`) und `dram`,
  und die werden beide gemessen. Auch `powertop` oder `turbostat` lesen dieselbe
  Datei; powertops Wattanzeige stammt sonst aus der Akku-Entladerate, und ein
  Akku ist hier nicht vorhanden.

  **Kalibrieren** geht mit einem Steckdosenmessgerät, einmalig: gemessene
  Wattzahl minus angezeigtem CPU-Anteil, das Ergebnis mal `PSU_EFFICIENCY` als
  `BASE_POWER_WATTS` eintragen. Danach stimmt die Schätzung für den Leerlauf.

- **Verlauf von CPU, Speicher und Strom**: der 5-Sekunden-Ticker sammelt, einmal
  pro Minute wird ein Mittelwert nach `data/metrics.json` geschrieben (24
  Stunden = 1440 Punkte). `GET /start/api/metrics` gibt die Rohwerte aus; die
  Umrechnung der CPU-Watt auf den geschätzten Gesamtverbrauch passiert erst in
  der Anzeige. So bleibt die Datei unabhängig davon, wie die Grundlast gerade
  eingestellt ist

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
