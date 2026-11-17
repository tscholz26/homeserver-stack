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
- **Zuordnung** über den [Artikelkatalog](export/katalog.json) (340 Artikel,
  gut 1100 Schreibweisen) – komplett im Browser, ohne Nachladen:
  1. Normalisieren (klein, getrimmt, Mehrfach-Leerzeichen zusammengefasst)
  2. exakter Treffer auf Name oder Alias
  3. Teilstring in beide Richtungen, jeweils am Wortanfang (siehe unten)
  4. Levenshtein-Distanz als Fallback: eine Abweichung, ab acht Zeichen zwei
  5. kein Treffer → `sonstiges` plus ◌-Badge in der Zeile
- **Einkauf starten**: der Knopf unten rechts fragt zuerst, in welchem Laden
  eingekauft wird – aus den angelegten Märkten, „Woanders“ für die
  Standard-Reihenfolge oder „Anderer Supermarkt …“ für einen neuen Markt, der
  mit der Standard-Reihenfolge anfängt. Danach steht dort **„Einkauf beenden“**.
  Flache Listen kennen keine Märkte, dort geht es ohne Rückfrage los
- **Abhaken** rutscht den Artikel ans Ende seiner Kategorie (ausgegraut,
  durchgestrichen); **„Einkauf beenden“** löscht alles Abgehakte, beendet den
  Einkauf und lässt liegen, was nicht im Laden war
- **Korrektur in der Liste**: ein Tipp auf den Artikelnamen macht aus der Zeile
  ein Eingabefeld – Name, Menge und Kategorie. Eine geänderte Kategorie wandert
  immer auch in den Katalog, falsch einsortiert wird also nur einmal. Wird nur
  der **Name** verbessert, fragt der Katalog noch einmal nach: aus „Pizzateif“
  wird „Pizzateig“ samt Rückfrage, ob der Artikel ins passende Regal soll. Über
  „Schreibweise für ein anderes Wort“ lässt sich der Name stattdessen an einen
  vorhandenen Artikel hängen
- **Wofür steht das da?** Artikel, die über ein Rezept auf die Liste kamen,
  tragen ein kleines 🍲 (mit Zahl, wenn es mehrere Gerichte sind). Ein Tipp auf
  den Namen zeigt darunter „für Flammkuchen · Halloumi Burger“, ein zweiter Tipp
  blendet es aus; bearbeitet wird dann über „Bearbeiten“ oder die Menge. Von Hand
  eingetragene Artikel gehören zu keinem Gericht – bei ihnen öffnet der Tipp wie
  gewohnt gleich die Bearbeitung. Wird eine Zutat in einen vorhandenen Artikel
  hineingerechnet, bekommt der das Gericht dazu
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
  öffnet das Rezeptbuch (nach Gruppen: Nudeln & Pasta, Suppen & Eintöpfe,
  Salate …). Ob ein Gericht **frisch** gekocht wird oder aus dem **Vorrat**
  kommt, steht unabhängig davon am Rezept (🥗 / 🥫). Ein Tipp zeigt die Zutaten – dort wird abgewählt, was schon zu
  Hause ist, und die Menge für **diesen einen Einkauf** angepasst. Das Rezept
  selbst bleibt davon unberührt; über den Stift ✎ wird es dauerhaft geändert
  oder neu angelegt. **Innerhalb jeder Gruppe steht oben, was am längsten nicht
  auf der Liste war** – nie gewählte Rezepte zuerst, darunter „zuletzt vor 6
  Wochen“ bis „zuletzt heute“. Nur beim Ordnen (⠿) gilt die Reihenfolge des
  Rezeptbuchs. Über der Liste filtern „Alle · 🥗 Frisch · 🥫 Vorrat“ (und
  „Offen“, solange Rezepte ohne Angabe da sind) – im Fenster wie auf der Seite
