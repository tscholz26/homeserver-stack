# Einkaufsliste

Gemeinsame Einkaufsliste für den Homeserver: Artikel eintippen, sie landen
automatisch in der richtigen Kategorie, und beim Einkaufen wird auf beiden
Handys gleichzeitig abgehakt. Erreichbar unter
`https://tshomeserv.duckdns.org/einkauf/`.

## Funktionen

- **Listen** frei konfigurierbar (anlegen, umbenennen, löschen – in der
  Verwaltung; die Tab-Leiste ist nur zum Wechseln da). Zwei sind vorgegeben: „Lebensmittel“ (`kategorisiert`) und „Drogerie“ (`flach`)
  - `kategorisiert`: Artikel werden nach Kategorie gruppiert und in
    Supermarkt-Reihenfolge angezeigt, mit klebender Kategorie-Überschrift
  - `flach`: schlichte Liste ohne Kategorie-Überbau
- **Eingabe** aus kleinem Mengenfeld (`2`, `500g`, `1 Pck.`) und großem
  Namensfeld; Enter oder „+“ trägt ein
- **Zuordnung** über den mitgelieferten [Artikelkatalog](seed/artikelkatalog.json)
  (303 Artikel, 1143 Schreibweisen) – komplett im Browser, ohne Nachladen:
  1. Normalisieren (klein, getrimmt, Mehrfach-Leerzeichen zusammengefasst)
  2. exakter Treffer auf Name oder Alias
  3. Teilstring in beide Richtungen, jeweils am Wortanfang (siehe unten)
  4. Levenshtein-Distanz als Fallback: eine Abweichung, ab acht Zeichen zwei
  5. kein Treffer → `sonstiges` plus ◌-Badge in der Zeile
- **Abhaken** rutscht den Artikel ans Ende seiner Kategorie (ausgegraut,
  durchgestrichen); **„Einkauf beenden“** löscht alles Abgehakte und lässt
  liegen, was nicht im Laden war
- **Korrektur in der Liste**: ein Tipp auf den Artikelnamen macht aus der Zeile
  ein Eingabefeld – Name, Menge und Kategorie. Eine geänderte Kategorie wandert
  immer auch in den Katalog, falsch einsortiert wird also nur einmal. Wird nur
  der **Name** verbessert, fragt der Katalog noch einmal nach: aus „Pizzateif“
  wird „Pizzateig“ samt Rückfrage, ob der Artikel ins passende Regal soll. Über
  „Schreibweise für ein anderes Wort“ lässt sich der Name stattdessen an einen
  vorhandenen Artikel hängen
- **Handsortierung** in Listen ohne Kategorien: Artikel am Griff ⠿ an die
  richtige Stelle ziehen (SortableJS, damit es auch auf dem Handy geht)
- **Abhaken ohne Netz**: hinten im Laden bricht die Verbindung weg. Ein Haken
  gilt trotzdem sofort, wartet in einer kleinen Outbox (`localStorage`) und geht
  raus, sobald wieder Netz da ist – die Fußleiste zeigt, wie viele noch warten.
  Ein eintreffender Serverstand kann sie nicht überschreiben. Nur die Haken sind
  so abgesichert; Anlegen, Umbenennen und Katalogpflege brauchen Verbindung
- **Kompakte Ansicht**: der Knopf in der Fußleiste blendet die
  Kategorie-Überschriften aus. Sortiert wird weiter nach Laden-Reihenfolge, nur
  sammelt sich das Abgehakte dann am Ende der ganzen Liste statt am Fuß jeder
  Kategorie
- **Rezepte**: „🍲 Rezept zum Einkauf hinzufügen“ auf dem Listenbildschirm
  öffnet das Rezeptbuch (nach Gruppen: frisch gekocht, aus dem Vorrat,
  saisonal). Ein Tipp zeigt die Zutaten – dort wird abgewählt, was schon zu
  Hause ist, und die Menge für **diesen einen Einkauf** angepasst. Das Rezept
  selbst bleibt davon unberührt; über den Stift ✎ wird es dauerhaft geändert
  oder neu angelegt
- **Märkte**: pro kategorisierter Liste beliebig viele Filialen mit eigener
  Kategorie-Reihenfolge; der aktive Markt wird in der Verwaltung gewählt und
  taucht beim Einkaufen nicht auf
- **Verwaltung**: nicht zugeordnete Artikel nachpflegen, Märkte und Listen
  verwalten, den kompletten Katalog durchsuchen und korrigieren
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

Die zweite Abweichung erst ab acht Zeichen hat denselben Grund: „Salami“ lag
über zwei Änderungen beim Alias „Halumi“ und damit im Kühlregal. Damit solche
Treffer nicht rätselhaft bleiben, merkt sich jeder Artikel, **über welchen
Katalogartikel** seine Kategorie kam; die Detailansicht schreibt es hin.

