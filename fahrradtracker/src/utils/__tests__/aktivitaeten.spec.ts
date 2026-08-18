import { describe, expect, it } from 'vitest'
// @ts-expect-error – plain JS, wird auch von server.js benutzt
import { kmImZeitraum, passtZumRad, zugeteilteTypen } from '../../../shared/aktivitaeten.js'

const rennrad = { id: 'r1', ownerId: 'u1', workoutTypeIds: [0, 15] }
const mtb = { id: 'r2', ownerId: 'u1', workoutTypeIds: [13] }

const fahrten = [
  { id: '1', userId: 'u1', date: '2026-04-10', km: 100, workoutTypeId: 15 },
  { id: '2', userId: 'u1', date: '2026-06-01', km: 250.5, workoutTypeId: 0 },
  { id: '3', userId: 'u1', date: '2026-08-17', km: 49.5, workoutTypeId: 15 },
  { id: '4', userId: 'u1', date: '2026-06-02', km: 999, workoutTypeId: 13 },
  { id: '5', userId: 'u1', date: '2026-06-03', km: 42, workoutTypeId: 1 },
  { id: '6', userId: 'u2', date: '2026-06-04', km: 77, workoutTypeId: 15 },
]

describe('passtZumRad', () => {
  it('nimmt nur die zugeteilten Workout-Typen', () => {
    expect(passtZumRad(rennrad, fahrten[0])).toBe(true)
    expect(passtZumRad(rennrad, fahrten[3])).toBe(false)
    expect(passtZumRad(mtb, fahrten[3])).toBe(true)
  })

  it('lässt fremde Profile und nicht zugeteilte Typen draußen', () => {
    expect(passtZumRad(rennrad, fahrten[5])).toBe(false)
    expect(passtZumRad(rennrad, fahrten[4])).toBe(false)
  })

  it('zählt nichts für ein Rad ohne Zuordnung', () => {
    expect(passtZumRad({ id: 'r3', ownerId: 'u1', workoutTypeIds: [] }, fahrten[0])).toBe(false)
  })
})

describe('kmImZeitraum', () => {
  it('summiert nur die Fahrten im Zeitraum, beide Randtage zählen mit', () => {
    expect(kmImZeitraum(rennrad, fahrten, '2026-04-10', '2026-06-01')).toBe(350.5)
    expect(kmImZeitraum(rennrad, fahrten, '2026-04-11', '2026-05-31')).toBe(0)
    expect(kmImZeitraum(rennrad, fahrten, '2026-01-01', '2026-12-31')).toBe(400)
  })

  it('hält die Räder auseinander', () => {
    expect(kmImZeitraum(mtb, fahrten, '2026-01-01', '2026-12-31')).toBe(999)
  })
})

describe('zugeteilteTypen', () => {
  it('sammelt die Typen aller Räder eines Profils', () => {
    expect([...zugeteilteTypen([rennrad, mtb], 'u1')].sort()).toEqual([0, 13, 15])
    expect([...zugeteilteTypen([rennrad, mtb], 'u2')]).toEqual([])
  })
})
