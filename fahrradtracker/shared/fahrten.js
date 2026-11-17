/**
 * Der Kern der Verschleißrechnung – bewusst ohne Bezug zum Anbieter und ohne
 * Zugriff auf Dateien, damit er sich einzeln testen lässt.
 *
 * Die Kette lautet:
 *
 *     Fahrt → Rad (Standardrad an dem Tag, oder von Hand) → Aufbau → Teile
 *
 * Welches Rad eine Fahrt bekommt, entscheiden die **Standardräder** des
 * Profils: je Art (draußen / Rolle) eine kleine Zeitleiste – „ab 07.10.2026
 * draußen das Propel“, „ab 01.08.2025 auf der Rolle das Scott“. Der jüngste
 * Eintrag, der vor der Fahrt liegt, gilt. Was davon abweicht – ein Regentag
 * mit dem alten Rad –, wird an der Fahrt selbst umgestellt. Ein Rad hat einen
 * oder mehrere Aufbauten („Draußen“, „Rolle“), und ein Teil hängt an beliebig
 * vielen Aufbauten – so verschleißt dieselbe Kette drinnen wie draußen,
 * während jede Kassette nur an ihrem eigenen Aufbau zählt.
 */

// ── Anbieter ─────────────────────────────────────────────────────────────────
// Die Fahrten können aus mehreren Quellen kommen; die Verschleißrechnung merkt
// davon nichts. Jede Fahrt trägt, woher sie stammt (`externalProvider`) und
// welche Id sie dort hat – damit lässt sie sich beim nächsten Lauf
// wiedererkennen, statt ein zweites Mal angelegt zu werden.
export const ANBIETER = {
  wahoo: 'wahoo',
  intervals: 'intervals.icu',
}

/** Fahrten draußen – Kilometer auf der Straße. */
export const DRAUSSEN_TYPEN = [
  'Ride',
  'GravelRide',
  'MountainBikeRide',
  'EBikeRide',
  'Handcycle',
  'Velomobile',
]

/** Fahrten auf der Rolle – gleiche Kette, andere Kassette. */
export const DRINNEN_TYPEN = ['VirtualRide']

export function istRadfahrt(typ) {
  return DRAUSSEN_TYPEN.includes(typ) || DRINNEN_TYPEN.includes(typ)
}

/**
 * Eine Aktivität von Intervals.icu in unsere Fahrt übersetzen – oder `null`,
 * wenn sie nichts für uns ist.
 *
 * Intervals.icu führt auch Aktivitäten, die aus Strava stammen. Die sind über
 * die API nur Platzhalter ohne Distanz („STRAVA activities are not available
 * via the API“), also nehmen wir ausschließlich, was von Wahoo kommt. Fahrten
 * aus der Zeit davor werden von Hand nachgetragen.
 */
export function ausIntervals(aktivitaet, ownerId) {
  if (!aktivitaet || typeof aktivitaet !== 'object') return null
  if (String(aktivitaet.source ?? '').toUpperCase() !== 'WAHOO') return null
  if (!istRadfahrt(aktivitaet.type)) return null

  const id = String(aktivitaet.id ?? '')
  const start = String(aktivitaet.start_date_local ?? '')
  const datum = start.slice(0, 10)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null

  const meter = Number(aktivitaet.distance) || 0
  return {
    ownerId,
    date: datum,
    time: start.slice(11, 16) || null,
    km: Math.round(meter / 10) / 100,
    minutes: Math.round((Number(aktivitaet.moving_time ?? aktivitaet.elapsed_time) || 0) / 60),
    name: String(aktivitaet.name ?? '').slice(0, 80),
    indoor: DRINNEN_TYPEN.includes(aktivitaet.type),
    source: 'INTERVALS_WAHOO',
    externalProvider: 'intervals.icu',
    externalActivityId: id,
    externalSource: 'WAHOO',
    activityType: String(aktivitaet.type ?? ''),
  }
}

