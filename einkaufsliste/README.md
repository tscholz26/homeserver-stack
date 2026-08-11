# Einkaufsliste

Gemeinsame Einkaufsliste für den Homeserver: Artikel eintippen, sie landen
automatisch in der richtigen Kategorie, und beim Einkaufen wird auf beiden
Handys gleichzeitig abgehakt. Erreichbar unter
`https://tshomeserv.duckdns.org/einkauf/`.

## Funktionen

- **Listen** frei konfigurierbar (anlegen, umbenennen, löschen). Zwei sind
  vorgegeben: „Lebensmittel“ (`kategorisiert`) und „Drogerie“ (`flach`)
  - `kategorisiert`: Artikel werden nach Kategorie gruppiert und in
    Supermarkt-Reihenfolge angezeigt, mit klebender Kategorie-Überschrift
  - `flach`: schlichte Liste ohne Kategorie-Überbau
- **Eingabe** aus kleinem Mengenfeld (`2`, `500g`, `1 Pck.`) und großem
  Namensfeld; Enter oder „+“ trägt ein
- **Zuordnung** über den mitgelieferten [Artikelkatalog](seed/artikelkatalog.json)
  (179 Artikel, 795 Schreibweisen) – komplett im Browser, ohne Nachladen:
  1. Normalisieren (klein, getrimmt, Mehrfach-Leerzeichen zusammengefasst)
  2. exakter Treffer auf Name oder Alias
  3. Teilstring in beide Richtungen, jeweils am Wortanfang (siehe unten)
  4. Levenshtein-Distanz ≤ 2 als Fallback
  5. kein Treffer → `sonstiges` plus ◌-Badge in der Zeile
- **Abhaken** rutscht den Artikel ans Ende seiner Kategorie (ausgegraut,
  durchgestrichen); **„Einkauf beenden“** löscht alles Abgehakte und lässt
  liegen, was nicht im Laden war
- **Korrektur in der Liste**: ein Tipp auf den Artikelnamen öffnet Name und
  Kategorie zum Ändern. „Kategorie fürs nächste Mal merken“ schreibt sie
  zugleich in den Katalog – falsch einsortiert wird also nur einmal
- **Verwaltung**: nicht zugeordnete Artikel nachpflegen und Listen verwalten
- **Live-Sync**: jede Änderung geht als einzelner Request an den Server, der
  sie auf den zentralen Stand anwendet und ihn per Server-Sent Events sofort an
  alle offenen Geräte schickt

Es gibt bewusst **keine Nutzerverwaltung**: beide teilen sich dieselben Listen,
und wer etwas eingetragen hat, spielt beim Einkaufen keine Rolle. Falls doch
einmal getrennte Listen gebraucht werden, ist das Muster aus
[Kofferpacken](../kofferpacken) die Vorlage.

Der Wortanfang bei der Teilstring-Suche ist der Unterschied zwischen „Bio
Zitronen“ → Obst & Gemüse und „Fahrradschlauch“ → Lauch: deutsche Komposita
enthalten reihenweise fremde Artikelnamen in der Wortmitte. Was dabei durchs
Raster fällt, landet einmalig in der Verwaltung und ist danach bekannt.

## Technik

- Frontend: Vue 3 + TypeScript + Vite (Base-Pfad `/einkauf/`)
- Backend: Express ([server.js](server.js)), Port 2608
- Persistenz: `data/state.json`, atomar geschrieben (temporäre Datei +
  `rename`), täglich nach `backups/` kopiert (30 Stände)

### Warum JSON und keine Datenbank

Alle Schreibzugriffe laufen durch **einen** Node-Prozess, und jede Änderung ist
ein synchrones Lesen → Ändern → Schreiben ohne `await` dazwischen. Zwei
gleichzeitige Anfragen können sich deshalb nicht überlappen; die
Einzeländerungs-API (nie ein PUT des ganzen Stands) sorgt zusätzlich dafür, dass
zwei Geräte einander nicht überschreiben. Der Datenumfang – zwei Nutzer, ein
paar Dutzend Artikel, 179 Katalogeinträge – liegt um Größenordnungen unter dem,
wo eine Datenbank etwas beitragen würde. SQLite hätte hier nur einen weiteren
Baustein bedeutet, ohne ein Problem zu lösen, das es gibt.

