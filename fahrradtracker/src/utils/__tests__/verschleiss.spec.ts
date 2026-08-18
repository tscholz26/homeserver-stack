import { describe, expect, it } from 'vitest'
import { ampel, datumText, kmText, ringAnteil, zeitraumText } from '@/utils/verschleiss'

const standard = { yellow: 70, red: 100 }

describe('ampel', () => {
  it('bleibt unter der gelben Schwelle grün', () => {
    expect(ampel(0, standard)).toBe('gruen')
    expect(ampel(69, standard)).toBe('gruen')
  })

  it('wird ab der gelben Schwelle gelb und ab der roten rot', () => {
    expect(ampel(70, standard)).toBe('gelb')
    expect(ampel(99, standard)).toBe('gelb')
    expect(ampel(100, standard)).toBe('rot')
    expect(ampel(180, standard)).toBe('rot')
  })

  it('folgt eigenen Schwellen aus den Einstellungen', () => {
    expect(ampel(55, { yellow: 50, red: 90 })).toBe('gelb')
    expect(ampel(95, { yellow: 50, red: 90 })).toBe('rot')
  })
})

describe('Texte', () => {
  it('schreibt Kilometer mit Tausenderpunkt', () => {
    expect(kmText(1234)).toBe('1.234 km')
    expect(kmText(12.4)).toBe('12,4 km')
  })

  it('dreht ISO-Daten auf deutsche Schreibweise', () => {
    expect(datumText('2026-04-04')).toBe('04.04.2026')
    expect(datumText('')).toBe('')
  })

  it('macht aus einem offenen Zeitraum ein „seit“', () => {
    expect(zeitraumText('2026-04-04', '2026-08-18')).toBe('04.04.2026 – 18.08.2026')
    expect(zeitraumText('2026-04-04', null)).toBe('seit 04.04.2026')
  })
})

describe('ringAnteil', () => {
  it('deckelt den Ring bei 100 Prozent', () => {
    expect(ringAnteil(140)).toBe(100)
    expect(ringAnteil(-5)).toBe(0)
    expect(ringAnteil(42)).toBe(42)
  })
})