// ── Wahoo ────────────────────────────────────────────────────────────────────
// Wahoos Workout-Typen. Die Zahlen entscheiden hier nur noch über drinnen oder
// draußen – welches Rad es war, sagt das Datum.
export const WAHOO_TYPEN = [
  { id: 0, name: 'Radfahren', indoor: false },
  { id: 11, name: 'Cyclocross', indoor: false },
  { id: 12, name: 'Indoor', indoor: true },
  { id: 13, name: 'Mountainbike', indoor: false },
  { id: 14, name: 'Liegerad', indoor: false },
  { id: 15, name: 'Rennrad', indoor: false },
  { id: 16, name: 'Bahn', indoor: false },
  { id: 21, name: 'Ergometer', indoor: true },
  { id: 49, name: 'Indoor-Cycling-Kurs', indoor: true },
  { id: 61, name: 'Indoor-Trainer', indoor: true },
  { id: 64, name: 'E-Bike', indoor: false },
  { id: 68, name: 'Indoor virtuell', indoor: true },
  { id: 70, name: 'Handbike', indoor: false },
]

/**
 * Ein Wahoo-Workout in unsere Fahrt übersetzen – oder `null`, wenn es keine
 * Radfahrt ist. Ohne `workout_summary` steht die Distanz noch nicht fest
 * (Wahoo trägt sie nach dem Hochladen nach); solche Workouts werden mit 0 km
 * übernommen und beim nächsten Lauf fortgeschrieben.
 *
 * `tagAus` übersetzt den Zeitstempel in einen Kalendertag – die Zeitzone
 * bestimmt, an welchem Tag eine späte Fahrt landet, und damit an welchem Rad.
 */
export function ausWahoo(workout, ownerId, tagAus) {
  if (!workout || typeof workout !== 'object') return null
  const typ = WAHOO_TYPEN.find((t) => t.id === Number(workout.workout_type_id))
  if (!typ) return null

  const summary = workout.workout_summary
  // Ein Trainingsplan legt für jede Einheit ein Workout an, auch für die, die
  // nie gefahren wurden – erkennbar an der Plan-Id ohne Zusammenfassung. Das
  // ist ein Vorhaben, keine Fahrt.
  const ausPlan = Boolean(workout.plan_id) || (workout.plan_ids ?? []).length > 0
  if (!summary && ausPlan) return null

  const id = String(workout.id ?? '')
  const datum = tagAus(workout.starts)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null

  const meter = Number(summary?.distance_accum ?? 0) || 0
  return {
    ownerId,
    date: datum,
    time: String(workout.starts ?? '').slice(11, 16) || null,
    km: Math.round(meter / 10) / 100,
    minutes: Math.round(Number(workout.minutes) || 0),
    name: String(workout.name ?? '').slice(0, 80),
    indoor: typ.indoor,
    // Es gibt gefahrene Workouts, für die Wahoo keine Distanz führt – etwa
    // Rollenfahrten aus fremden Apps. Die Fahrt ist echt, die Kilometer fehlen;
    // eintragen lassen sie sich von Hand.
    ohneDistanz: meter <= 0,
    source: 'WAHOO',
    externalProvider: ANBIETER.wahoo,
    externalActivityId: id,
    externalSource: 'WAHOO',
    activityType: typ.name,
  }
}

/**
 * Dieselbe Fahrt aus zwei Quellen – etwa direkt von Wahoo und noch einmal über
 * Intervals.icu, das sie von dort bezieht. Erkannt wird sie am Tag und an einer
 * Distanz, die sich um weniger als 500 m unterscheidet; für die
 * Verschleißrechnung wäre eine doppelt gezählte Fahrt schlimmer als eine
 * fehlende.
 */
export function istDublette(fahrt, bestand) {
  return bestand.some(
    (r) =>
      r.ownerId === fahrt.ownerId &&
      r.externalProvider !== fahrt.externalProvider &&
      r.date === fahrt.date &&
      Math.abs((Number(r.km) || 0) - (Number(fahrt.km) || 0)) < 0.5,
  )
}

export const ARTEN = ['outdoor', 'indoor']

/**
 * Das Standardrad eines Profils für eine Art an einem Tag: der jüngste
 * Eintrag der Zeitleiste, der nicht nach dem Tag liegt. Ein Eintrag zählt
 * erst ab „genutzt ab“ seines Rades – ein Rad, das man noch nicht besaß, kann
 * keine Fahrt bekommen haben; dann gilt der Eintrag davor.
 */