- **Diese Woche** (oben, mit Zahl): jedes Rezept, das auf die Liste kommt, ist
  ein geplantes Gericht. Sortiert nach 🥗 Frisch, 🥫 Vorrat und „noch nicht
  festgelegt“, darin das am längsten Eingeplante zuerst; mehr als sieben und
  dasselbe Gericht zweimal sind kein Problem. Ein Tipp schlägt das Rezept auf.
  Gerichte gehen **nur von Hand**: „✓ Gekocht“ entfernt ohne Rückfrage, ein paar
  Sekunden lang steht „Rückgängig“ da
- **Rezeptbuch** als eigener Bereich oben („Einkauf | Diese Woche | Rezeptbuch“): zum
  Nachschlagen beim Kochen. Ein Rezept zeigt Gruppe, Frisch/Vorrat, Zutaten und
  **Notizen** (Zubereitung, Portionen, ein Link zum Original wird antippbar).
  „Zum Einkauf hinzufügen“ führt in denselben Schritt wie das Fenster auf der
  Liste. Das aufgeschlagene Rezept steht in der Adresse (`/rezepte/<id>`), die
  Zurück-Geste des Handys führt also zur Übersicht
- **Regale live sortieren**: während des Einkaufs steht unter der Liste leise
  „🛒 Markt · Regale sortieren“. Das Fenster zeigt zuerst nur die Kategorien,
  die heute wirklich auf der Liste stehen (mit Anzahl); am Griff ⠿ verschoben
  sortiert sich die Liste sofort um und der Markt merkt es sich dauerhaft
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

### Wo die Daten liegen

Fünf Dateien, jede mit genau einer Aufgabe – alle auf dem Host, keine im Image:

| Datei | Inhalt | im git |
| --- | --- | --- |
| `data/state.json` | die Einkaufslisten, die Historie nicht zugeordneter Namen, wann welches Rezept zuletzt gewählt wurde (`zuletzt`) und die Gerichte für „Diese Woche“ (`woche`) | nein |
| `export/katalog.json` | der Artikelkatalog | **ja** |
| `export/maerkte.json` | die Märkte (Kategorie-Reihenfolge je Filiale) | **ja** |
| `export/rezepte.json` | das Rezeptbuch | **ja** |
| `export/rezeptgruppen.json` | die Gruppen des Rezeptbuchs | **ja** |

Die vier Dateien unter `export/` **sind** die Daten – keine Kopie, kein Seed,
aus dem etwas nachgezogen wird, keine zweite Fassung im State. Was im
Arbeitsverzeichnis steht, ist genau das, was die App gerade benutzt; ein
`git diff` zeigt, was sich seit dem letzten Commit geändert hat.

**Wann wird geschrieben?** Sofort im selben Request. Kein Puffer, kein
Zeitplan: was in der App zu sehen ist, steht auf der Platte. Geschrieben wird
über eine temporäre Datei plus `rename` (ein Absturz mitten im Schreiben kann
also nichts halb beschriften) und nur, wenn sich am Inhalt etwas geändert hat –
ein Haken auf der Einkaufsliste fasst `katalog.json` nicht an.

**Andersherum genauso**: der Server beobachtet das Verzeichnis. Wird eine der
Dateien ersetzt – von Hand oder mit `git checkout` – liest er sie neu ein
und schickt den Stand an alle offenen Geräte. Ein Neustart ist dafür nicht
nötig. Das läuft über inotify, kostet im Leerlauf also nichts; eigene
Schreibvorgänge erkennt er am Inhalt und ignoriert sie.

Der Container läuft als `1000:1000` (siehe
[docker-compose.yml](docker-compose.yml)), damit die Dateien dir gehören und
nicht root – sonst käme weder der Editor noch `git checkout` an sie heran.

**Ins git kommen sie nicht von allein** – das wäre ein Commit pro Einkauf.
Dafür gibt es [scripts/katalog-sichern.sh](scripts/katalog-sichern.sh): es
committet ausschließlich die Dateien unter `export/`, wenn sich etwas
geändert hat, und pusht nicht (das Repo ist öffentlich). Ein systemd-Timer
erledigt das täglich um 03:20, zehn Minuten bevor `backup-sync` die Backups der
anderen Apps in die Nextcloud lädt:

