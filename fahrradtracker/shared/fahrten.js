/**
 * Der Kern der Verschleißrechnung – bewusst ohne Bezug zum Anbieter und ohne
 * Zugriff auf Dateien, damit er sich einzeln testen lässt.
 *
 * Die Kette lautet:
 *
 *     Fahrt → Rad (über das Datum) → Aufbau (drinnen/draußen) → Teile
 *
 * Ein Rad hat einen Nutzungszeitraum; welche Fahrt zu welchem Rad gehört,
 * entscheidet deshalb ihr Kalendertag und nicht eine Auswahl von Hand. Ein Rad
 * hat einen oder mehrere Aufbauten („Draußen“, „Rolle“), und ein Teil hängt an
 * beliebig vielen Aufbauten – so verschleißt dieselbe Kette drinnen wie
 * draußen, während jede Kassette nur an ihrem eigenen Aufbau zählt.
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

/** Liegt ein Tag im Nutzungszeitraum eines Rades? `to: null` heißt „bis heute“. */
export function imZeitraum(datum, von, bis) {
  if (!von || datum < von) return false
  return !bis || datum <= bis
}

/**
 * Zwei Nutzungszeiträume, die sich überschneiden, machen die Zuordnung
 * mehrdeutig – deshalb lässt der Server sie gar nicht erst zu.
 */
export function ueberschneidetSich(a, b) {
  const aBis = a.to ?? '9999-12-31'
  const bBis = b.to ?? '9999-12-31'
  return a.from <= bBis && b.from <= aBis
}

/**
 * Ein Zuordner für einen Stand: löst für jede Fahrt Rad und Aufbau auf.
 * Nichts davon wird gespeichert – wer einen Nutzungszeitraum korrigiert,
 * verschiebt damit sofort alle betroffenen Fahrten.
 */
export function zuordner(bikes, setups) {
  function rad(fahrt) {
    if (fahrt.override?.bikeId) {
      return bikes.find((b) => b.id === fahrt.override.bikeId) ?? null
    }
    return (
      bikes.find((b) => b.ownerId === fahrt.ownerId && imZeitraum(fahrt.date, b.from, b.to)) ?? null
    )
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
    // Eine von Hand eingetragene Distanz schlägt die gemeldete: Sie ist die
    // Antwort auf Fahrten, für die der Anbieter keine Kilometer kennt, und
    // überlebt jeden weiteren Sync.
    const korrigiert = typeof fahrt.kmOverride === 'number' && fahrt.kmOverride >= 0
    return {
      ...fahrt,
      km: korrigiert ? fahrt.kmOverride : Number(fahrt.km) || 0,
      kmGemeldet: Number(fahrt.km) || 0,
      kmKorrigiert: korrigiert,
      bikeId: radDazu?.id ?? null,
      bikeName: radDazu?.name ?? '',
      setupId: aufbauDazu?.id ?? null,
      setupName: aufbauDazu?.name ?? '',
      // Ohne Rad oder ohne passenden Aufbau zählt sie nirgends mit – das soll
      // man sehen, statt sie still verschwinden zu lassen.
      unassigned: !aufbauDazu,
    }
  }

  return { rad, aufbau, loese }
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
    summe += Number(f.km) || 0
  }
  return Math.round(summe * 10) / 10
}

