import { describe, expect, it } from 'vitest'
// @ts-expect-error – plain JS, dieselbe Datei benutzt auch server.js
import {
  ausCsv,
  ausIntervals,
  ausWahoo,
  brauchtDistanz,
  passendeAktivitaet,
  istDublette,
  istRadfahrt,
  kmFuerRad,
  kmImZeitraum,
  statistik,
  synchronisiereFenster,
  standardFuer,
  zuordner,
} from '../../../shared/fahrten.js'

// Das Scott seit Mai 2025, ab dem 06.09.2026 draußen die Specialized – auf
// der Rolle bleibt das Scott
const scott = { id: 'scott', ownerId: 'u1', name: 'Scott Speedster', from: '2025-05-01' }
const spezi = { id: 'spezi', ownerId: 'u1', name: 'Specialized', from: '2026-09-01' }
const bikes = [scott, spezi]
const standards = [
  { id: 'st1', ownerId: 'u1', kind: 'outdoor', bikeId: 'scott', from: '2025-05-01' },
  { id: 'st2', ownerId: 'u1', kind: 'indoor', bikeId: 'scott', from: '2025-05-01' },
  { id: 'st3', ownerId: 'u1', kind: 'outdoor', bikeId: 'spezi', from: '2026-09-06' },
]

const setups = [
  { id: 's-out', bikeId: 'scott', name: 'Draußen', kind: 'outdoor' },
  { id: 's-in', bikeId: 'scott', name: 'Rolle', kind: 'indoor' },
  { id: 'p-out', bikeId: 'spezi', name: 'Draußen', kind: 'outdoor' },
]

function fahrt(over: Record<string, unknown> = {}) {
  return { id: 'f', ownerId: 'u1', date: '2026-08-20', km: 50, indoor: false, ...over }
}

describe('ausIntervals', () => {
  const wahoo = {
    id: 'i177141373',
    icu_athlete_id: 'i584416',
    start_date_local: '2026-08-16T12:23:29',
    type: 'Ride',
    distance: 170576.84,
    moving_time: 21600,
    name: 'Lange Tour',
    source: 'WAHOO',
  }

  it('übersetzt eine Wahoo-Fahrt samt Metern in Kilometer', () => {
    const f = ausIntervals(wahoo, 'u1')
    expect(f).toMatchObject({
      ownerId: 'u1',
      date: '2026-08-16',
      time: '12:23',
      km: 170.58,
      minutes: 360,
      indoor: false,
      source: 'INTERVALS_WAHOO',
      externalProvider: 'intervals.icu',
      externalActivityId: 'i177141373',
      externalSource: 'WAHOO',
    })
  })

  it('lässt die Strava-Platzhalter liegen – die haben keine Distanz', () => {
    expect(
      ausIntervals(
        {
          id: '19626089620',
          start_date_local: '2026-08-06T13:38:29',
          source: 'STRAVA',
          type: 'Ride',
        },
        'u1',
      ),
    ).toBeNull()
  })

  it('nimmt nur Radfahrten', () => {
    expect(ausIntervals({ ...wahoo, type: 'Run' }, 'u1')).toBeNull()
    expect(ausIntervals({ ...wahoo, type: 'Swim' }, 'u1')).toBeNull()
    expect(istRadfahrt('GravelRide')).toBe(true)
  })

  it('macht aus einer VirtualRide eine Fahrt drinnen', () => {
    expect(ausIntervals({ ...wahoo, type: 'VirtualRide' }, 'u1')?.indoor).toBe(true)
  })

  it('wirft kaputte Datensätze weg, statt sie falsch zu rechnen', () => {
    expect(ausIntervals({ ...wahoo, start_date_local: '' }, 'u1')).toBeNull()
    expect(ausIntervals(null, 'u1')).toBeNull()
  })
})