```sh
sudo cp scripts/einkauf-katalog.service scripts/einkauf-katalog.timer /etc/systemd/system/
sudo systemctl enable --now einkauf-katalog.timer
systemctl list-timers einkauf-katalog.timer      # Kontrolle
einkaufsliste/scripts/katalog-sichern.sh         # oder jederzeit von Hand
```

Im `seed/` liegen nur noch die Kategorien der Einkaufsliste
([kategorien.json](seed/kategorien.json)). Sie sind ins Image gebacken und
ändern sich nur mit einem Deploy – anders als die Rezeptgruppen, die in der App
gepflegt werden.

Ein regelmäßiges Backup des ganzen Stands gibt es bewusst nicht: die Listen
selbst sind ersetzbar, alles andere liegt im git. Das alte Verzeichnis
`backups/` kann weg.

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
| POST | `/api/lists/:id/add-batch` | ganzes Rezept: neue Artikel und fortgeschriebene Mengen; mit `recipeId` gilt das Rezept als zuletzt gewählt, kommt in „Diese Woche“ und hängt an seinen Artikeln |
| POST / DELETE | `/api/woche[/:id]` | Gericht zurückholen („Rückgängig“) / als gekocht entfernen |
| POST / PUT / DELETE | `/api/recipes[/:id]` | Rezept anlegen / ändern / löschen |
| PUT | `/api/recipes/order` | Reihenfolge im Rezeptbuch |
| POST / PUT / DELETE | `/api/recipe-groups[/:id]` | Gruppe anlegen / umbenennen / löschen |
| PUT | `/api/lists/:id/shopping` | Einkauf starten: `{ shopping, storeProfileId }` |
| POST | `/api/lists/:id/finish` | „Einkauf beenden“: Abgehaktes löschen, Einkauf aus |
| POST | `/api/catalog` | `{ name, category_id }` dauerhaft zuordnen |
| POST | `/api/catalog/alias` | `{ name, alias }` – Schreibweise an einen Artikel hängen |
| PUT / DELETE | `/api/catalog` | Artikel anlegen bzw. überschreiben / löschen |
| DELETE | `/api/unmatched/:id` | nicht zugeordneten Namen verwerfen |

### Kategorien und Katalog

Die **Kategorien** liegen als Konfiguration im Image
([seed/kategorien.json](seed/kategorien.json) – ID, Emoji, Label) und gehen über
`/api/state` an den Browser, stehen also nirgends doppelt im Code. **Die
Reihenfolge dieser Datei ist die Standard-Reihenfolge im Laden**, `sonstiges`
hängt immer hinten und wird nie umsortiert.

Der **Katalog** steht in `export/katalog.json` – einer schlichten Liste aus
`{ name, aliases, category_id }`. Gelöscht ist gelöscht: es gibt keinen Seed
mehr, aus dem ein Artikel zurückkäme.

In der Verwaltung steht der **komplette** Katalog: suchen, Kategorie
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

Das Rezeptbuch steht in [export/rezepte.json](export/rezepte.json) – wie
Katalog und Märkte eine schlichte Liste:

```jsonc
[{ "name": "Porridge", "group": "suesses", "haltbarkeit": "vorrat",
   "ingredients": [{ "name": "Haferflocken", "quantity": "500 g" }] }]
```

`notes` ist Freitext und darf fehlen. `haltbarkeit` ist `"frisch"` (Zutaten schnell verbrauchen), `"vorrat"` (hält
sich länger) oder leer für „noch nicht festgelegt“ – und hängt nicht an der
Gruppe. Früher waren „Frisch“ und „Vorrat“ selbst Gruppen; fehlt die Angabe in
der Datei, liest der Server sie einmalig aus den alten Gruppen-IDs `frisch` und
`vorrat` und schreibt sie fest (`haltbarkeitVon` in [server.js](server.js)).