/** Gesamtkilometer eines Rades – über alle seine Aufbauten. */
export function kmFuerRad(bikeId, fahrten) {
  const summe = fahrten
    .filter((f) => f.bikeId === bikeId)
    .reduce((s, f) => s + (Number(f.km) || 0), 0)
  return Math.round(summe * 10) / 10
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

// ── CSV-Import ───────────────────────────────────────────────────────────────
// Für Fahrten aus der Zeit vor dem Gerät, die als Tabelle vorliegen. Erwartet
// wird der Aufbau `name,date,sport,distance_km` mit US-Datum (M/D/YYYY) und
// „Ride“ bzw. „Virtual Ride“ als Sportart.

/**
 * Exporte aus Tabellenprogrammen sind oft UTF-8, das einmal als Latin-1
 * gelesen wurde („RÃ¼ckfahrt“ statt „Rückfahrt“). Das lässt sich
 * zurückdrehen – aber nur, wenn dabei etwas Sinnvolles herauskommt.
 */
export function repariereUmlaute(text) {
  if (!/[ÃÂð]/.test(text)) return text
  try {
    const bytes = Uint8Array.from([...text].map((z) => z.codePointAt(0)))
    if ([...text].some((z) => z.codePointAt(0) > 255)) return text
    const zurueck = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return zurueck
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

/** M/D/YYYY → YYYY-MM-DD. */
function usDatum(wert) {
  const teile = String(wert).split('/')
  if (teile.length !== 3) return ''
  const [m, t, j] = teile.map((x) => Number(x))
  if (!m || !t || !j) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${j}-${pad(m)}-${pad(t)}`
}

const CSV_SPORT = {
  ride: false,
  'virtual ride': true,
}

/**
 * Liest die Tabelle und sagt, was daraus würde – ohne etwas zu speichern.
 *
 * Zwei Eigenheiten solcher Exporte werden dabei aufgefangen:
 *
 * 1. Die Spalte heißt `distance_km`, enthält aber Hundertstel-Kilometer
 *    (17057 = 170,57 km). Erkannt wird das daran, dass die Werte ganzzahlig
 *    sind und für Kilometer viel zu groß.
 * 2. Datum und Distanz sind mitunter über ganze Gruppen von Zeilen hinweg
 *    identisch – ein Artefakt des Exports, nicht zwölf Hunderter an einem Tag.
 *    Solche Zeilen kommen ohne Distanz herein, statt erfundene Kilometer in die
 *    Verschleißrechnung zu tragen.
 */
export function ausCsv(text, { bis = '', ownerId = '' } = {}) {
  const zeilen = String(text)
    .split(/\r?\n/)
    .filter((z) => z.trim())
  if (!zeilen.length) return { fahrten: [], fehler: 'Die Datei ist leer.', ignoriert: [] }

  const kopf = spalten(zeilen[0]).map((k) => k.toLowerCase())
  const noetig = ['name', 'date', 'sport', 'distance_km']
  if (!noetig.every((k) => kopf.includes(k))) {
    return {
      fahrten: [],
      ignoriert: [],
      fehler: `Kopfzeile passt nicht – erwartet werden die Spalten ${noetig.join(', ')}.`,
    }
  }
  const index = Object.fromEntries(noetig.map((k) => [k, kopf.indexOf(k)]))

  const roh = []
  const ignoriert = []
  for (const zeile of zeilen.slice(1)) {
    const f = spalten(zeile)
    const name = repariereUmlaute(f[index.name] ?? '').slice(0, 80)
    const datum = usDatum(f[index.date])
    const sport = String(f[index.sport] ?? '').toLowerCase()
    const wert = Number(String(f[index.distance_km] ?? '').replace(',', '.'))

    if (!datum) {
      ignoriert.push({ name, grund: 'kein lesbares Datum' })
      continue
    }
    if (!(sport in CSV_SPORT)) {
      ignoriert.push({ name, grund: `Sportart „${f[index.sport]}“` })
      continue
    }
    if (bis && datum >= bis) {
      ignoriert.push({ name, grund: `liegt nicht vor dem ${bis}` })
      continue
    }
    roh.push({
      name,
      date: datum,
      indoor: CSV_SPORT[sport],
      wert: Number.isFinite(wert) ? wert : 0,
    })
  }

  // Hundertstel-Kilometer oder Kilometer?
  const werte = roh.map((r) => r.wert).filter((w) => w > 0)
  const hundertstel =
    werte.length > 0 && werte.every((w) => Number.isInteger(w)) && Math.max(...werte) > 1000
  const teiler = hundertstel ? 100 : 1

  // Gruppen aus gleichem Datum und gleicher Distanz: Exportfehler, keine echten
  // Mehrfachfahrten
  const zaehler = new Map()
  for (const r of roh) {
    const schluessel = `${r.date}|${r.wert}`
    zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1)
  }

  const fahrten = roh.map((r) => {
    const gruppe = zaehler.get(`${r.date}|${r.wert}`) ?? 1
    const verdaechtig = gruppe > 1 && r.wert > 0
    const km = verdaechtig ? 0 : Math.round((r.wert / teiler) * 100) / 100
    return {
      ownerId,
      date: r.date,
      time: null,
      km,
      minutes: 0,
      name: r.name,
      indoor: r.indoor,
      ohneDistanz: km <= 0,
      // Aus der Tabelle übernommen, nicht von einer Schnittstelle geholt –
      // deshalb bleibt es eine Fahrt von Hand und ist hier änderbar.
      source: 'MANUAL',
      externalProvider: 'csv',
      externalActivityId: `${r.date}|${r.name}|${r.wert}`,
      externalSource: null,
      // Warum ohne Distanz: damit die Oberfläche es erklären kann
      grund: verdaechtig ? `Datum und Distanz stehen ${gruppe}× gleich im Export` : '',
    }
  })

  return { fahrten, ignoriert, hundertstel, fehler: '' }
}
