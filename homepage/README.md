# Homepage

Startseite des Homeservers: begrüßt Besucher und schickt sie per Kachel zum
gewünschten Dienst. Erreichbar unter `https://tshomeserv.duckdns.org/` und
`https://tshomeserv.duckdns.org/start/`.

## Funktionen

- **Große Kacheln** für Nextcloud (`/index.php`), Donnerskat (`/skat/`) und
  Kofferpacken (`/koffer/`), je mit Icon und kurzer Beschreibung
- **Eine Spalte auf dem Handy**, mehrere Kacheln nebeneinander auf breiten
  Bildschirmen – neue Dienste kommen als weiterer Eintrag im Array `services`
  in [src/App.vue](src/App.vue) dazu
- Optik passend zu Donnerskat und Kofferpacken (dunkler Verlauf, goldener Akzent)

## Technik

- Vue 3 + TypeScript + Vite, Base-Pfad `/start/`
- Kein Router und kein Backend: eine statische Seite, ausgeliefert von nginx
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
    redir /start/
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

## Deployment

```sh
docker compose up -d --build
```

Der Container `homepage` hängt im `caddy-network`; Caddy leitet `/` und
`/start/` dorthin.