export function standardFuer(standards, bikes, ownerId, kind, datum) {
  let bester = null
  let rad = null
  for (const s of standards ?? []) {
    if (s.ownerId !== ownerId || s.kind !== kind || s.from > datum) continue
    if (bester && s.from < bester.from) continue
    const bike = bikes.find((b) => b.id === s.bikeId)
    if (!bike || (bike.from && bike.from > datum)) continue
    bester = s
    rad = bike
  }
  return rad
}

/**
 * Wie stark eine Fahrt an diesem Aufbau zählt. Auf der Rolle verschleißt eine
 * Stunde nicht dasselbe wie draußen – kein Dreck, keine Nässe, gleichmäßiger
 * Tritt –, deshalb bekommt jeder Aufbau einen Faktor. 1 heißt: eins zu eins.
 */
export function faktorVon(aufbau) {
  const wert = Number(aufbau?.factor)
  return Number.isFinite(wert) && wert > 0 ? wert : 1
}

/**
 * Ein Zuordner für einen Stand: löst für jede Fahrt Rad und Aufbau auf.
 * Nichts davon wird gespeichert – wer einen Standard-Wechsel verschiebt,
 * verschiebt damit sofort alle betroffenen Fahrten.
 */
export function zuordner(bikes, setups, standards = []) {
  function standard(fahrt) {
    const kind = fahrt.indoor ? 'indoor' : 'outdoor'
    return standardFuer(standards, bikes, fahrt.ownerId, kind, fahrt.date)
  }

  function rad(fahrt) {
    if (fahrt.override?.bikeId) {
      return bikes.find((b) => b.id === fahrt.override.bikeId) ?? null
    }
    return standard(fahrt)
  }

  function aufbau(fahrt, radDazu = rad(fahrt)) {
    if (fahrt.override?.setupId) {
      return setups.find((s) => s.id === fahrt.override.setupId) ?? null
    }
    if (!radDazu) return null
    const gesucht = fahrt.indoor ? 'indoor' : 'outdoor'
    return setups.find((s) => s.bikeId === radDazu.id && s.kind === gesucht) ?? null
  }

  /** Rad, Aufbau und – daraus – ob die Fahrt irgendwo mitzählt. */
  function loese(fahrt) {
    const radDazu = rad(fahrt)
    const aufbauDazu = aufbau(fahrt, radDazu)
    // Was ohne Ausnahme gälte – damit die Liste sagen kann, wovon abgewichen wird
    const standardRad = fahrt.override?.bikeId ? standard(fahrt) : radDazu
    // Woher die Kilometer kommen, in dieser Reihenfolge: von Hand eingetragen
    // (schlägt alles und überlebt jeden Sync), aus Intervals.icu ergänzt (für
    // Fahrten, zu denen der Anbieter keine Distanz kennt), wie gemeldet.
    const korrigiert = typeof fahrt.kmOverride === 'number' && fahrt.kmOverride >= 0
    const ergaenzt = !korrigiert && typeof fahrt.kmErgaenzt === 'number' && fahrt.kmErgaenzt > 0
    const km = korrigiert ? fahrt.kmOverride : ergaenzt ? fahrt.kmErgaenzt : Number(fahrt.km) || 0
    // Gefahren wurde, was auf der Uhr steht; für den Verschleiß zählt es mit
    // dem Faktor des Aufbaus – auf der Rolle nutzt sich weniger ab als
    // draußen im Dreck.
    const faktor = faktorVon(aufbauDazu)
    return {
      ...fahrt,
      km,
      kmGemeldet: Number(fahrt.km) || 0,
      kmKorrigiert: korrigiert,
      kmErgaenzt: ergaenzt ? fahrt.kmErgaenzt : null,
      faktor,
      verschleissKm: Math.round(km * faktor * 100) / 100,
      bikeId: radDazu?.id ?? null,
      bikeName: radDazu?.name ?? '',
      standardBikeId: standardRad?.id ?? null,
      standardBikeName: standardRad?.name ?? '',
      setupId: aufbauDazu?.id ?? null,
      setupName: aufbauDazu?.name ?? '',
      // Ohne Rad oder ohne passenden Aufbau zählt sie nirgends mit – das soll
      // man sehen, statt sie still verschwinden zu lassen.
      unassigned: !aufbauDazu,
    }
  }

  return { rad, aufbau, standard, loese }
}