## Technik

- Frontend: Vue 3 + TypeScript + Vite (Base-Pfad `/einkauf/`)
- Backend: Express ([server.js](server.js)), Port 2608
- Persistenz: `data/state.json` (atomar geschrieben), Katalog und Märkte
  zusätzlich in `export/katalog.json` fürs git

### Wo die Daten liegen und was sie rettet

Jede Änderung landet sofort in `data/state.json`. Das Verzeichnis ist als
Volume vom Host in den Container gehängt (`./data:/app/data`), liegt also
außerhalb des Images: Neustart, Rebuild und `docker compose down` lassen die
Daten unberührt. Geschrieben wird über eine temporäre Datei plus `rename`, ein
Absturz mitten im Schreiben kann die Datei also nicht halb beschriftet
hinterlassen.

Zwei Dinge sind darin nicht ersetzbar: der **Katalog** und die **Märkte** –
beides steckt in Monaten Nachpflege. Die aktuelle Einkaufsliste ist es dagegen
schon (im Zweifel tippt man sie neu). Deshalb schreibt der Server nach jeder
Änderung eine Kopie genau dieser beiden nach
[export/katalog.json](export/katalog.json) – und **diese Datei liegt im git**:

```sh
git add einkaufsliste/export/katalog.json && git commit -m "Katalogstand"
```

Fehlt `data/state.json` beim Start (neuer Rechner, geleertes Volume), holt sich
der Server Katalog und Märkte von dort zurück; die Listen sind dann leer.
Nachgeladen aus dem Seed wird anschließend nur, was auch dort noch fehlt.

Ein regelmäßiges Backup des ganzen Stands gibt es damit bewusst nicht mehr – es
hätte nur die Einkaufsliste zusätzlich gesichert, dafür aber die komplette Liste
mit ins (öffentliche) Repo gezogen. Das alte Verzeichnis `backups/` kann weg.

