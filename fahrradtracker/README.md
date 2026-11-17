# Fahrradtracker

Verschleißtracker für Fahrradteile: Kette, Kassette, Bremsbeläge und was sonst
noch verschleißt, mit den Kilometern aus den eigenen Fahrten. Mehrere
Profile, mehrere Räder, erreichbar unter
`https://tshomeserv.duckdns.org/fahrrad/`.

## Funktionen

- **Profile mit PIN**: Der Startbildschirm fragt „Wer nutzt gerade?“. Jedes
  Profil hat vier bis sechs Ziffern als PIN – die App ist von außen erreichbar,
  und ohne diese Bremse stünde alles offen. Nach der Eingabe merkt sich das
  Gerät die Sitzung, „Abmelden“ oben rechts löscht sie wieder
- **Geführtes Onboarding**: Name → PIN → Fahrten-Quelle verbinden. Wer den letzten
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
- **Standardräder**: „ab 07.10. draußen das Propel, auf der Rolle weiter das
  Scott“ – je Art eine kleine Zeitleiste entscheidet, auf welches Rad eine
  Fahrt gebucht wird. Abweichungen (ein Regentag mit dem alten Rad) werden an
  der Fahrt selbst umgestellt. Ein Rad hat nur ein „genutzt ab“; davor bekommt
  es keine Fahrt
- **Aufbauten**: dasselbe Rad draußen und auf der Rolle. Teile hängen an
  Aufbauten, nicht am Rad als Ganzem – die Kette an beiden, jede Kassette an
  ihrem. So verschleißt eine Rollenfahrt genau die Teile, die dabei mitlaufen
- **Fahrten**: geholt aus der verbundenen Quelle oder von Hand nachgetragen.
  Beide zählen gleich; die Liste zeigt, was woher kam und was (noch) an keinem
  Rad hängt