describe('Standardräder', () => {
  it('nimmt den jüngsten Eintrag vor dem Tag', () => {
    expect(standardFuer(standards, bikes, 'u1', 'outdoor', '2026-09-05')?.id).toBe('scott')
    expect(standardFuer(standards, bikes, 'u1', 'outdoor', '2026-09-06')?.id).toBe('spezi')
    expect(standardFuer(standards, bikes, 'u1', 'indoor', '2026-12-24')?.id).toBe('scott')
  })

  it('kennt nichts vor dem ersten Eintrag und nichts für andere Profile', () => {
    expect(standardFuer(standards, bikes, 'u1', 'outdoor', '2025-04-30')).toBeNull()
    expect(standardFuer(standards, bikes, 'u2', 'outdoor', '2026-09-10')).toBeNull()
  })

  it('springt für eine Tour hin und wieder zurück', () => {
    const tour = [
      ...standards,
      { id: 't1', ownerId: 'u1', kind: 'outdoor', bikeId: 'scott', from: '2027-06-01' },
      { id: 't2', ownerId: 'u1', kind: 'outdoor', bikeId: 'spezi', from: '2027-06-15' },
    ]
    expect(standardFuer(tour, bikes, 'u1', 'outdoor', '2027-05-31')?.id).toBe('spezi')
    expect(standardFuer(tour, bikes, 'u1', 'outdoor', '2027-06-10')?.id).toBe('scott')
    expect(standardFuer(tour, bikes, 'u1', 'outdoor', '2027-06-15')?.id).toBe('spezi')
  })

  it('lässt kein Rad vor seinem „genutzt ab“ gelten', () => {
    const zuFrueh = [
      ...standards,
      { id: 'x', ownerId: 'u1', kind: 'outdoor', bikeId: 'spezi', from: '2026-08-01' },
    ]
    // Der Eintrag zeigt auf ein Rad, das es erst ab dem 01.09. gibt – davor
    // gilt der vorige
    expect(standardFuer(zuFrueh, bikes, 'u1', 'outdoor', '2026-08-15')?.id).toBe('scott')
    expect(standardFuer(zuFrueh, bikes, 'u1', 'outdoor', '2026-09-02')?.id).toBe('spezi')
  })
})

describe('Zuordnung über die Standardräder', () => {
  const { loese } = zuordner(bikes, setups, standards)

  it('schiebt die Fahrt auf das Standardrad des Tages', () => {
    expect(loese(fahrt({ date: '2026-08-20' })).bikeId).toBe('scott')
    expect(loese(fahrt({ date: '2026-09-10' })).bikeId).toBe('spezi')
  })

  it('trifft die Randtage genau', () => {
    expect(loese(fahrt({ date: '2026-09-05' })).bikeId).toBe('scott')
    expect(loese(fahrt({ date: '2026-09-06' })).bikeId).toBe('spezi')
  })

  it('wählt Rad und Aufbau nach drinnen/draußen', () => {
    expect(loese(fahrt({ indoor: false })).setupId).toBe('s-out')
    expect(loese(fahrt({ indoor: true })).setupId).toBe('s-in')
    // Draußen das neue Rad, auf der Rolle weiter das alte
    const rolle = loese(fahrt({ date: '2026-11-01', indoor: true }))
    expect(rolle.bikeId).toBe('scott')
    expect(rolle.setupId).toBe('s-in')
    expect(loese(fahrt({ date: '2026-11-01' })).setupId).toBe('p-out')
  })

  it('meldet Fahrten ohne Rad als unzugeordnet, statt sie irgendwo zu verbuchen', () => {
    const alt = loese(fahrt({ date: '2024-01-01' }))
    expect(alt.bikeId).toBeNull()
    expect(alt.unassigned).toBe(true)
  })

  it('meldet eine Fahrt als unzugeordnet, wenn dem Rad der Aufbau fehlt', () => {
    const drinnen = loese(
      fahrt({ date: '2026-09-10', indoor: true, override: { bikeId: 'spezi', setupId: null } }),
    )
    expect(drinnen.bikeId).toBe('spezi')
    expect(drinnen.setupId).toBeNull()
    expect(drinnen.unassigned).toBe(true)
  })

  it('lässt sich als Ausnahme von Hand übersteuern und kennt den Standard dahinter', () => {
    const f = loese(fahrt({ date: '2026-10-01', override: { bikeId: 'scott', setupId: null } }))
    expect(f.bikeId).toBe('scott')
    expect(f.setupId).toBe('s-out')
    expect(f.standardBikeId).toBe('spezi')
    expect(f.standardBikeName).toBe('Specialized')
  })
})