### API

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/state` | kompletter Stand inkl. Kategorien und Katalog |
| GET | `/api/events` | Server-Sent Events: nach jeder Änderung der neue Stand |
| POST / PUT / DELETE | `/api/lists[/:id]` | Liste anlegen / umbenennen / löschen |
| PUT | `/api/lists/:id/store-profile` | aktives Ladenprofil setzen (`null` = Standard) |
| POST | `/api/lists/:id/items` | Artikel eintragen (Kategorie kommt aus dem Browser) |
| PUT | `/api/lists/:id/items/:itemId` | Name und/oder Kategorie korrigieren |
| POST | `/api/lists/:id/items/:itemId/check` | `{ done }` setzen |
| DELETE | `/api/lists/:id/items/:itemId` | Artikel entfernen |
| POST | `/api/lists/:id/finish` | „Einkauf beenden“: Abgehaktes löschen |
| POST | `/api/catalog` | `{ name, category_id }` dauerhaft zuordnen |
| POST | `/api/catalog/alias` | `{ name, alias }` – Schreibweise an einen Artikel hängen |
| DELETE | `/api/unmatched/:id` | nicht zugeordneten Namen verwerfen |

### Kategorien und Katalog

Beides liegt als Datei im Image und geht über `/api/state` an den Browser, steht
also nirgends doppelt im Code:

- [seed/kategorien.json](seed/kategorien.json) – ID, Emoji, Label. **Die
  Reihenfolge dieser Datei ist die Standard-Reihenfolge im Laden**, `sonstiges`
  hängt immer hinten und wird nie umsortiert.
- [seed/artikelkatalog.json](seed/artikelkatalog.json) – `{ name, aliases,
  category_id }`.

Was in der Verwaltung zugeordnet wird, landet in derselben Struktur unter
`catalog` in `data/state.json` und steht bei der Suche **vor** dem Seed. Der
Seed selbst bleibt im git und kann jederzeit erweitert werden (danach einmal
`docker compose up -d --build`). Bereits eingetragene Artikel in den Listen
werden durch eine neue Zuordnung nicht rückwirkend geändert.

Für einen unbekannten Namen gibt es zwei Wege:

- **eigener Artikel**: Kategorie wählen → neuer Katalogeintrag
- **Schreibweise eines vorhandenen Artikels** („Zuchini“ → Zucchini): der
  Eintrag wandert als Alias an den bestehenden Artikel. Betrifft es einen
  Seed-Artikel, entsteht dabei eine eigene Kopie in `data/state.json`, die den
  Seed überdeckt – der Seed selbst bleibt unangetastet.

Die Vorschläge unter „Schreibweise eines vorhandenen Artikels“ kommen aus
`suggestCatalogEntries()` und sind absichtlich lockerer als das Matching beim
Eintippen: „Hafermilch“ schlägt Vollmilch vor, ohne dass es dort automatisch
einsortiert würde.

### Ladenprofile (vorbereitet, noch ohne UI)

Verschiedene Filialen haben verschiedene Wege durch den Laden. Die
Kategorie-Reihenfolge steht deshalb nirgends fest verdrahtet:

```jsonc
// data/state.json
"storeProfiles": [
  {
    "id": "rewe-felsenkeller",
    "name": "Rewe Felsenkeller",
    "listId": "<id der Liste>",
    "categoryOrder": ["obst_gemuese", "fleisch_wurst", "milch_kuehlwaren"]
  }
]
```

`categoryOrderFor()` in
[useEinkaufStore.ts](src/composables/useEinkaufStore.ts) zieht die Kategorien
des aktiven Profils nach vorn, hängt alles nicht Genannte in
Standard-Reihenfolge an und `sonstiges` ganz ans Ende – die Anzeige läuft also
schon heute über diesen Pfad. Es fehlt nur die Oberfläche zum Anlegen der
Profile und der „Ich kaufe gerade hier ein“-Umschalter; welches Profil gilt,
steht pro Liste in `storeProfileId` und ist über
`PUT /api/lists/:id/store-profile` setzbar.

## Entwicklung

```sh
npm install
node server.js        # API auf :2608
npm run dev           # Vite-Devserver, proxied /einkauf/api → :2608
npm run test:unit     # Tests zum Fuzzy-Matching
```

## Deployment

```sh
docker compose up -d --build
```

Der Container `einkaufsliste` hängt im `caddy-network`; Caddy leitet
`/einkauf/*` per `handle_path` dorthin weiter (siehe
[caddy/Caddyfile](../caddy/Caddyfile)). `data/` und `backups/` liegen als
Volumes auf dem Host und überleben jeden Rebuild.
