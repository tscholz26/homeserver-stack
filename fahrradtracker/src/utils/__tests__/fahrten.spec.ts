import { describe, expect, it } from 'vitest'
// @ts-expect-error – plain JS, dieselbe Datei benutzt auch server.js
import {
  ausIntervals,
  ausWahoo,
  istDublette,
  imZeitraum,
  istRadfahrt,
  kmFuerRad,
  kmImZeitraum,
  synchronisiereFenster,
  ueberschneidetSich,
  zuordner,
} from '../../../shared/fahrten.js'

// Scott bis zum 05.09.2026, danach die Specialized – offenes Ende
const scott = {
  id: 'scott',
  ownerId: 'u1',
  name: 'Scott Speedster',
  from: '2025-05-01',
  to: '2026-09-05',
}
const spezi = { id: 'spezi', ownerId: 'u1', name: 'Specialized', from: '2026-09-06', to: null }
const bikes = [scott, spezi]

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

describe('Nutzungszeiträume', () => {
  it('kennt das offene Ende', () => {
    expect(imZeitraum('2026-12-24', '2026-09-06', null)).toBe(true)
    expect(imZeitraum('2026-09-05', '2026-09-06', null)).toBe(false)
  })

  it('erkennt Überschneidungen', () => {
    expect(ueberschneidetSich(scott, spezi)).toBe(false)
    expect(ueberschneidetSich(scott, { from: '2026-09-01', to: null })).toBe(true)
    expect(ueberschneidetSich({ from: '2025-01-01', to: null }, spezi)).toBe(true)
  })
})

describe('Zuordnung über das Datum', () => {
  const { loese } = zuordner(bikes, setups)

  it('schiebt die Fahrt auf das Rad, das an dem Tag gefahren wurde', () => {
    expect(loese(fahrt({ date: '2026-08-20' })).bikeId).toBe('scott')
    expect(loese(fahrt({ date: '2026-09-10' })).bikeId).toBe('spezi')
  })

  it('trifft die Randtage genau', () => {
    expect(loese(fahrt({ date: '2026-09-05' })).bikeId).toBe('scott')
    expect(loese(fahrt({ date: '2026-09-06' })).bikeId).toBe('spezi')
  })

  it('wählt den Aufbau nach drinnen/draußen', () => {
    expect(loese(fahrt({ indoor: false })).setupId).toBe('s-out')
    expect(loese(fahrt({ indoor: true })).setupId).toBe('s-in')
  })

  it('meldet Fahrten ohne Rad als unzugeordnet, statt sie irgendwo zu verbuchen', () => {
    const alt = loese(fahrt({ date: '2024-01-01' }))
    expect(alt.bikeId).toBeNull()
    expect(alt.unassigned).toBe(true)
  })

  it('meldet auch eine Rollenfahrt ohne Rollen-Aufbau als unzugeordnet', () => {
    const drinnen = loese(fahrt({ date: '2026-09-10', indoor: true }))
    expect(drinnen.bikeId).toBe('spezi')
    expect(drinnen.setupId).toBeNull()
    expect(drinnen.unassigned).toBe(true)
  })

  it('lässt sich von Hand übersteuern', () => {
    const f = loese(fahrt({ date: '2026-08-20', override: { bikeId: 'spezi', setupId: 'p-out' } }))
    expect(f.bikeId).toBe('spezi')
    expect(f.setupId).toBe('p-out')
  })
})

describe('Verschleiß über geteilte Teile', () => {
  const { loese } = zuordner(bikes, setups)
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
  const bikes = [{ id: 'r1', ownerId: 'u1', name: 'Rad', from: '2026-01-01', to: null }]
  const setups = [{ id: 's1', bikeId: 'r1', name: 'Rolle', kind: 'indoor' }]
  const { loese } = zuordner(bikes, setups)

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