describe('Verschleiß über geteilte Teile', () => {
  const { loese } = zuordner(bikes, setups, standards)
  const fahrten = [
    fahrt({ id: '1', date: '2026-06-01', km: 100, indoor: false }),
    fahrt({ id: '2', date: '2026-06-02', km: 30, indoor: true }),
    fahrt({ id: '3', date: '2026-09-10', km: 80, indoor: false }),
  ].map(loese)

  // Kette, Kettenblätter und Lager hängen an beiden Aufbauten des Scott,
  // die Kassetten je an einem
  const kette = ['s-out', 's-in']
  const kassetteA = ['s-out']
  const kassetteB = ['s-in']

  it('zählt geteilte Teile drinnen wie draußen', () => {
    expect(kmImZeitraum(kette, fahrten, '2026-01-01', '2026-12-31')).toBe(130)
  })

  it('lässt jede Kassette nur an ihrem Aufbau zählen', () => {
    expect(kmImZeitraum(kassetteA, fahrten, '2026-01-01', '2026-12-31')).toBe(100)
    expect(kmImZeitraum(kassetteB, fahrten, '2026-01-01', '2026-12-31')).toBe(30)
  })

  it('hält die Fahrten des anderen Rades draußen', () => {
    expect(kmImZeitraum(['p-out'], fahrten, '2026-01-01', '2026-12-31')).toBe(80)
  })

  it('achtet auf den Nutzungszeitraum des Teils', () => {
    expect(kmImZeitraum(kette, fahrten, '2026-06-02', '2026-12-31')).toBe(30)
  })

  it('zählt nichts für ein Teil ohne Aufbau', () => {
    expect(kmImZeitraum([], fahrten, '2026-01-01', '2026-12-31')).toBe(0)
  })

  it('rechnet die Kilometer je Rad zusammen', () => {
    expect(kmFuerRad('scott', fahrten)).toBe(130)
    expect(kmFuerRad('spezi', fahrten)).toBe(80)
  })
})

describe('synchronisiereFenster', () => {
  const roh = (id: string, datum: string, meter: number, extra = {}) => ({
    id,
    start_date_local: `${datum}T09:00:00`,
    type: 'Ride',
    distance: meter,
    source: 'WAHOO',
    name: 'Tour',
    ...extra,
  })

  const fenster = {
    ownerId: 'u1',
    provider: 'intervals.icu',
    von: '2026-08-01',
    bis: '2026-08-31',
    neueId: () => 'x',
  }
  let zaehler = 0
  const neueId = () => `id${(zaehler += 1)}`

  it('legt neue Fahrten an', () => {
    const neu = [roh('i1', '2026-08-10', 50000)].map((a) => ausIntervals(a, 'u1'))
    const e = synchronisiereFenster([], neu, { ...fenster, neueId })
    expect(e.neu).toBe(1)
    expect(e.rides[0]).toMatchObject({ km: 50, externalActivityId: 'i1' })
  })

  it('legt dieselbe Fahrt beim zweiten Lauf nicht noch einmal an', () => {
    const neu = [roh('i1', '2026-08-10', 50000)].map((a) => ausIntervals(a, 'u1'))
    const erst = synchronisiereFenster([], neu, { ...fenster, neueId })
    const zweit = synchronisiereFenster(erst.rides, neu, { ...fenster, neueId })
    const dritt = synchronisiereFenster(zweit.rides, neu, { ...fenster, neueId })
    expect(zweit.neu).toBe(0)
    expect(zweit.geaendert).toBe(0)
    expect(dritt.rides).toHaveLength(1)
    expect(dritt.rides[0].km).toBe(50)
  })

  it('schreibt eine drüben korrigierte Fahrt fort, statt sie zu verdoppeln', () => {
    const erst = synchronisiereFenster([], [ausIntervals(roh('i1', '2026-08-10', 50000), 'u1')], {
      ...fenster,
      neueId,
    })
    const zweit = synchronisiereFenster(
      erst.rides,
      [ausIntervals(roh('i1', '2026-08-10', 62000), 'u1')],
      { ...fenster, neueId },
    )
    expect(zweit.rides).toHaveLength(1)
    expect(zweit.geaendert).toBe(1)
    expect(zweit.rides[0].km).toBe(62)
  })

  it('behält die Zuordnung von Hand, wenn der Anbieter die Fahrt ändert', () => {
    const erst = synchronisiereFenster([], [ausIntervals(roh('i1', '2026-08-10', 50000), 'u1')], {
      ...fenster,
      neueId,
    })
    erst.rides[0].override = { bikeId: 'spezi', setupId: 'p-out' }
    const zweit = synchronisiereFenster(
      erst.rides,
      [ausIntervals(roh('i1', '2026-08-10', 51000), 'u1')],
      { ...fenster, neueId },
    )
    expect(zweit.rides[0].override).toEqual({ bikeId: 'spezi', setupId: 'p-out' })
  })

  it('entfernt, was der Anbieter im Fenster nicht mehr führt', () => {
    const erst = synchronisiereFenster(
      [],
      [roh('i1', '2026-08-10', 50000), roh('i2', '2026-08-11', 20000)].map((a) =>
        ausIntervals(a, 'u1'),
      ),
      { ...fenster, neueId },
    )
    const zweit = synchronisiereFenster(
      erst.rides,
      [ausIntervals(roh('i1', '2026-08-10', 50000), 'u1')],
      { ...fenster, neueId },
    )
    expect(zweit.geloescht).toBe(1)
    expect(zweit.rides.map((r: { externalActivityId: string }) => r.externalActivityId)).toEqual([
      'i1',
    ])
  })

  it('lässt Fahrten außerhalb des Fensters und von Hand eingetragene in Ruhe', () => {
    const bestand = [
      {
        id: 'alt',
        ownerId: 'u1',
        date: '2026-05-15',
        km: 72.4,
        indoor: false,
        source: 'MANUAL',
        externalProvider: null,
        externalActivityId: null,
        name: 'Vor dem Wahoo',
      },
      {
        id: 'frueher',
        ownerId: 'u1',
        date: '2026-07-01',
        km: 30,
        indoor: false,
        source: 'INTERVALS_WAHOO',
        externalProvider: 'intervals.icu',
        externalActivityId: 'i0',
        name: 'Tour',
      },
    ]
    const e = synchronisiereFenster(bestand, [], { ...fenster, neueId })
    expect(e.geloescht).toBe(0)
    expect(e.rides).toHaveLength(2)
  })

  it('rührt die Fahrten eines anderen Profils nicht an', () => {
    const bestand = [
      {
        id: 'fremd',
        ownerId: 'u2',
        date: '2026-08-10',
        km: 40,
        indoor: false,
        source: 'INTERVALS_WAHOO',
        externalProvider: 'intervals.icu',
        externalActivityId: 'i9',
        name: 'Tour',
      },
    ]
    const e = synchronisiereFenster(bestand, [], { ...fenster, neueId })
    expect(e.rides).toHaveLength(1)
  })
})