/**
 * Kilometer eines Teils in einem Zeitraum: alle Fahrten, deren Aufbau das Teil
 * benutzt. Beide Randtage zählen mit – wird an einem Tag gewechselt, zählt die
 * Fahrt dieses Tages für das alte *und* das neue Teil, die Variante, die nie
 * Kilometer verschluckt.
 */
export function kmImZeitraum(setupIds, fahrten, von, bis) {
  if (!Array.isArray(setupIds) || !setupIds.length) return 0
  let summe = 0
  for (const f of fahrten) {
    if (!f.setupId || !setupIds.includes(f.setupId)) continue
    if (f.date < von || f.date > bis) continue
    // `verschleissKm` ist die gefahrene Strecke mal dem Faktor des Aufbaus
    summe += Number(f.verschleissKm ?? f.km) || 0
  }
  return Math.round(summe * 10) / 10
}

/**
 * Gesamtkilometer eines Rades – über alle seine Aufbauten. Hier zählt die
 * gefahrene Strecke, nicht die gewichtete: Die Frage „wie weit bin ich damit
 * gefahren“ hat mit Verschleiß nichts zu tun.
 */
export function kmFuerRad(bikeId, fahrten) {
  const summe = fahrten
    .filter((f) => f.bikeId === bikeId)
    .reduce((s, f) => s + (Number(f.km) || 0), 0)
  return Math.round(summe * 10) / 10
}

/** Was ein Aufbau beigetragen hat – gefahren und gewichtet. */
export function kmFuerAufbau(setupId, fahrten) {
  let gefahren = 0
  let verschleiss = 0
  for (const f of fahrten) {
    if (f.setupId !== setupId) continue
    gefahren += Number(f.km) || 0
    verschleiss += Number(f.verschleissKm ?? f.km) || 0
  }
  return {
    gefahren: Math.round(gefahren * 10) / 10,
    verschleiss: Math.round(verschleiss * 10) / 10,
  }
}

/**
 * Ein Sync-Fenster in den Bestand einarbeiten – die Stelle, an der sich
 * entscheidet, ob zweimal Holen zweimal Kilometer bedeutet.
 *
 * Erkannt wird eine Fahrt am Paar aus Anbieter und Fremd-Id, nicht an Datum
 * oder Distanz: Wird eine Aktivität drüben korrigiert, wird sie hier
 * fortgeschrieben statt ein zweites Mal angelegt. Was im Fenster lag und
 * drüben nicht mehr auftaucht, ist dort gelöscht worden und fliegt auch hier
 * raus – von Hand eingetragene Fahrten bleiben davon immer unberührt, die
 * hängen an keinem Konto.
 *
 * Die Zuordnung von Hand (`override`) überlebt jede Aktualisierung: Sie ist
 * eine Entscheidung des Nutzers, keine Angabe des Anbieters.
 */