- **Quellen**: jedes Profil verbindet sein eigenes Konto per OAuth –
  [Wahoo Cloud API](https://cloud-api.wahooligan.com/) als kurzer Weg,
  [Intervals.icu](https://intervals.icu) als zweite Möglichkeit. Fertige
  Fahrten meldet die Quelle per Webhook; zusätzlich fragt der Server alle drei
  Stunden selbst nach
- **Stats**: eigene Seite mit Kilometer-Dashboard – Monatsbalken (draußen und
  Rolle getrennt), Jahresvergleich, die letzten Wochen, Kilometer je Rad und die
  längsten Fahrten
- **Wechselintervall**: Ketten, die im Wechsel gefahren und gewachst werden,
  brauchen kein Verschleißlimit, sondern eine Erinnerung alle paar hundert
  Kilometer. Je Kategorie einstellbar (Kette: 500 km), gezählt **seit dem
  letzten Aufziehen**; die Kachel warnt, wenn es so weit ist
- **Benachrichtigungen**: E-Mail, wenn ein Teil das Wechselintervall erreicht,
  auf gelb springt oder rot wird – Empfänger je Profil in der Verwaltung
- **Rechte**: sehen darf jedes angemeldete Profil alles, ändern nur der
  Besitzer – seine Räder, seine Teile, seine Fahrten, seine Verbindungen.
  Kategorien und Ampel gelten für alle

## Technik

- Frontend: Vue 3 + TypeScript + Vite (Base-Pfad `/fahrrad/`)
- Backend: Express ([server.js](server.js)), Port 2609
- Persistenz: je ein JSON-Modell pro Datei unter `data/`, atomar geschrieben
  (erst `.tmp`, dann `rename`)
- Quellen: Wahoo Cloud API (OAuth2, `GET /v1/workouts` mit `workout_summary`)
  und Intervals.icu (OAuth2, `GET /api/v1/athlete/{id}/activities`)

### Wo die Daten liegen

Alle Dateien liegen auf dem Host, keine im Image, und **keine im git**: dort
stehen PIN-Hashes, Wahoo-Tokens und die geholten Fahrten drin.

| Datei | Inhalt |
| --- | --- |
| `data/users.json` | Profile: Name, Farbe, PIN als scrypt-Hash mit eigenem Salt |
| `data/wahoo.json` | je Profil die OAuth-Tokens, Wahoo-User-Id und der letzte Sync |
| `data/sessions.json` | angemeldete Geräte (nur der SHA-256-Hash des Tokens) |
| `data/bikes.json` | Räder mit Besitzer, „genutzt ab“ und Grenzwerten je Kategorie |
| `data/standards.json` | Standardräder: ab welchem Tag welches Rad für draußen bzw. die Rolle gilt |
| `data/component-types.json` | Kategorien: Name, Symbol, Farbe, Standard-Grenzwert |
| `data/components.json` | die Instanzen samt ihren Nutzungszeiträumen |
| `data/rides.json` | alle Fahrten – geholte wie von Hand eingetragene |
| `data/settings.json` | Ampel-Schwellen und Sync-Takt |

Beim allerersten Start kommen die Kategorien aus [seed/teile.json](seed/teile.json);
danach werden sie in der App gepflegt und die Seed-Datei nie wieder gelesen.

**Die Kilometer stehen nirgends.** Sie werden bei jeder Anfrage aus den Fahrten
summiert. Gerechnet wird in [shared/fahrten.js](shared/fahrten.js) – die Datei
kennt nur Fahrten, Räder, Aufbauten und Zeiträume und nichts von einem
Anbieter, damit ein Wechsel der Quelle die Verschleißrechnung nicht anfasst.
Dieselbe Datei benutzen der Server und die Tests. Deshalb reicht es, ein Datum zu korrigieren –
alles Weitere ergibt sich daraus. Ein Zeitraum zählt beide Randtage mit; wird
an einem Tag gewechselt, zählt die Fahrt dieses Tages für das alte *und* das
neue Teil. Das ist die Variante, die nie Kilometer verschluckt.

Es gibt bewusst **keinen Live-Sync** wie bei der Einkaufsliste: hier ändert
selten jemand etwas, während ein anderer zuschaut. Der Browser holt sich den
Stand beim Zurückkommen auf die Seite, und die Kilometer wachsen ohnehin nur im
Takt der Fahrten.

### Welche Fahrt gehört zu welchem Rad?

Über die **Standardräder** des Profils – je Art (draußen / Rolle) eine
Zeitleiste unter **Räder → Standardräder**. Es gilt der jüngste Eintrag, der
nicht nach der Fahrt liegt:

```
Draußen   ab 2025-08-01  Scott Speedster
          ab 2026-10-07  Giant Propel
Rolle     ab 2025-08-01  Scott Speedster
```

Eine Fahrt draußen am 20.09.2026 geht damit aufs Scott, eine am 10.10.2026 aufs
Propel; Rollenfahrten bleiben beim Scott. Für eine Tour mit dem anderen Rad
(Bikepacking) trägt man zwei Wechsel ein – ab dem ersten Tag das Scott, ab dem
Tag danach wieder das Propel. Für **einzelne Ausnahmen** stellt man das Rad an
der Fahrt um; die Liste zeigt sie als „Ausnahme“, und diese Entscheidung
überlebt jeden weiteren Sync.

Jedes Rad hat ein **„genutzt ab“**. Davor bekommt es keine Fahrt – weder über
einen Standard-Eintrag noch von Hand; der Server lehnt beides ab. Findet sich
für einen Tag kein Standardrad, bleibt die Fahrt **unzugeordnet**: Sie steht in
der Liste und in einem Banner, statt still bei irgendeinem Rad zu landen.

Beim ersten Start nach der Umstellung baut der Server die Zeitleiste aus den
alten Nutzungszeiträumen: je Rad ein Eintrag „draußen ab seinem Start“ und,
wenn es eine Rolle hat, „Rolle ab seinem Start“. Das „genutzt bis“ fällt weg.

### Aufbauten: dasselbe Rad drinnen und draußen

Ein Rad hat einen oder zwei **Aufbauten** – „Draußen“ und, wer eine Rolle hat,
„Rolle“. Eine Fahrt landet über ihr Kennzeichen drinnen/draußen beim passenden
Aufbau, und **Teile hängen an Aufbauten**, nicht am Rad als Ganzem:

```
Scott Speedster
├── Draußen ── Kette A, Kettenblätter A, Innenlager A, Kassette A
└── Rolle ──── Kette A, Kettenblätter A, Innenlager A, Kassette B
```

Eine Rollenfahrt schreibt damit Kette, Kettenblätter und Lager fort, Kassette B
ebenso – Kassette A bleibt stehen. Bei einer Fahrt draußen ist es umgekehrt.
Welches Teil an welchem Aufbau mitfährt, steht im Teile-Fenster als Pillen zum
Antippen; ohne Angabe hängt ein neues Teil an allen Aufbauten seines Rades.

Deshalb dürfen auch mehrere Teile derselben Kategorie gleichzeitig aktiv sein.
Aufgezogen wird nur das verdrängt, was sich einen Aufbau teilt: Zwei Kassetten
sind kein Widerspruch, zwei Ketten am selben Aufbau schon.

### Fahrten von Hand

Alles vor dem ersten Gerät steht in keiner Quelle, die wir lesen dürfen. Unter
**Fahrten → + Fahrt** wird so etwas nachgetragen: Datum, Uhrzeit, Distanz,
Titel, drinnen/draußen und wahlweise ein Rad von Hand. Solche Fahrten sind als
„von Hand“ gekennzeichnet, zählen aber genau wie geholte, und nur sie lassen
sich hier ändern oder löschen – geholte Fahrten stehen beim Anbieter und kämen
beim nächsten Sync ohnehin wieder.

Der Kalendertag einer Fahrt kommt aus ihrer Startzeit in der Zeitzone des
Containers (`TZ=Europe/Berlin` in [docker-compose.yml](docker-compose.yml)).

### Fahrten aus einer Tabelle

Wer eine Liste alter Fahrten als CSV hat, liest sie unter **Fahrten → CSV**
ein. Nötig sind die Spalten `name,date,sport,distance_km`, dazu möglichst `id`;
`Ride` wird eine Fahrt draußen, `Virtual Ride` eine auf der Rolle, die Distanz
ist in Kilometern. Erst zeigt die Vorschau, was hereinkäme, dann wird
übernommen.

Zwei Eigenheiten solcher Exporte fängt der Import ab:

- **Die Reihenfolge im Datum** liest er aus der Datei selbst: Steht irgendwo
  eine Zahl über 12 an zweiter Stelle, kann das nur ein Tag sein – dann gilt
  `Jahr-Tag-Monat` (`2026-16-08`), sonst `Jahr-Monat-Tag`. Widersprechen sich
  die Zeilen, bricht er ab, statt zu raten. Auch `M/D/YYYY` wird gelesen.
- **Falsch gelesene Umlaute** (`RÃ¼ckfahrt`) dreht er zurück, wenn dabei
  gültiges UTF-8 herauskommt.

Wiedererkannt wird eine Zeile an der `id` aus dem Export – dieselbe Datei
zweimal einzulesen legt also nichts doppelt an, und was von Hand gelöscht
wurde, bleibt gelöscht. Ohne `id`-Spalte tut es die Kombination aus Datum, Name
und Distanz.

**„Nur vor dem"** blendet den Zeitraum aus, den eine angebundene Quelle bereits
vollständig hat: Dort ist deren Stand der genauere, und dieselbe Ausfahrt aus
zwei Quellen wären doppelte Kilometer. Steht in einem Export mehrfach dieselbe
Distanz am selben Tag, meldet die Vorschau das als Verdacht auf einen kaputten
Export – übernommen wird trotzdem nichts ungefragt.

### Was beim Holen liegen bleibt – und was 0 km bedeutet

Nicht jedes Workout beim Anbieter ist eine Fahrt:

- **Geplante Einheiten** aus einem Trainingsplan legt Wahoo als Workout an,
  auch wenn sie nie gefahren wurden – erkennbar an einer Plan-Id *ohne*
  Zusammenfassung. Die werden übersprungen; wird dieselbe Einheit gefahren,
  bekommt sie eine Zusammenfassung und kommt mit.
- **Fahrten ohne Distanz** gibt es wirklich: Rollenfahrten aus fremden Apps
  etwa laufen mit Dauer, aber ohne Kilometer bei Wahoo auf (auch der
  Einzelabruf liefert dort nichts). Sie werden übernommen und in der Liste als
  „ohne Distanz“ markiert. Die Kilometer lassen sich **von Hand nachtragen** –
  der Wert wird getrennt vom gemeldeten gespeichert und überlebt jeden weiteren
  Sync. Dasselbe gilt für die Rad-Zuordnung.

**Rollenfahrten aus MyWhoosh** sind der häufigste Fall: Bei Wahoo kommt nur
ein Eintrag mit Name und Dauer an – ohne Zusammenfassung, und selbst wo es eine
FIT-Datei gibt, steht darin keine Strecke. MyWhoosh lädt dieselbe Fahrt aber
auch direkt zu Intervals.icu hoch, mit der virtuellen Distanz. Mit
`INTERVALS_API_KEY` in der `.env` sucht der Server deshalb zu jeder Fahrt ohne
Distanz die passende Aktivität dort (gleicher Tag, Start höchstens 20 Minuten
auseinander; ohne Startzeit muss die Dauer passen) und übernimmt deren
Kilometer – nach jedem Sync mit neuen Fahrten und stündlich für die letzten 60
Tage, beim Start einmal über alles. Gespeichert wird das getrennt
(`kmErgaenzt`), die Liste zeigt „km von Intervals“, und ein von Hand
eingetragener Wert hat weiter Vorrang. Wahoo bleibt dabei die Quelle der
Fahrten; es wird nichts doppelt angelegt.

### Zwei Quellen, einmal Kilometer

Verbunden sein dürfen beide Quellen, **geholt wird immer nur aus einer** – der
aktiven. Die frisch verbundene wird es automatisch, umstellen lässt es sich in
der Verwaltung. Zusätzlich sitzt ein Dublettenschutz im Sync: Eine Fahrt, die
es am selben Tag mit fast gleicher Distanz schon aus der anderen Quelle gibt,
wird nicht ein zweites Mal angelegt.

Der Sync ist **idempotent**. Wiedererkannt wird eine Fahrt am Paar aus Anbieter
und Fremd-Id, nicht an Datum oder Distanz: Zweimal Holen legt nichts doppelt
an, eine drüben korrigierte Fahrt wird fortgeschrieben. Gelesen wird ein
Zeitfenster (letzter Lauf minus zwei Wochen, beim ersten Mal ab dem ältesten
Datum, das die App kennt), und innerhalb dieses Fensters wird abgeglichen: Was
der Anbieter dort nicht mehr führt, wird auch hier gelöscht. Fahrten von Hand
und die der anderen Quelle bleiben davon immer unberührt.

### Backups

Einmal täglich schreibt der Server einen Schnappschuss nach
`backups/fahrrad_<datum>.json` und behält die letzten 30 – dasselbe Muster wie
bei Kofferpacken und Donnerskat, damit
[backup-sync](../backup-sync) sie in die Nextcloud schieben kann. Die
Wahoo-Tokens bleiben draußen: das sind echte Zugangsdaten, und nach einer
Wiederherstellung ist „neu verbinden“ ein Klick.

### Quellen einrichten

**Wahoo** (der kurze Weg – das Gerät lädt direkt dorthin hoch):

1. Unter <https://developers.wahooligan.com/> eine Cloud-API-App anlegen,
   Redirect URI `https://tshomeserv.duckdns.org/fahrrad/api/wahoo/callback`
2. Webhook derselben App anschalten, URL
   `https://tshomeserv.duckdns.org/fahrrad/api/wahoo/webhook`, Token frei wählen
3. `WAHOO_CLIENT_ID`, `WAHOO_CLIENT_SECRET`, `WAHOO_WEBHOOK_TOKEN` in `.env`

Angefragt werden die Scopes `user_read workouts_read offline_data`
(`offline_data` ist die Voraussetzung dafür, dass der Webhook auch feuert, wenn
niemand die App offen hat). Access-Tokens laufen nach zwei Stunden ab und
werden beim Refresh mitsamt Refresh-Token getauscht; das neue Paar wird sofort
geschrieben.

**Intervals.icu** (zweite Quelle, optional): Die OAuth-App legt der Betreiber
auf Anfrage an (E-Mail an `david@intervals.icu`), danach steht sie unter
<https://intervals.icu/settings>. Redirect URI
`https://tshomeserv.duckdns.org/fahrrad/api/intervals/callback`, Scope
`ACTIVITY:READ`. Die Tokens dort laufen nicht ab und werden bei jeder neuen
Autorisierung ersetzt – ein Refresh-Token gibt es deshalb nicht.

Übernommen werden von dort nur Aktivitäten, die Intervals.icu als von **Wahoo**
hochgeladen führt. Was dort aus Strava stammt, ist über die Schnittstelle nur
ein Platzhalter ohne Distanz (`"_note": "STRAVA activities are not available
via the API"`) und wird übersprungen.

Ohne Zugangsdaten startet die App trotzdem – sie sagt dann nur überall, dass
die Verbindung fehlt.

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
| POST / PUT / DELETE | `/api/bikes[/:id]` | Rad anlegen (wahlweise gleich als Standard) / ändern / löschen |
| POST / PUT / DELETE | `/api/standards[/:id]` | Standardrad-Eintrag anlegen / verschieben / löschen |
| PUT | `/api/bikes/:id/limits/:typeId` | Grenzwert für eine Kategorie an diesem Rad (`null` = Standard) |
| POST | `/api/bikes/:id/setups` | Aufbau anlegen (`outdoor` / `indoor`) |
| PUT / DELETE | `/api/setups/:setupId` | Aufbau umbenennen / löschen |
| POST / PUT / DELETE | `/api/component-types[/:id]` | Kategorie anlegen / ändern / löschen |
| POST / PUT / DELETE | `/api/components[/:id]` | Teil anlegen / ändern (auch die Aufbauten) / löschen |
| POST | `/api/components/:id/install` | aufziehen (legt verdrängte Teile ein) |
| POST | `/api/components/:id/remove` | abziehen – ins Lager oder mit `entsorgen: true` |
| POST | `/api/components/:id/status` | eingelagert ⇄ entsorgt, ohne an den Zeiträumen zu rühren |
| PUT / DELETE | `/api/components/:id/periods/:periodId` | Zeitraum korrigieren / löschen |
| POST | `/api/rides` | Fahrt von Hand eintragen |
| PUT | `/api/rides/:id` | Ausnahme setzen (jede Fahrt), Werte ändern (nur von Hand eingetragene) |
| DELETE | `/api/rides/:id` | von Hand eingetragene Fahrt löschen |
| PUT | `/api/settings/thresholds` | Ampel-Schwellen |
| POST | `/api/sync` | jetzt holen (`{ voll: true }` = ganze Historie) |
| PUT | `/api/provider` | aus welcher Quelle geholt wird |
| GET | `/api/wahoo/authorize` · `/api/intervals/authorize` | Adresse für den OAuth-Absprung |
| GET | `/api/wahoo/callback` · `/api/intervals/callback` | Rücksprung (Browser, kein Token) |
| POST | `/api/wahoo/webhook` · `/api/intervals/webhook` | der Anbieter meldet eine Fahrt (Secret statt Sitzung) |
| DELETE | `/api/wahoo` · `/api/intervals` | Freigabe zurückziehen, Verbindung und ihre Fahrten löschen |

### Benachrichtigungen

Der Server prüft nach jedem Sync und stündlich, ob ein Teil eine Schwelle
überschritten hat, und schickt dem Profil eine Mail – eine je Ereignis:

| Ereignis | wann |
| --- | --- |
| Wechseln fällig | Kilometer seit dem Aufziehen ≥ Wechselintervall der Kategorie |
| Bald fällig | Verschleiß ≥ gelbe Schwelle (Standard 70 %) |
| Überfällig | Verschleiß ≥ rote Schwelle (Standard 100 %) |

Jede Meldung kommt **einmal je Einbau**: Der Vermerk hängt am laufenden
Nutzungszeitraum, nach einem Wechsel fängt alles von vorn an. Schlägt der
Versand fehl, werden die Vermerke zurückgenommen, damit es der nächste Lauf
erneut versucht.

Nötig sind `SMTP_HOST`, `SMTP_FROM` und je nach Server `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS` in der `.env` (siehe [.env.example](.env.example)) –
ohne sie startet die App normal, verschickt aber nichts und sagt das in der
Verwaltung. Die Empfängeradresse steht je Profil unter Verwaltung →
Einstellungen, dort gibt es auch eine Probemail. Die Vorlage liegt in
[mail.js](mail.js); sie ist reines HTML mit Inline-Styles, damit sie in jedem
Postfach gleich aussieht.

### Verschleißfaktor je Aufbau

Ein Kilometer auf der Rolle nutzt eine Kette anders ab als einer draußen im
Dreck. Jeder Aufbau hat deshalb einen Faktor (Standard 1): 0,95 heißt, 100 km
auf der Rolle zählen als 95 km Verschleiß. Er wirkt sofort auf alle Fahrten,
auch rückwirkend – gerechnet wird ja bei jeder Anfrage neu. Die gefahrene
Strecke eines Rades bleibt davon unberührt; die Frage „wie weit bin ich
gefahren“ hat mit Verschleiß nichts zu tun.

### Zugriffsschutz

Die PIN steht als scrypt-Hash mit eigenem Salt in `users.json` und wird nie im
Browser gehalten. Nach fünf Fehlversuchen ist ein Profil kurz gesperrt, und die
Sperre verdoppelt sich mit jedem weiteren Versuch (maximal 15 Minuten) – die
Zähler stehen nur im Speicher.

Der Browser bekommt nach dem Anmelden ein zufälliges Token in `localStorage`;
auf dem Server liegt davon nur der SHA-256-Hash. Sitzungen laufen nach 180
Tagen ohne Nutzung ab. Die OAuth-Tokens verlassen den Server nie – der Browser
sieht nur, *dass* eine Verbindung besteht.

Die beiden Webhooks sind die einzigen Routen ohne Sitzung. Sie prüfen das
Secret aus dem Rumpf gegen `WAHOO_WEBHOOK_TOKEN` bzw.
`INTERVALS_WEBHOOK_SECRET`; ohne gesetztes Secret wird jede Anfrage abgelehnt.
Angenommen wird nur, was sich einer bekannten, aktiven Verbindung zuordnen
lässt.

## Entwicklung

```sh
npm install
node server.js          # Backend auf 2609
npm run dev             # Frontend auf 5173, /fahrrad/api geht an 2609
npm run test:unit       # Ampel, Texte, Fahrten-Kern (Zuordnung, Sync, Teilung)
npm run lint
```