describe('ausWahoo', () => {
  // Der Server rechnet den Zeitstempel in seiner Zeitzone auf einen Tag um;
  // im Test genügt der UTC-Tag.
  const tagAus = (iso: string) => String(iso).slice(0, 10)

  const workout = {
    id: 12345,
    starts: '2026-08-16T10:23:29.000Z',
    minutes: 360,
    name: 'Lange Tour',
    workout_type_id: 15,
    workout_summary: { distance_accum: '170576.84' },
  }

  it('übersetzt ein Wahoo-Workout samt Metern in Kilometer', () => {
    expect(ausWahoo(workout, 'u1', tagAus)).toMatchObject({
      ownerId: 'u1',
      date: '2026-08-16',
      km: 170.58,
      minutes: 360,
      indoor: false,
      source: 'WAHOO',
      externalProvider: 'wahoo',
      externalActivityId: '12345',
    })
  })

  it('erkennt Fahrten auf der Rolle an der Sportart', () => {
    expect(ausWahoo({ ...workout, workout_type_id: 61 }, 'u1', tagAus)?.indoor).toBe(true)
    expect(ausWahoo({ ...workout, workout_type_id: 12 }, 'u1', tagAus)?.indoor).toBe(true)
    expect(ausWahoo({ ...workout, workout_type_id: 0 }, 'u1', tagAus)?.indoor).toBe(false)
  })

  it('lässt alles liegen, was kein Rad ist', () => {
    expect(ausWahoo({ ...workout, workout_type_id: 1 }, 'u1', tagAus)).toBeNull()
    // Motorradfahren zählt bewusst nicht mit
    expect(ausWahoo({ ...workout, workout_type_id: 17 }, 'u1', tagAus)).toBeNull()
  })

  it('nimmt ein Workout ohne Zusammenfassung mit 0 km – die kommt nach', () => {
    const ohne = ausWahoo({ ...workout, workout_summary: null }, 'u1', tagAus)
    expect(ohne?.km).toBe(0)
  })
})

