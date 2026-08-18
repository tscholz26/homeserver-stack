# Fahrradtracker

Verschleißtracker für Fahrradteile: Kette, Kassette, Bremsbeläge und was sonst
noch verschleißt, mit den Kilometern aus den eigenen Wahoo-Fahrten. Mehrere
Profile, mehrere Räder, erreichbar unter
`https://tshomeserv.duckdns.org/fahrrad/`.

## Funktionen

- **Profile mit PIN**: Der Startbildschirm fragt „Wer nutzt gerade?“. Jedes
  Profil hat vier bis sechs Ziffern als PIN – die App ist von außen erreichbar,
  und ohne diese Bremse stünde alles offen. Nach der Eingabe merkt sich das
  Gerät die Sitzung, „Abmelden“ oben rechts löscht sie wieder
- **Geführtes Onboarding**: Name → PIN → Wahoo verbinden. Wer den letzten
  Schritt überspringt, bekommt im Dashboard ein Banner, bis die Verbindung
  nachgeholt ist – dasselbe gilt für alte Profile ohne Verbindung
- **Dashboard**: pro Rad eine Kachel je Kategorie (nicht je Teil) mit Ring,
  Prozent zur Grenze, Ampelfarbe und dem Hinweis, welche Instanz gerade
  aufgezogen ist. Die Räder aller Profile sind für alle sichtbar, ein
  Filter oben schaltet auf ein einzelnes Profil um
- **Teile-Fenster** (Klick auf eine Kachel, kein Seitenwechsel): Grenzwert für
  diese Kategorie an diesem Rad, alle Instanzen mit ihren Nutzungszeiträumen,
  Notiz, und die Wechsel – „Einlagern“, „Wieder aufziehen“, „Entsorgen“
- **Mehrfache Ein- und Ausbauten**: Kette 2 vom 04.04. bis 18.08., danach
  wieder Kette 1 – jede Instanz sammelt beliebig viele Zeiträume, die
  Kilometer sind deren Summe. Ein- und Ausbaudatum lassen sich nachträglich
  geraderücken, die Kilometer rechnen sich daraufhin neu
- **Automatischer Wechsel**: Wird ein Teil aufgezogen, wandert das bisher
  aktive derselben Kategorie am selben Rad ins Lager – *eingelagert*, nicht
  entsorgt. Es lässt sich jederzeit wieder aufziehen. „Entsorgt“ setzt nur, wer
  es ausdrücklich anklickt
- **Ampel**: grün / gelb / rot, die Schwellen (Standard 70 % und 100 %) stehen
  in der Verwaltung und nicht im Code