Die **Gruppen** (in der App „Kategorien“) stehen in
[export/rezeptgruppen.json](export/rezeptgruppen.json). Angelegt wird aus jeder
Kategorie-Auswahl heraus über „＋ Kategorie hinzufügen …“ – ein Emoji vorne im
Namen wird ihr Zeichen („🌮 Mexikanisch“) – oder unten beim Ordnen. Der Stift ✎
an der Überschrift benennt um, ändert das Zeichen oder löscht; beim Ordnen
stehen dafür auch leere Kategorien da. Eine Kategorie, in der noch Rezepte
liegen, wird nicht gelöscht. Beim Umbenennen bleibt die `id`, an der die
Rezepte hängen.

Die Reihenfolge in der Datei ist die Reihenfolge im Rezeptbuch. Umsortiert und
gelöscht wird über den ⠿-Knopf oben im Rezeptfenster („Rezeptbuch ordnen“).
Dort steht unter jedem Rezept auch seine Kategorie und Frisch/Vorrat zum
direkten Umstellen – viele Rezepte lassen sich so in einem Zug einsortieren.
Gezogen wird nur ohne Suche und Filter, sonst passten die Plätze nicht zum Buch;
gelöscht wird erst nach Rückfrage, und ohne Seed gibt es nichts, was ein
gelöschtes Rezept zurückholt.

Der Server beobachtet die Datei: von Hand ergänzte Rezepte sind sofort in der
App, ohne Neustart, und bekommen dabei ihre `id`. Umgekehrt schreibt jede
Änderung in der App die Datei neu. Nur die Gruppen kommen weiterhin aus
[export/rezeptgruppen.json](export/rezeptgruppen.json).

Gelöscht ist gelöscht: ohne Seed gibt es nichts, was ein entferntes Rezept
wieder zurückholt.

Steht eine Zutat schon auf der Liste, sind zwei Zeilen mit demselben Artikel das
Letzte, was im Laden hilft. Deshalb:

- **Erkannt** wird die Dopplung über den Katalogartikel, nicht über den Text –
  „Kirschtomaten“ auf der Liste und „Cherrytomaten“ im Rezept sind dasselbe.
  Abgehaktes zählt nicht mit: was im Wagen liegt, ist erledigt.
- **Zusammengelegt** werden Mengen nur bei gleicher Einheit: `250 g` + `200 g`
  wird `450 g`, `2 Stück` + `1 St.` wird `3 St.`. Unterschiedliche Einheiten
  stehen nebeneinander: `1 Packung + 200 g`. Eine erfundene Umrechnung wäre im
  Laden schlimmer als beide Angaben zu sehen (`mengenZusammenfassen` in
  [mengen.ts](src/utils/mengen.ts)).
- **Nicht angehängt**: eine schon zusammengelegte Angabe wird beim nächsten Mal
  wieder in ihre Teile zerlegt, gleiche Einheiten summiert und jede
  Freitext-Angabe nur einmal behalten. Zwölf Rezepte mit „nach Geschmack“
  ergeben „nach Geschmack“ – die erste Fassung hängte stur an und produzierte
  Zeilen mit 26 Gliedern, die den Artikelnamen aus der Zeile drückten.
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
⠿ ziehen); gewählt wird der Markt beim „Einkauf starten“.
`categoryOrderFor()` in
[useEinkaufStore.ts](src/composables/useEinkaufStore.ts) zieht die Kategorien
des aktiven Marktes nach vorn, hängt alles nicht Genannte in
Standard-Reihenfolge an und `sonstiges` ganz ans Ende. Neue Kategorien im Seed
tauchen dadurch auch in bestehenden Märkten auf, ohne dass dort etwas
nachgetragen werden muss. Welcher Markt gilt, steht pro Liste in
`storeProfileId`, und ob gerade eingekauft wird, in `shopping` – beides im
Serverstand, damit beide Handys denselben Laden sehen, wenn sie zusammen
losgehen.

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