describe('Dubletten über zwei Quellen', () => {
  const vonWahoo = {
    ownerId: 'u1',
    date: '2026-08-16',
    km: 170.58,
    externalProvider: 'wahoo',
    externalActivityId: '12345',
  }

  it('erkennt dieselbe Fahrt aus der zweiten Quelle', () => {
    const ueberIntervals = {
      ...vonWahoo,
      externalProvider: 'intervals.icu',
      externalActivityId: 'i9',
    }
    expect(istDublette(ueberIntervals, [vonWahoo])).toBe(true)
  })

  it('hält zwei verschiedene Fahrten am selben Tag auseinander', () => {
    const andere = {
      ...vonWahoo,
      km: 42,
      externalProvider: 'intervals.icu',
      externalActivityId: 'i9',
    }
    expect(istDublette(andere, [vonWahoo])).toBe(false)
  })

  it('meldet die eigene Quelle nicht als Dublette – die wird an der Id erkannt', () => {
    expect(istDublette(vonWahoo, [vonWahoo])).toBe(false)
  })

  it('legt beim Sync keine Fahrt an, die es schon aus der anderen Quelle gibt', () => {
    const bestand = [
      {
        ...vonWahoo,
        id: 'a',
        indoor: false,
        name: 'Lange Tour',
        source: 'WAHOO',
      },
    ]
    const e = synchronisiereFenster(
      bestand,
      [
        {
          ownerId: 'u1',
          date: '2026-08-16',
          km: 170.6,
          indoor: false,
          name: 'Lange Tour',
          source: 'INTERVALS_WAHOO',
          externalProvider: 'intervals.icu',
          externalActivityId: 'i177141373',
        },
      ],
      {
        ownerId: 'u1',
        provider: 'intervals.icu',
        von: '2026-08-01',
        bis: '2026-08-31',
        neueId: () => 'neu',
      },
    )
    expect(e.neu).toBe(0)
    expect(e.uebersprungen).toBe(1)
    expect(e.rides).toHaveLength(1)
  })

  it('räumt beim Sync nur die Fahrten der eigenen Quelle weg', () => {
    const bestand = [
      { ...vonWahoo, id: 'a', source: 'WAHOO', indoor: false, name: 'Tour' },
      {
        ownerId: 'u1',
        id: 'b',
        date: '2026-08-16',
        km: 12,
        indoor: false,
        name: 'Andere',
        source: 'INTERVALS_WAHOO',
        externalProvider: 'intervals.icu',
        externalActivityId: 'i5',
      },
    ]
    const e = synchronisiereFenster(bestand, [], {
      ownerId: 'u1',
      provider: 'intervals.icu',
      von: '2026-08-01',
      bis: '2026-08-31',
      neueId: () => 'neu',
    })
    expect(e.geloescht).toBe(1)
    expect(e.rides.map((r: { id: string }) => r.id)).toEqual(['a'])
  })
})

describe('Wahoo: geplante Einheiten und fehlende Distanzen', () => {
  const tagAus = (iso: string) => String(iso).slice(0, 10)
  const basis = {
    id: 555,
    starts: '2026-08-12T09:00:00.000Z',
    minutes: 86,
    name: 'ChatGPT: VO₂max 5×5min',
    workout_type_id: 0,
  }

  it('lässt geplante Einheiten aus einem Trainingsplan liegen', () => {
    // Ein Plan legt für jede Einheit ein Workout an – ohne Zusammenfassung ist
    // sie nie gefahren worden
    expect(ausWahoo({ ...basis, plan_id: 16083424 }, 'u1', tagAus)).toBeNull()
    expect(ausWahoo({ ...basis, plan_ids: [1, 2] }, 'u1', tagAus)).toBeNull()
  })

  it('nimmt eine gefahrene Einheit aus dem Plan mit', () => {
    const gefahren = ausWahoo(
      { ...basis, plan_id: 16083424, workout_summary: { distance_accum: '42000.0' } },
      'u1',
      tagAus,
    )
    expect(gefahren?.km).toBe(42)
  })

  it('merkt sich, wenn der Anbieter keine Distanz führt', () => {
    // Rollenfahrt aus einer fremden App: echte Fahrt, aber 0 m
    const rolle = ausWahoo(
      {
        ...basis,
        workout_type_id: 12,
        workout_summary: { distance_accum: '0.0', duration_active_accum: '11905.0' },
      },
      'u1',
      tagAus,
    )
    expect(rolle).toMatchObject({ km: 0, indoor: true, ohneDistanz: true })

    const mitDistanz = ausWahoo(
      { ...basis, workout_summary: { distance_accum: '30000.0' } },
      'u1',
      tagAus,
    )
    expect(mitDistanz?.ohneDistanz).toBe(false)
  })
})

describe('Distanz von Hand', () => {
  const bikes = [{ id: 'r1', ownerId: 'u1', name: 'Rad', from: '2026-01-01' }]
  const setups = [{ id: 's1', bikeId: 'r1', name: 'Rolle', kind: 'indoor' }]
  const { loese } = zuordner(bikes, setups, [
    { id: 'st', ownerId: 'u1', kind: 'indoor', bikeId: 'r1', from: '2026-01-01' },
  ])

  const rolle = {
    id: 'f1',
    ownerId: 'u1',
    date: '2026-07-17',
    km: 0,
    indoor: true,
    ohneDistanz: true,
    source: 'WAHOO',
    externalProvider: 'wahoo',
    externalActivityId: '9',
  }

  it('schlägt den gemeldeten Wert und zählt für den Verschleiß', () => {
    const korrigiert = loese({ ...rolle, kmOverride: 95 })
    expect(korrigiert.km).toBe(95)
    expect(korrigiert.kmGemeldet).toBe(0)
    expect(korrigiert.kmKorrigiert).toBe(true)
    expect(kmImZeitraum(['s1'], [korrigiert], '2026-01-01', '2026-12-31')).toBe(95)
  })

  it('fällt ohne Korrektur auf den gemeldeten Wert zurück', () => {
    const ohne = loese(rolle)
    expect(ohne.km).toBe(0)
    expect(ohne.kmKorrigiert).toBe(false)
  })

  it('überlebt den nächsten Sync', () => {
    const bestand = [{ ...rolle, kmOverride: 95, override: null, createdAt: 'x' }]
    // Der Anbieter meldet die Fahrt unverändert mit 0 km
    const e = synchronisiereFenster(bestand, [{ ...rolle }], {
      ownerId: 'u1',
      provider: 'wahoo',
      von: '2026-07-01',
      bis: '2026-07-31',
      neueId: () => 'neu',
    })
    expect(e.rides).toHaveLength(1)
    expect(e.rides[0].kmOverride).toBe(95)
    expect(loese(e.rides[0]).km).toBe(95)
  })
})

