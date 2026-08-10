# Homepage

Startseite des Homeservers: ein kleines Dashboard, das begrüßt, den Zustand der
Dienste zeigt und per Kachel weiterschickt. Erreichbar unter
`https://tshomeserv.duckdns.org/` und `https://tshomeserv.duckdns.org/start/`.

## Auf der Seite

- **Begrüßung** je nach Tageszeit (Morgen/Tag/Abend/Nacht); daneben Uhr und
  Datum, die auf dem Handy ausgeblendet werden
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
  HTTP 500 gilt als „läuft" (ein 401 von Nextcloud heißt nur „nicht angemeldet")

Neue Dienste kommen als weiterer Eintrag im Array `services` in
[src/services.ts](src/services.ts) dazu, plus ein Icon-Zweig in
[src/components/ServiceIcon.vue](src/components/ServiceIcon.vue).

## Technik

- Vue 3 + TypeScript + Vite, Base-Pfad `/start/`
- Kein Router und kein eigenes Backend: eine statische Seite, ausgeliefert von
  nginx. Die Live-Daten holt der Browser von den Diensten, die schon laufen
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
    reverse_proxy homepage:80
}

handle /start {
    redir * /start/
}

handle / {
    reverse_proxy homepage:80
}
```

Nextcloud-Pfade wie `/login`, `/status.php` oder `/remote.php/dav/` laufen
unverändert weiter zum `php_fastcgi`-Block.

## Entwicklung

```sh
npm install
npm run dev           # Vite-Devserver unter /start/
npm run test:unit
```

Wetter und Status-Pings gehen im Devserver ins Leere (die Pfade liegen auf dem
Server) – die Karten zeigen dann ihren Fallback.

## Deployment

```sh
docker compose up -d --build
```

Der Container `homepage` hängt im `caddy-network`; Caddy leitet `/` und
`/start/` dorthin.