export function synchronisiereFenster(rides, neueFahrten, { ownerId, provider, von, bis, neueId }) {
  const bestand = [...rides]
  let neu = 0
  let geaendert = 0
  let uebersprungen = 0
  const gesehen = new Set()

  for (const fahrt of neueFahrten) {
    gesehen.add(fahrt.externalActivityId)
    const alt = bestand.find(
      (r) =>
        r.ownerId === fahrt.ownerId &&
        r.externalProvider === fahrt.externalProvider &&
        r.externalActivityId === fahrt.externalActivityId,
    )
    if (!alt) {
      // Dieselbe Fahrt kann über zwei Quellen hereinkommen – die zweite wird
      // nicht angelegt, sonst stünden ihre Kilometer doppelt in der Rechnung.
      if (istDublette(fahrt, bestand)) {
        uebersprungen += 1
        continue
      }
      bestand.push({ ...fahrt, id: neueId(), override: null, createdAt: new Date().toISOString() })
      neu += 1
      continue
    }
    const unveraendert =
      alt.date === fahrt.date &&
      alt.km === fahrt.km &&
      alt.indoor === fahrt.indoor &&
      alt.name === fahrt.name
    if (unveraendert) continue
    Object.assign(alt, fahrt, {
      id: alt.id,
      override: alt.override,
      createdAt: alt.createdAt,
      // Von Hand entfernt heißt entfernt – auch wenn der Anbieter die Fahrt
      // weiter führt
      deleted: alt.deleted,
      deletedAt: alt.deletedAt,
      kmOverride: alt.kmOverride,
      // Aus Intervals.icu ergänzt – Wahoo meldet die Fahrt weiter mit 0 km
      kmErgaenzt: alt.kmErgaenzt,
      kmErgaenztVon: alt.kmErgaenztVon,
    })
    geaendert += 1
  }

  // Was im Fenster lag und beim Anbieter nicht mehr auftaucht, ist dort
  // gelöscht worden. Fahrten anderer Quellen und von Hand eingetragene bleiben
  // in jedem Fall stehen.
  const behalten = bestand.filter(
    (r) =>
      r.ownerId !== ownerId ||
      r.externalProvider !== provider ||
      r.date < von ||
      r.date > bis ||
      gesehen.has(r.externalActivityId),
  )
  return {
    rides: behalten,
    neu,
    geaendert,
    uebersprungen,
    geloescht: bestand.length - behalten.length,
  }
}

// ── Distanz ergänzen ─────────────────────────────────────────────────────────
// Rollenfahrten aus MyWhoosh kommen bei Wahoo ohne Distanz an – nicht einmal
// die FIT-Datei dort enthält eine. MyWhoosh lädt dieselbe Fahrt aber auch
// direkt zu Intervals.icu hoch, und dort steht die virtuelle Strecke. Die
// Fahrt bleibt, wie sie ist; nur die Kilometer werden daraus übernommen.

/** Braucht diese Fahrt Kilometer von anderswo? */
export function brauchtDistanz(fahrt) {
  if (fahrt.deleted) return false
  if (typeof fahrt.kmOverride === 'number') return false
  if (typeof fahrt.kmErgaenzt === 'number' && fahrt.kmErgaenzt > 0) return false
  return !((Number(fahrt.km) || 0) > 0)
}

