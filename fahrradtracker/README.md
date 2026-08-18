# Fahrradtracker

Verschleißtracker für Fahrradteile: Kette, Kassette, Bremsbeläge und was sonst
noch verschleißt, mit den Kilometern aus den eigenen Strava-Fahrten. Mehrere
Profile, mehrere Räder, erreichbar unter
`https://tshomeserv.duckdns.org/fahrrad/`.

## Funktionen

- **Profile mit PIN**: Der Startbildschirm fragt „Wer nutzt gerade?“. Jedes
  Profil hat vier bis sechs Ziffern als PIN – die App ist von außen erreichbar,
  und ohne diese Bremse stünde alles offen. Nach der Eingabe merkt sich das
  Gerät die Sitzung, „Abmelden“ oben rechts löscht sie wieder
- **Geführtes Onboarding**: Name → PIN → Strava verbinden. Wer den letzten
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
- **Strava**: jedes Profil verbindet sein eigenes Konto per OAuth. Der Server
  fragt alle drei Stunden nach neuen Fahrten; die Zuordnung zum Rad läuft über
  Stravas `gear_id`, gepflegt wird das Gear in Strava selbst
- **Rechte**: sehen darf jedes angemeldete Profil alles, ändern nur der
  Besitzer – seine Räder, seine Teile, seine Strava-Verbindung. Kategorien und
  Ampel gelten für alle

## Technik

- Frontend: Vue 3 + TypeScript + Vite (Base-Pfad `/fahrrad/`)
- Backend: Express ([server.js](server.js)), Port 2609
- Persistenz: je ein JSON-Modell pro Datei unter `data/`, atomar geschrieben
  (erst `.tmp`, dann `rename`)
- Strava API v3 (OAuth2, `/athlete/activities` inklusive `gear_id`)

### Wo die Daten liegen

Alle Dateien liegen auf dem Host, keine im Image, und **keine im git**: dort
stehen PIN-Hashes, Strava-Tokens und die geholten Fahrten drin.

| Datei | Inhalt |
| --- | --- |
| `data/users.json` | Profile: Name, Farbe, PIN als scrypt-Hash mit eigenem Salt |
| `data/strava.json` | je Profil die OAuth-Tokens, Athleten-ID und der letzte Sync |
| `data/sessions.json` | angemeldete Geräte (nur der SHA-256-Hash des Tokens) |
| `data/bikes.json` | Räder mit Besitzer, Strava-Gear-ID und Grenzwerten je Kategorie |
| `data/component-types.json` | Kategorien: Name, Symbol, Farbe, Standard-Grenzwert |
| `data/components.json` | die Instanzen samt ihren Nutzungszeiträumen |
| `data/activities.json` | die geholten Strava-Fahrten (Datum, km, Gear) |
| `data/settings.json` | Ampel-Schwellen und Sync-Takt |

Beim allerersten Start kommen die Kategorien aus [seed/teile.json](seed/teile.json);
danach werden sie in der App gepflegt und die Seed-Datei nie wieder gelesen.

**Die Kilometer stehen nirgends.** Sie werden bei jeder Anfrage aus den Fahrten
summiert: alle Fahrten des Rades (über die Gear-ID) innerhalb der
Nutzungszeiträume der Instanz. Deshalb reicht es, ein Datum zu korrigieren –
alles Weitere ergibt sich daraus. Ein Zeitraum zählt beide Randtage mit; wird
an einem Tag gewechselt, zählt die Fahrt dieses Tages für das alte *und* das
neue Teil. Das ist die Variante, die nie Kilometer verschluckt.

Es gibt bewusst **keinen Live-Sync** wie bei der Einkaufsliste: hier ändert
selten jemand etwas, während ein anderer zuschaut. Der Browser holt sich den
Stand beim Zurückkommen auf die Seite, und die Kilometer wachsen ohnehin nur im
Takt des Strava-Syncs.

### Backups

Einmal täglich schreibt der Server einen Schnappschuss nach
`backups/fahrrad_<datum>.json` und behält die letzten 30 – dasselbe Muster wie
bei Kofferpacken und Donnerskat, damit
[backup-sync](../backup-sync) sie in die Nextcloud schieben kann. Die
Strava-Tokens bleiben draußen: das sind echte Zugangsdaten, und nach einer
Wiederherstellung ist „neu verbinden“ ein Klick.

### Strava einrichten

1. Unter <https://www.strava.com/settings/api> eine Anwendung anlegen,
   „Authorization Callback Domain“ auf `tshomeserv.duckdns.org` setzen
2. `.env.example` nach `.env` kopieren, `STRAVA_CLIENT_ID` und
   `STRAVA_CLIENT_SECRET` eintragen
3. `docker compose up -d --build`

Ohne die beiden Werte startet die App trotzdem – sie sagt dann nur überall,
dass die Verbindung fehlt.

In Strava muss jedes Rad als **Gear** gepflegt und den Fahrten zugeordnet sein.
Die Verwaltung liest die Gear-Liste live aus dem verbundenen Konto; wie viele
Fahrten ohne Zuordnung angekommen sind, steht im Reiter „Strava“.

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
| GET | `/api/strava/authorize` | Adresse für den OAuth-Absprung |
| GET | `/api/strava/callback` | Rücksprung von Strava (Browser, kein Token) |
| POST | `/api/strava/sync` | jetzt holen |
| GET | `/api/strava/gear` | Gear-Liste des verbundenen Kontos |
| DELETE | `/api/strava` | Verbindung und geholte Fahrten löschen |

### Zugriffsschutz

Die PIN steht als scrypt-Hash mit eigenem Salt in `users.json` und wird nie im
Browser gehalten. Nach fünf Fehlversuchen ist ein Profil kurz gesperrt, und die
Sperre verdoppelt sich mit jedem weiteren Versuch (maximal 15 Minuten) – die
Zähler stehen nur im Speicher.

Der Browser bekommt nach dem Anmelden ein zufälliges Token in `localStorage`;
auf dem Server liegt davon nur der SHA-256-Hash. Sitzungen laufen nach 180
Tagen ohne Nutzung ab. Die Strava-Tokens verlassen den Server nie.

## Entwicklung

```sh
npm install
node server.js          # Backend auf 2609
npm run dev             # Frontend auf 5173, /fahrrad/api geht an 2609
npm run test:unit       # Ampel- und Textlogik
npm run lint
```