describe('CSV-Import', () => {
  const kopf = 'id,name,date,sport,distance_km'
  const csv = [
    kopf,
    '18133085520,"Ohne Wind wÃ¤re es ein 40er Schnitt geworden...",2026-16-04,"Ride",25.6',
    '17701857781,"MyWhoosh - Zone 2 Endurance 40min",2026-12-03,"Virtual Ride",13.4',
    '15868651574,"Tour auf den Brocken",2025-18-08,"Ride",105.7',
    '99999999999,"Lauf am Morgen",2025-18-08,"Run",9',
    '19770516078,"Zu neu",2026-16-08,"Ride",170.5',
  ].join('\n')

  it('liest Datum als Jahr-Tag-Monat, wenn die Datei es hergibt', () => {
    const { fahrten, datumsformat } = ausCsv(csv, { ownerId: 'u1' })
    expect(datumsformat).toBe('Jahr-Tag-Monat')
    expect(fahrten.map((f: { date: string }) => f.date)).toEqual([
      '2026-04-16',
      '2026-03-12',
      '2025-08-18',
      '2026-08-16',
    ])
  })

  it('nimmt die Distanz als Kilometer und die Sportart als drinnen/draußen', () => {
    const { fahrten } = ausCsv(csv, { ownerId: 'u1' })
    expect(fahrten[0]).toMatchObject({ km: 25.6, indoor: false, source: 'MANUAL' })
    expect(fahrten[1]).toMatchObject({ km: 13.4, indoor: true })
  })

  it('nimmt die Strava-Id als Schlüssel – dieselbe Datei legt nichts doppelt an', () => {
    const a = ausCsv(csv, { ownerId: 'u1' }).fahrten
    expect(a[0].externalActivityId).toBe('18133085520')
    const b = ausCsv(csv, { ownerId: 'u1' }).fahrten
    expect(a.map((f: { externalActivityId: string }) => f.externalActivityId)).toEqual(
      b.map((f: { externalActivityId: string }) => f.externalActivityId),
    )
  })

  it('überspringt fremde Sportarten und alles ab dem Stichtag', () => {
    const { fahrten, ignoriert } = ausCsv(csv, { bis: '2026-05-17', ownerId: 'u1' })
    const namen = fahrten.map((f: { name: string }) => f.name)
    expect(namen).not.toContain('Lauf am Morgen')
    expect(namen).not.toContain('Zu neu')
    expect(ignoriert).toHaveLength(2)
  })

  it('dreht falsch gelesene Umlaute zurück', () => {
    expect(ausCsv(csv, { ownerId: 'u1' }).fahrten[0].name).toContain('wäre')
  })

  it('erkennt Jahr-Monat-Tag, wenn keine Zahl über 12 dagegen spricht', () => {
    const { fahrten, datumsformat } = ausCsv([kopf, '1,"Tour",2026-03-08,"Ride",42'].join('\n'), {
      ownerId: 'u1',
    })
    expect(datumsformat).toBe('Jahr-Monat-Tag')
    expect(fahrten[0].date).toBe('2026-03-08')
  })

  it('meldet einen kaputten Export, statt ihn zu übernehmen', () => {
    const kaputt = [
      kopf,
      '1,"A",2026-18-03,"Ride",100.6',
      '2,"B",2026-18-03,"Ride",100.6',
      '3,"C",2026-18-03,"Ride",100.6',
    ].join('\n')
    expect(ausCsv(kaputt, { ownerId: 'u1' }).verdaechtig).toBe(1)
  })

  it('meckert über eine fremde Kopfzeile', () => {
    expect(ausCsv('a,b,c\n1,2,3').fehler).toContain('Kopfzeile')
  })
})