const minuten = (hhmm) => {
  const [h, m] = String(hhmm ?? '')
    .split(':')
    .map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/**
 * Die Aktivität bei Intervals.icu, die dieselbe Fahrt ist – oder `null`.
 *
 * Gleicher Kalendertag ist Pflicht. Dann entscheidet die Startzeit (beide in
 * UTC, höchstens 20 Minuten auseinander); ohne Startzeit muss die Dauer auf
 * 10 % passen. Bei mehreren Kandidaten gewinnt der zeitlich nächste – lieber
 * keine Kilometer als die einer anderen Fahrt.
 */
export function passendeAktivitaet(fahrt, aktivitaeten) {
  const start = minuten(fahrt.time)
  const dauer = Number(fahrt.minutes) || 0
  let beste = null
  let besterAbstand = Infinity
  for (const a of aktivitaeten) {
    const meter = Number(a?.distance) || 0
    if (meter <= 0) continue
    if (String(a.start_date_local ?? '').slice(0, 10) !== fahrt.date) continue
    const aDauer = (Number(a.moving_time ?? a.elapsed_time) || 0) / 60
    const aStart = minuten(String(a.start_date ?? '').slice(11, 16))
    let abstand
    if (start !== null && aStart !== null) {
      abstand = Math.abs(start - aStart)
      if (abstand > 20) continue
    } else {
      if (!dauer || !aDauer || Math.abs(dauer - aDauer) > dauer * 0.1) continue
      abstand = Math.abs(dauer - aDauer)
    }
    if (abstand < besterAbstand) {
      beste = a
      besterAbstand = abstand
    }
  }
  return beste
}

// ── CSV-Import ───────────────────────────────────────────────────────────────
// Für Fahrten aus der Zeit vor dem Gerät. Erwartet werden die Spalten
// `name,date,sport,distance_km`, dazu optional `id` – steht sie da, ist sie
// der Schlüssel, an dem eine Zeile beim nächsten Einlesen wiedererkannt wird.

/**
 * Exporte aus Tabellenprogrammen sind oft UTF-8, das einmal als Latin-1
 * gelesen wurde („RÃ¼ckfahrt“ statt „Rückfahrt“). Das lässt sich
 * zurückdrehen – aber nur, wenn dabei etwas Sinnvolles herauskommt.
 */
export function repariereUmlaute(text) {
  if (!/[ÃÂð]/.test(text)) return text
  try {
    if ([...text].some((z) => z.codePointAt(0) > 255)) return text
    const bytes = Uint8Array.from([...text].map((z) => z.codePointAt(0)))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return text
  }
}

/** Eine Zeile im CSV – Anführungszeichen und Kommas darin berücksichtigt. */
function spalten(zeile) {
  const felder = []
  let feld = ''
  let inAnfuehrung = false
  for (let i = 0; i < zeile.length; i += 1) {
    const z = zeile[i]
    if (z === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') {
        feld += '"'
        i += 1
      } else {
        inAnfuehrung = !inAnfuehrung
      }
    } else if (z === ',' && !inAnfuehrung) {
      felder.push(feld)
      feld = ''
    } else {
      feld += z
    }
  }
  felder.push(feld)
  return felder.map((f) => f.trim())
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * Welche Reihenfolge die beiden Zahlen hinter dem Jahr haben, verrät die Datei
 * selbst: Steht irgendwo eine Zahl über 12, kann das nur ein Tag sein. So
 * bleibt `2026-16-08` (16. August) von `2026-08-16` unterscheidbar, ohne dass
 * jemand ein Format angeben müsste.
 */
export function datumsFormat(werte) {
  let zweiteUeber12 = false
  let dritteUeber12 = false
  for (const wert of werte) {
    const teile = String(wert).split('-')
    if (teile.length !== 3) continue
    if (Number(teile[1]) > 12) zweiteUeber12 = true
    if (Number(teile[2]) > 12) dritteUeber12 = true
  }
  if (zweiteUeber12 && dritteUeber12) return 'unklar'
  if (zweiteUeber12) return 'jahr-tag-monat'
  return 'jahr-monat-tag'
}

/** Ein Datum aus der Tabelle auf `YYYY-MM-DD` bringen. */
export function csvDatum(wert, format) {
  const roh = String(wert ?? '').trim()
  // US-Schreibweise, wie sie manche Tabellen ausgeben
  if (roh.includes('/')) {
    const [m, t, j] = roh.split('/').map(Number)
    if (!m || !t || !j) return ''
    return `${j}-${pad(m)}-${pad(t)}`
  }
  const teile = roh.split('-')
  if (teile.length !== 3) return ''
  const [j, a, b] = teile.map(Number)
  if (!j || !a || !b) return ''
  const [monat, tag] = format === 'jahr-tag-monat' ? [b, a] : [a, b]
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return ''
  return `${j}-${pad(monat)}-${pad(tag)}`
}

const CSV_SPORT = {
  ride: false,
  'virtual ride': true,
  'e-bike ride': false,
  'gravel ride': false,
  'mountain bike ride': false,
}

/**
 * Liest die Tabelle und sagt, was daraus würde – ohne etwas zu speichern.
 *
 * `bis` blendet alles ab diesem Tag aus. Gebraucht wird das für den Zeitraum,
 * den eine angebundene Quelle schon vollständig hat: Dort ist deren Stand der
 * genauere, und zweimal dieselbe Ausfahrt wären doppelte Kilometer.
 */
export function ausCsv(text, { bis = '', ownerId = '' } = {}) {
  const zeilen = String(text)
    .split(/\r?\n/)
    .filter((z) => z.trim())
  if (!zeilen.length) return { fahrten: [], ignoriert: [], fehler: 'Die Datei ist leer.' }

  const kopf = spalten(zeilen[0]).map((k) => k.toLowerCase())
  const noetig = ['name', 'date', 'sport', 'distance_km']
  if (!noetig.every((k) => kopf.includes(k))) {
    return {
      fahrten: [],
      ignoriert: [],
      fehler: `Kopfzeile passt nicht – erwartet werden die Spalten ${noetig.join(', ')}.`,
    }
  }
  const index = Object.fromEntries([...noetig, 'id'].map((k) => [k, kopf.indexOf(k)]))
  const datenZeilen = zeilen.slice(1).map(spalten)
  const format = datumsFormat(datenZeilen.map((f) => f[index.date]))
  if (format === 'unklar') {
    return {
      fahrten: [],
      ignoriert: [],
      fehler: 'Die Datumsspalte ist uneinheitlich – mal Tag zuerst, mal Monat.',
    }
  }

  const fahrten = []
  const ignoriert = []
  for (const f of datenZeilen) {
    const name = repariereUmlaute(f[index.name] ?? '').slice(0, 80)
    const datum = csvDatum(f[index.date], format)
    const sport = String(f[index.sport] ?? '').toLowerCase()
    const km = Number(String(f[index.distance_km] ?? '').replace(',', '.'))

    if (!datum) {
      ignoriert.push({ name, grund: `Datum „${f[index.date]}“ nicht lesbar` })
      continue
    }
    if (!(sport in CSV_SPORT)) {
      ignoriert.push({ name, grund: `Sportart „${f[index.sport]}“` })
      continue
    }
    if (bis && datum >= bis) {
      ignoriert.push({ name, grund: `ab ${bis} zählt die verbundene Quelle` })
      continue
    }

    const id = index.id >= 0 ? String(f[index.id] ?? '').trim() : ''
    fahrten.push({
      ownerId,
      date: datum,
      time: null,
      km: Number.isFinite(km) && km > 0 ? Math.round(km * 100) / 100 : 0,
      minutes: 0,
      name,
      indoor: CSV_SPORT[sport],
      ohneDistanz: !(km > 0),
      // Aus der Tabelle übernommen, nicht von einer Schnittstelle geholt –
      // deshalb bleibt es eine Fahrt von Hand und ist hier änderbar.
      source: 'MANUAL',
      externalProvider: 'csv',
      // Die Aktivitäts-Id aus dem Export ist der beste Schlüssel; ohne sie tut
      // es die Kombination aus Datum, Name und Distanz.
      externalActivityId: id || `${datum}|${name}|${km}`,
      externalSource: null,
    })
  }

  // Mehrere Zeilen mit demselben Datum *und* derselben Distanz deuten auf einen
  // kaputten Export hin. Gemeldet, nicht stillschweigend übernommen.
  const zaehler = new Map()
  for (const f of fahrten) {
    const schluessel = `${f.date}|${f.km}`
    zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1)
  }
  const verdaechtig = [...zaehler.values()].filter((n) => n > 1).length
  const datumsformat = format === 'jahr-tag-monat' ? 'Jahr-Tag-Monat' : 'Jahr-Monat-Tag'

  return { fahrten, ignoriert, verdaechtig, datumsformat, fehler: '' }
}