### API

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/state` | kompletter Stand inkl. Kategorien und Katalog |
| GET | `/api/events` | Server-Sent Events: nach jeder Änderung der neue Stand |
| POST / PUT / DELETE | `/api/lists[/:id]` | Liste anlegen / umbenennen / löschen |
| PUT | `/api/lists/:id/store-profile` | aktiven Markt setzen (`null` = Standard-Reihenfolge) |
| POST / PUT / DELETE | `/api/store-profiles[/:id]` | Markt anlegen / umbenennen bzw. umsortieren / löschen |
| POST | `/api/lists/:id/items` | Artikel eintragen (Kategorie kommt aus dem Browser) |
| PUT | `/api/lists/:id/items/:itemId` | Name, Menge und/oder Kategorie korrigieren |
| POST | `/api/lists/:id/items/:itemId/check` | `{ done }` setzen |
| DELETE | `/api/lists/:id/items/:itemId` | Artikel entfernen |
| PUT | `/api/lists/:id/order` | neue Reihenfolge der Artikel (Handsortierung) |
| POST | `/api/lists/:id/add-batch` | ganzes Rezept: neue Artikel und fortgeschriebene Mengen |
| POST / PUT / DELETE | `/api/recipes[/:id]` | Rezept anlegen / ändern / löschen |
| POST | `/api/lists/:id/finish` | „Einkauf beenden“: Abgehaktes löschen |
| POST | `/api/catalog` | `{ name, category_id }` dauerhaft zuordnen |
| POST | `/api/catalog/alias` | `{ name, alias }` – Schreibweise an einen Artikel hängen |
| PUT / DELETE | `/api/catalog` | Artikel anlegen bzw. überschreiben / löschen |
| DELETE | `/api/unmatched/:id` | nicht zugeordneten Namen verwerfen |

### Kategorien und Katalog

Beides liegt als Datei im Image und geht über `/api/state` an den Browser, steht
also nirgends doppelt im Code:

- [seed/kategorien.json](seed/kategorien.json) – ID, Emoji, Label. **Die
  Reihenfolge dieser Datei ist die Standard-Reihenfolge im Laden**, `sonstiges`
  hängt immer hinten und wird nie umsortiert.
- [seed/artikelkatalog.json](seed/artikelkatalog.json) – `{ name, aliases,
  category_id }`.

Der Katalog in `data/state.json` ist die Wahrheit (gesichert in
`export/katalog.json`). Beim ersten Start wird er aus dem Seed befüllt, danach
liefert der Seed nur noch nach, was dort fehlt –
also genau die Artikel, die mit einem Update dazukommen. Gelöschte Artikel
bleiben gelöscht (`removedSeedNames`), sonst stünden sie nach jedem Neustart
wieder da.

In der Verwaltung steht deshalb der **komplette** Katalog: suchen, Kategorie
umstellen, Schreibweisen ergänzen oder wegwerfen, Artikel anlegen oder löschen.
Ohne Suchbegriff zeigt die Liste nichts – bei 300 Artikeln führt nur die Suche
zum Ziel.

Für einen unbekannten Namen gibt es zwei Wege:

- **eigener Artikel**: Kategorie wählen → neuer Katalogeintrag
- **Schreibweise eines vorhandenen Artikels** („Zuchini“ → Zucchini): der
  Eintrag wandert als Alias an den bestehenden Artikel.

Eine neue Zuordnung zieht die Artikel mit, die deswegen gerade unter
„Sonstiges“ liegen (`applyToUnmatchedItems` in [server.js](server.js)) – sonst
müsste man dieselbe Entscheidung in der Liste ein zweites Mal treffen. Artikel,
deren Kategorie von Hand gesetzt wurde, bleiben unangetastet. Wächst der Katalog
später, holt „Nochmal zuordnen“ in der Verwaltung den Rest nach.

Die Vorschläge unter „Schreibweise eines vorhandenen Artikels“ kommen aus
`suggestCatalogEntries()` und sind absichtlich lockerer als das Matching beim
Eintippen: „Kokosjoghurt“ schlägt Joghurt vor, ohne dass es dort automatisch
einsortiert würde.

### Rezepte und was beim Zusammentreffen passiert

Das Rezeptbuch liegt in `data/state.json` und – wie der Katalog, aber in einer
**eigenen Datei** – in [export/rezepte.json](export/rezepte.json) fürs git. Zwei
Dateien, zwei lesbare Diffs: ein neues Rezept bläht den Katalog-Diff nicht auf.
[seed/rezepte.json](seed/rezepte.json) liefert die Startsammlung,
[seed/rezeptgruppen.json](seed/rezeptgruppen.json) die Gruppen; nachgeliefert
wird auch hier nur, was fehlt, und Gelöschtes bleibt gelöscht.

Steht eine Zutat schon auf der Liste, sind zwei Zeilen mit demselben Artikel das
Letzte, was im Laden hilft. Deshalb:

- **Erkannt** wird die Dopplung über den Katalogartikel, nicht über den Text –
  „Kirschtomaten“ auf der Liste und „Cherrytomaten“ im Rezept sind dasselbe.
  Abgehaktes zählt nicht mit: was im Wagen liegt, ist erledigt.
- **Zusammengelegt** werden Mengen nur bei gleicher Einheit: `250 g` + `200 g`
  wird `450 g`, `2 Stück` + `1 St.` wird `3 St.`. Unterschiedliche Einheiten
  stehen nebeneinander: `1 Packung + 200 g`. Eine erfundene Umrechnung wäre im
  Laden schlimmer als beide Angaben zu sehen (`mengeZusammenfassen` in
  [mengen.ts](src/utils/mengen.ts)).
- **Entschieden** wird pro Zutat: das Fenster zeigt „steht schon drauf (250 g) →
  wird 450 g“ und daneben den Knopf „getrennt“, wenn es doch eine eigene Zeile
  sein soll.

Gerechnet wird erst beim Hinzufügen und mit der Menge, die dann auf der Liste
steht – hat das andere Gerät sie inzwischen geändert, zählt die neue.

### Märkte

Verschiedene Filialen haben verschiedene Wege durch den Laden. Ein Markt ist
deshalb nichts weiter als eine eigene Kategorie-Reihenfolge:

```jsonc
// data/state.json
"storeProfiles": [
  {
    "id": "…",
    "name": "Rewe Felsenkeller",
    "listId": "<id der Liste>",
    "categoryOrder": ["obst_gemuese", "fleisch_wurst", "milch_kuehlwaren"]
  }
]
```

Angelegt und sortiert werden Märkte in der Verwaltung (Reihenfolge per Griff
⠿ ziehen), ausgewählt ebenfalls dort – die Einkaufsansicht zeigt davon nichts.
`categoryOrderFor()` in
[useEinkaufStore.ts](src/composables/useEinkaufStore.ts) zieht die Kategorien
des aktiven Marktes nach vorn, hängt alles nicht Genannte in
Standard-Reihenfolge an und `sonstiges` ganz ans Ende. Neue Kategorien im Seed
tauchen dadurch auch in bestehenden Märkten auf, ohne dass dort etwas
nachgetragen werden muss. Welcher Markt gilt, steht pro Liste in
`storeProfileId`; die Einkaufsansicht zeigt davon bewusst nichts.

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
[caddy/Caddyfile](../caddy/Caddyfile)). `data/` und `export/` liegen als Volumes
auf dem Host und überleben jeden Rebuild.
