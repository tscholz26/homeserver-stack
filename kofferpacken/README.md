# Kofferpacken

Reisepacklisten-App für den Homeserver: Trips anlegen und die Packliste pro Trip
auf allen Geräten gemeinsam abhaken. Erreichbar unter `https://tshomeserv.duckdns.org/koffer/`.

## Funktionen

- **Packliste** pro Trip, gruppiert nach Kategorien, mit Abhaken/Enthaken,
  Filter „Nur fehlende anzeigen“, Fortschrittsbalken und einklappbaren Kategorien
- **Verwaltung** von Trips sowie dem Katalog (Kategorien anlegen, Gegenstände
  anlegen/umbenennen/löschen, Suche)
- **PDF-Export** der leeren Liste als kompakte A4-Checkliste zum Ausdrucken
- **Mehrgeräte-tauglich**: jede Änderung geht als einzelner Request an den Server,
  der sie auf den zentralen Stand anwendet und den autoritativen State zurückgibt –
  Geräte können sich nicht gegenseitig überschreiben
- Als **PWA** zum Homescreen hinzufügbar (Koffer-Icon, Standalone-Anzeige)

## Technik

- Frontend: Vue 3 + TypeScript + Vite (Base-Pfad `/koffer/`)
- Backend: Express ([server.js](server.js)), Port 2606
- Persistenz: `data/state.json` (atomar geschrieben); beim allerersten Start wird
  der Katalog aus [seed.json](seed.json) übernommen

### API

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/state` | kompletter Stand |
| POST / DELETE | `/api/trips[/:id]` | Trip anlegen / löschen |
| POST | `/api/trips/:id/check` | `{ itemId, packed }` setzen |
| POST | `/api/categories` | Kategorie anlegen |
| POST / PUT / DELETE | `/api/items[/:id]` | Gegenstand anlegen / umbenennen / löschen |

## Entwicklung

```sh
npm install
node server.js        # API auf :2606
npm run dev           # Vite-Devserver, proxied /koffer/api → :2606
```

## Deployment

```sh
docker compose up -d --build
```

Der Container `kofferpacken` hängt im `caddy-network`; Caddy leitet
`/koffer/*` dorthin weiter (siehe [../caddy/Caddyfile](../caddy/Caddyfile)).
Die Daten liegen über das Volume `./data` auf dem Host.