describe('Gelöschte Fahrten bleiben gelöscht', () => {
  const fahrt = {
    id: 'a',
    ownerId: 'u1',
    date: '2026-08-10',
    km: 50,
    indoor: false,
    name: 'Tour',
    source: 'WAHOO',
    externalProvider: 'wahoo',
    externalActivityId: '900',
    override: null,
    createdAt: 'x',
  }

  it('holt eine entfernte Fahrt beim nächsten Sync nicht zurück', () => {
    const bestand = [{ ...fahrt, deleted: true, deletedAt: '2026-08-18T10:00:00.000Z' }]
    // Der Anbieter meldet sie unverändert weiter
    const e = synchronisiereFenster(bestand, [{ ...fahrt, km: 55 }], {
      ownerId: 'u1',
      provider: 'wahoo',
      von: '2026-08-01',
      bis: '2026-08-31',
      neueId: () => 'neu',
    })
    expect(e.rides).toHaveLength(1)
    expect(e.rides[0].deleted).toBe(true)
    // Fortgeschrieben wird sie trotzdem, falls sie je zurückgeholt wird
    expect(e.rides[0].km).toBe(55)
  })
})

describe('Verschleißfaktor je Aufbau', () => {
  const bikes = [{ id: 'r1', ownerId: 'u1', name: 'Rad', from: '2026-01-01' }]
  const standards = (['outdoor', 'indoor'] as const).map((kind) => ({
    id: kind,
    ownerId: 'u1',
    kind,
    bikeId: 'r1',
    from: '2026-01-01',
  }))
  const setups = [
    { id: 'draussen', bikeId: 'r1', name: 'Draußen', kind: 'outdoor', factor: 1 },
    // Auf der Rolle zählt ein Kilometer nur zu 95 %
    { id: 'rolle', bikeId: 'r1', name: 'Rolle', kind: 'indoor', factor: 0.95 },
  ]
  const { loese } = zuordner(bikes, setups, standards)
  const fahrten = [
    { id: '1', ownerId: 'u1', date: '2026-03-01', km: 100, indoor: false },
    { id: '2', ownerId: 'u1', date: '2026-03-02', km: 100, indoor: true },
  ].map(loese)

  it('gewichtet die Kilometer der Rolle', () => {
    expect(fahrten[0]).toMatchObject({ km: 100, verschleissKm: 100, faktor: 1 })
    expect(fahrten[1]).toMatchObject({ km: 100, verschleissKm: 95, faktor: 0.95 })
  })

  it('rechnet den Verschleiß eines geteilten Teils mit beiden Faktoren', () => {
    expect(kmImZeitraum(['draussen', 'rolle'], fahrten, '2026-01-01', '2026-12-31')).toBe(195)
  })

  it('lässt die gefahrene Strecke des Rades unangetastet', () => {
    expect(kmFuerRad('r1', fahrten)).toBe(200)
  })

  it('nimmt 1, wenn kein Faktor gesetzt ist', () => {
    const ohne = zuordner(bikes, [{ id: 'draussen', bikeId: 'r1', kind: 'outdoor' }], standards)
    expect(
      ohne.loese({ ownerId: 'u1', date: '2026-03-01', km: 80, indoor: false }).verschleissKm,
    ).toBe(80)
  })
})

describe('Statistik', () => {
  const fahrten = [
    { date: '2026-08-16', km: 170.6, indoor: false, bikeId: 'r1', name: 'Lange Tour' },
    { date: '2026-08-02', km: 40, indoor: true, bikeId: 'r1', name: 'Rolle' },
    { date: '2026-06-01', km: 60, indoor: false, bikeId: 'r1', name: 'Juni' },
    { date: '2025-12-24', km: 20, indoor: true, bikeId: 'r1', name: 'Weihnachten' },
  ]
  const bikes = [{ id: 'r1', name: 'Scott' }]

  it('summiert drinnen und draußen getrennt', () => {
    const s = statistik(fahrten, { bikes, heute: '2026-08-18' })
    expect(s.km).toBe(290.6)
    expect(s.indoorKm).toBe(60)
    expect(s.outdoorKm).toBe(230.6)
    expect(s.schnitt).toBe(72.7)
  })

  it('füllt Monate ohne Fahrt auf, statt sie zu überspringen', () => {
    const s = statistik(fahrten, { bikes, heute: '2026-08-18' })
    expect(s.monate[0].monat).toBe('2025-12')
    expect(s.monate.at(-1)!.monat).toBe('2026-08')
    // Januar bis Mai 2026 sind leer, müssen aber in der Reihe stehen
    expect(s.monate).toHaveLength(9)
    expect(s.monate.find((m: { monat: string }) => m.monat === '2026-03')!.km).toBe(0)
  })

  it('zählt Jahre, Räder und die längsten Fahrten', () => {
    const s = statistik(fahrten, { bikes, heute: '2026-08-18' })
    expect(s.jahre.map((j: { jahr: string }) => j.jahr)).toEqual(['2025', '2026'])
    expect(s.raeder[0]).toMatchObject({ name: 'Scott', km: 290.6, fahrten: 4 })
    expect(s.laengste[0].km).toBe(170.6)
  })
})