- **Wahoo**: jedes Profil verbindet sein eigenes Konto per OAuth
  ([Cloud API](https://cloud-api.wahooligan.com/)). Fertige Fahrten meldet
  Wahoo per Webhook; zusätzlich fragt der Server alle drei Stunden selbst nach.
  Die Zuordnung zum Rad läuft über die Sportart (siehe unten)
- **Rechte**: sehen darf jedes angemeldete Profil alles, ändern nur der
  Besitzer – seine Räder, seine Teile, seine Wahoo-Verbindung. Kategorien und
  Ampel gelten für alle

## Technik

- Frontend: Vue 3 + TypeScript + Vite (Base-Pfad `/fahrrad/`)
- Backend: Express ([server.js](server.js)), Port 2609
- Persistenz: je ein JSON-Modell pro Datei unter `data/`, atomar geschrieben
  (erst `.tmp`, dann `rename`)
- Wahoo Cloud API (OAuth2, `GET /v1/workouts` mit `workout_summary`)

### Wo die Daten liegen

Alle Dateien liegen auf dem Host, keine im Image, und **keine im git**: dort
stehen PIN-Hashes, Wahoo-Tokens und die geholten Fahrten drin.

| Datei | Inhalt |
| --- | --- |
| `data/users.json` | Profile: Name, Farbe, PIN als scrypt-Hash mit eigenem Salt |
| `data/wahoo.json` | je Profil die OAuth-Tokens, Wahoo-User-Id und der letzte Sync |
| `data/sessions.json` | angemeldete Geräte (nur der SHA-256-Hash des Tokens) |
| `data/bikes.json` | Räder mit Besitzer, zugeteilten Sportarten und Grenzwerten je Kategorie |
| `data/component-types.json` | Kategorien: Name, Symbol, Farbe, Standard-Grenzwert |
| `data/components.json` | die Instanzen samt ihren Nutzungszeiträumen |
| `data/activities.json` | die geholten Fahrten (Datum, km, Dauer, Sportart) |
| `data/settings.json` | Ampel-Schwellen und Sync-Takt |

Beim allerersten Start kommen die Kategorien aus [seed/teile.json](seed/teile.json);
danach werden sie in der App gepflegt und die Seed-Datei nie wieder gelesen.

**Die Kilometer stehen nirgends.** Sie werden bei jeder Anfrage aus den Fahrten
summiert: alle Fahrten des Rades innerhalb der Nutzungszeiträume der Instanz.
Gerechnet wird in [shared/aktivitaeten.js](shared/aktivitaeten.js) – die Datei
kennt nur `{ userId, date, km, workoutTypeId }` und nichts vom Anbieter, damit
ein weiterer Wechsel der Quelle die Verschleißrechnung nicht anfasst. Deshalb reicht es, ein Datum zu korrigieren –
alles Weitere ergibt sich daraus. Ein Zeitraum zählt beide Randtage mit; wird
an einem Tag gewechselt, zählt die Fahrt dieses Tages für das alte *und* das
neue Teil. Das ist die Variante, die nie Kilometer verschluckt.

Es gibt bewusst **keinen Live-Sync** wie bei der Einkaufsliste: hier ändert
selten jemand etwas, während ein anderer zuschaut. Der Browser holt sich den
Stand beim Zurückkommen auf die Seite, und die Kilometer wachsen ohnehin nur im
Takt der Fahrten.

### Welche Fahrt gehört zu welchem Rad?

Die Wahoo Cloud API hängt an eine Fahrt keine Ausrüstung – es gibt kein „Gear“
und keine Rad-ID. Die Zuordnung läuft deshalb über die **Sportart**
(`workout_type_id`): In der Verwaltung bekommt jedes Rad die Sportarten
zugeteilt, die zu ihm gehören (Rennrad → *Rennrad*, *Radfahren*; MTB →
*Mountainbike*; Rolle → *Indoor-Trainer*). Eine Sportart hängt immer nur an
**einem** Rad je Profil – der Server nimmt sie beim Zuteilen den anderen Rädern
weg, sonst zählte dieselbe Fahrt doppelt.

Was an keinem Rad hängt, verschwindet nicht still: der Reiter „Wahoo“ listet
diese Sportarten mit Anzahl und Kilometern auf. Wird sie später zugeteilt,
zählen ihre Fahrten rückwirkend mit – gerechnet wird ja bei jeder Anfrage neu.

Der Kalendertag einer Fahrt kommt aus `starts` in der Zeitzone des Containers
(`TZ=Europe/Berlin` in [docker-compose.yml](docker-compose.yml)).

### Backups

Einmal täglich schreibt der Server einen Schnappschuss nach
`backups/fahrrad_<datum>.json` und behält die letzten 30 – dasselbe Muster wie
bei Kofferpacken und Donnerskat, damit
[backup-sync](../backup-sync) sie in die Nextcloud schieben kann. Die
Wahoo-Tokens bleiben draußen: das sind echte Zugangsdaten, und nach einer
Wiederherstellung ist „neu verbinden“ ein Klick.

### Wahoo einrichten

1. Unter <https://developers.wahooligan.com/> eine Cloud-API-App anlegen und als
   **Redirect URI** `https://tshomeserv.duckdns.org/fahrrad/api/wahoo/callback`
   eintragen
2. Optional den **Webhook** derselben App anschalten, URL
   `https://tshomeserv.duckdns.org/fahrrad/api/wahoo/webhook`, dazu einen frei
   gewählten Token
3. `.env.example` nach `.env` kopieren, `WAHOO_CLIENT_ID`,
   `WAHOO_CLIENT_SECRET` und – falls eingerichtet – `WAHOO_WEBHOOK_TOKEN`
   eintragen
4. `docker compose up -d --build`

Ohne Client-ID und -Secret startet die App trotzdem – sie sagt dann nur überall,
dass die Verbindung fehlt.

Angefragt werden die Scopes `user_read workouts_read offline_data`
(`offline_data` ist die Voraussetzung dafür, dass der Webhook auch feuert, wenn
niemand die App offen hat). Access-Tokens laufen nach zwei Stunden ab und
werden beim Refresh mitsamt Refresh-Token getauscht; das neue Paar wird sofort
geschrieben. Zieht jemand die Freigabe zurück, merkt sich der Server das und
die Oberfläche bittet ums Neuverbinden, statt still nichts mehr zu holen.

### API

Alles außer der Profilliste und dem Anmelden verlangt den Sitzungs-Token als
`Authorization: Bearer …`. Jede Änderung geht einzeln raus; der Server
antwortet mit dem kompletten neuen Stand.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/profiles` | Profile für den Auswahlschirm (Name, Farbe) |
| POST | `/api/profiles` | Profil anlegen (Name + PIN), meldet gleich an |
| POST | `/api/profiles/:id/login` | PIN prüfen, Sitzung beginnen |
| POST | `/api/logout` | Sitzung dieses Geräts beenden |
| GET | `/api/state` | kompletter Stand inklusive gerechneter Kilometer |
| PUT | `/api/profile` · `/api/profile/pin` | Name und Farbe · PIN ändern |
| POST / PUT / DELETE | `/api/bikes[/:id]` | Rad anlegen / ändern / löschen |
| PUT | `/api/bikes/:id/limits/:typeId` | Grenzwert für eine Kategorie an diesem Rad (`null` = Standard) |
| POST / PUT / DELETE | `/api/component-types[/:id]` | Kategorie anlegen / ändern / löschen |
| POST / PUT / DELETE | `/api/components[/:id]` | Teil anlegen / ändern / löschen |
| POST | `/api/components/:id/install` | aufziehen (legt das bisher aktive Teil ein) |
| POST | `/api/components/:id/remove` | abziehen – ins Lager oder mit `entsorgen: true` |
| POST | `/api/components/:id/status` | eingelagert ⇄ entsorgt, ohne an den Zeiträumen zu rühren |
| PUT / DELETE | `/api/components/:id/periods/:periodId` | Zeitraum korrigieren / löschen |
| PUT | `/api/settings/thresholds` | Ampel-Schwellen |
| GET | `/api/wahoo/authorize` | Adresse für den OAuth-Absprung |
| GET | `/api/wahoo/callback` | Rücksprung von Wahoo (Browser, kein Token) |
| POST | `/api/wahoo/sync` | jetzt holen (Seitenweise, zwei Wochen Nachlauf) |
| POST | `/api/wahoo/webhook` | Wahoo meldet eine fertige Fahrt (Token statt Sitzung) |
| DELETE | `/api/wahoo` | Freigabe bei Wahoo zurückziehen, Verbindung und Fahrten löschen |

### Zugriffsschutz

Die PIN steht als scrypt-Hash mit eigenem Salt in `users.json` und wird nie im
Browser gehalten. Nach fünf Fehlversuchen ist ein Profil kurz gesperrt, und die
Sperre verdoppelt sich mit jedem weiteren Versuch (maximal 15 Minuten) – die
Zähler stehen nur im Speicher.

Der Browser bekommt nach dem Anmelden ein zufälliges Token in `localStorage`;
auf dem Server liegt davon nur der SHA-256-Hash. Sitzungen laufen nach 180
Tagen ohne Nutzung ab. Die Wahoo-Tokens verlassen den Server nie – der Browser
sieht nur, *dass* eine Verbindung besteht.

Der Webhook ist die einzige Route ohne Sitzung. Sie prüft den
`webhook_token` aus dem Rumpf gegen `WAHOO_WEBHOOK_TOKEN`; ohne gesetzten Token
wird jede Anfrage abgelehnt. Angenommen wird nur, was sich einer bekannten
Wahoo-User-Id zuordnen lässt.

## Entwicklung

```sh
npm install
node server.js          # Backend auf 2609
npm run dev             # Frontend auf 5173, /fahrrad/api geht an 2609
npm run test:unit       # Ampel- und Textlogik
npm run lint
```