// ── Statistik ────────────────────────────────────────────────────────────────

/** Kalenderwoche nach ISO – Montag als erster Tag. */
function isoWoche(datum) {
  const d = new Date(`${datum}T00:00:00Z`)
  const tag = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - tag + 3)
  const ersterDonnerstag = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const versatz = (ersterDonnerstag.getUTCDay() + 6) % 7
  ersterDonnerstag.setUTCDate(ersterDonnerstag.getUTCDate() - versatz + 3)
  const woche = 1 + Math.round((d - ersterDonnerstag) / (7 * 86400000))
  return `${d.getUTCFullYear()}-W${String(woche).padStart(2, '0')}`
}

function runde(n) {
  return Math.round(n * 10) / 10
}

/**
 * Alles, was das Kilometer-Dashboard zeigt – einmal im Server gerechnet, damit
 * der Browser nicht die ganze Fahrtenliste braucht.
 *
 * Gezählt wird die gefahrene Strecke, nicht die für den Verschleiß gewichtete:
 * „Wie viel bin ich gefahren“ ist eine andere Frage als „wie sehr hat es die
 * Kette mitgenommen“.
 */
export function statistik(fahrten, { bikes = [], heute = '' } = {}) {
  const jahre = new Map()
  const monate = new Map()
  const wochen = new Map()
  const raeder = new Map()
  let km = 0
  let indoorKm = 0

  for (const f of fahrten) {
    const wert = Number(f.km) || 0
    km += wert
    if (f.indoor) indoorKm += wert

    const jahr = f.date.slice(0, 4)
    const monat = f.date.slice(0, 7)
    const woche = isoWoche(f.date)
    for (const [karte, schluessel] of [
      [jahre, jahr],
      [monate, monat],
      [wochen, woche],
    ]) {
      const eintrag = karte.get(schluessel) ?? { km: 0, indoorKm: 0, fahrten: 0 }
      eintrag.km += wert
      eintrag.fahrten += 1
      if (f.indoor) eintrag.indoorKm += wert
      karte.set(schluessel, eintrag)
    }
    if (f.bikeId) {
      const eintrag = raeder.get(f.bikeId) ?? { km: 0, fahrten: 0 }
      eintrag.km += wert
      eintrag.fahrten += 1
      raeder.set(f.bikeId, eintrag)
    }
  }

  const alsListe = (karte, feld) =>
    [...karte.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([schluessel, e]) => ({
        [feld]: schluessel,
        km: runde(e.km),
        indoorKm: runde(e.indoorKm),
        outdoorKm: runde(e.km - e.indoorKm),
        fahrten: e.fahrten,
      }))

  // Lückenlose Monatsreihe: ein Monat ohne Fahrt ist eine Aussage, kein Loch
  const monatsListe = alsListe(monate, 'monat')
  const gefuellt = []
  if (monatsListe.length) {
    const [ersterJahr, ersterMonat] = monatsListe[0].monat.split('-').map(Number)
    const bis = (heute || monatsListe.at(-1).monat).slice(0, 7)
    let jahr = ersterJahr
    let monat = ersterMonat
    for (let i = 0; i < 240; i += 1) {
      const schluessel = `${jahr}-${String(monat).padStart(2, '0')}`
      gefuellt.push(
        monatsListe.find((m) => m.monat === schluessel) ?? {
          monat: schluessel,
          km: 0,
          indoorKm: 0,
          outdoorKm: 0,
          fahrten: 0,
        },
      )
      if (schluessel >= bis) break
      monat += 1
      if (monat > 12) {
        monat = 1
        jahr += 1
      }
    }
  }

  // Die stärksten Abschnitte – über alles gerechnet, nicht nur über das
  // Fenster, das die Reihen unten zeigen
  const spitze = (karte, feld) => {
    let best = null
    for (const [schluessel, e] of karte) {
      if (!best || e.km > best.km)
        best = { [feld]: schluessel, km: runde(e.km), fahrten: e.fahrten }
    }
    return best
  }
  const besterMonat = spitze(monate, 'monat')
  const besteWoche = spitze(wochen, 'woche')

  const laengste = [...fahrten]
    .sort((a, b) => (Number(b.km) || 0) - (Number(a.km) || 0))
    .slice(0, 5)
    .map((f) => ({ date: f.date, name: f.name, km: runde(Number(f.km) || 0), indoor: f.indoor }))

  return {
    km: runde(km),
    fahrten: fahrten.length,
    indoorKm: runde(indoorKm),
    outdoorKm: runde(km - indoorKm),
    schnitt: fahrten.length ? runde(km / fahrten.length) : 0,
    jahre: alsListe(jahre, 'jahr'),
    monate: gefuellt,
    wochen: alsListe(wochen, 'woche').slice(-16),
    besterMonat,
    besteWoche,
    raeder: bikes
      .map((b) => ({ id: b.id, name: b.name, ...(raeder.get(b.id) ?? { km: 0, fahrten: 0 }) }))
      .map((r) => ({ ...r, km: runde(r.km) }))
      .sort((a, b) => b.km - a.km),
    laengste,
  }
}