describe('Distanz aus Intervals.icu ergänzen', () => {
  // Wie Wahoo die MyWhoosh-Fahrt meldet: Startzeit in UTC, keine Distanz
  const wahoo = {
    id: 'w1',
    ownerId: 'u1',
    date: '2026-11-06',
    time: '14:41',
    minutes: 207,
    km: 0,
    indoor: true,
    ohneDistanz: true,
  }
  // Dieselbe Fahrt, von MyWhoosh direkt zu Intervals.icu hochgeladen
  const icu = {
    id: 'i206680256',
    start_date: '2026-11-06T14:41:22Z',
    start_date_local: '2026-11-06T15:41:22',
    moving_time: 12433,
    distance: 104036.95,
  }
  const andere = {
    id: 'i2',
    start_date: '2026-11-06T07:00:00Z',
    start_date_local: '2026-11-06T08:00:00',
    moving_time: 3600,
    distance: 30000,
  }

  it('findet dieselbe Fahrt über Tag und Startzeit', () => {
    expect(passendeAktivitaet(wahoo, [andere, icu])?.id).toBe('i206680256')
  })

  it('nimmt nichts von einem anderen Tag oder ohne Distanz', () => {
    expect(passendeAktivitaet(wahoo, [{ ...icu, start_date_local: '2026-11-05T15:41:22' }])).toBe(
      null,
    )
    expect(passendeAktivitaet(wahoo, [{ ...icu, distance: 0 }])).toBe(null)
    expect(passendeAktivitaet(wahoo, [andere])).toBe(null)
  })

  it('greift ohne Startzeit auf die Dauer zurück', () => {
    expect(passendeAktivitaet({ ...wahoo, time: null }, [andere, icu])?.id).toBe('i206680256')
    expect(passendeAktivitaet({ ...wahoo, time: null, minutes: 100 }, [icu])).toBe(null)
  })

  it('fragt nur für Fahrten ohne jede Distanz', () => {
    expect(brauchtDistanz(wahoo)).toBe(true)
    expect(brauchtDistanz({ ...wahoo, km: 20 })).toBe(false)
    expect(brauchtDistanz({ ...wahoo, kmOverride: 12 })).toBe(false)
    expect(brauchtDistanz({ ...wahoo, kmErgaenzt: 104.04 })).toBe(false)
    expect(brauchtDistanz({ ...wahoo, deleted: true })).toBe(false)
  })

  it('rechnet mit der ergänzten Distanz, von Hand schlägt sie', () => {
    const bikes = [{ id: 'r1', ownerId: 'u1', name: 'Rad', from: '2026-01-01' }]
    const setups = [{ id: 's1', bikeId: 'r1', name: 'Rolle', kind: 'indoor', factor: 0.9 }]
    const { loese } = zuordner(bikes, setups, [
      { id: 'st', ownerId: 'u1', kind: 'indoor', bikeId: 'r1', from: '2026-01-01' },
    ])
    const ergaenzt = loese({ ...wahoo, kmErgaenzt: 104.04 })
    expect(ergaenzt).toMatchObject({ km: 104.04, kmErgaenzt: 104.04, kmKorrigiert: false })
    expect(ergaenzt.verschleissKm).toBe(93.64)
    const vonHand = loese({ ...wahoo, kmErgaenzt: 104.04, kmOverride: 100 })
    expect(vonHand).toMatchObject({ km: 100, kmErgaenzt: null, kmKorrigiert: true })
  })

  it('übersteht den nächsten Sync, der wieder 0 km meldet', () => {
    const bestand = [
      { ...wahoo, externalProvider: 'wahoo', externalActivityId: '513235275', kmErgaenzt: 104.04 },
    ]
    const erneut = {
      ...wahoo,
      name: 'umbenannt',
      externalProvider: 'wahoo',
      externalActivityId: '513235275',
    }
    delete (erneut as Record<string, unknown>).id
    const e = synchronisiereFenster(bestand, [erneut], {
      ownerId: 'u1',
      provider: 'wahoo',
      von: '2026-11-01',
      bis: '2026-11-30',
      neueId: () => 'neu',
    })
    expect(e.geaendert).toBe(1)
    expect(e.rides[0].kmErgaenzt).toBe(104.04)
  })
})
