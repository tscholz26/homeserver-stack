import { describe, expect, it } from 'vitest'
import {
  mengenZusammenfassen,
  mengeStufen,
  mengeZusammenfassen,
  parseMenge,
  portionsSchritt,
} from '@/utils/mengen'

describe('parseMenge', () => {
  it('trennt Zahl und Einheit', () => {
    expect(parseMenge('250 g')).toEqual({ zahl: 250, einheit: 'g' })
    expect(parseMenge('1,5kg')).toEqual({ zahl: 1.5, einheit: 'kg' })
    expect(parseMenge('2')).toEqual({ zahl: 2, einheit: '' })
  })

  it('führt Schreibweisen derselben Einheit zusammen', () => {
    expect(parseMenge('2 Stück')?.einheit).toBe('St.')
    expect(parseMenge('2 St.')?.einheit).toBe('St.')
    expect(parseMenge('1 Pck.')?.einheit).toBe('Packung')
  })

  it('lässt die Finger von allem, was keine saubere Menge ist', () => {
    expect(parseMenge('nach Gefühl')).toBeNull()
    expect(parseMenge('2 große')).toBeNull()
    expect(parseMenge('')).toBeNull()
  })
})

describe('mengeZusammenfassen', () => {
  it('addiert gleiche Einheiten', () => {
    expect(mengeZusammenfassen('250 g', '200 g')).toBe('450 g')
    expect(mengeZusammenfassen('1', '2')).toBe('3')
    expect(mengeZusammenfassen('2 Stück', '1 St.')).toBe('3 St.')
    expect(mengeZusammenfassen('1 Dose', '1 Dose')).toBe('2 Dosen')
    expect(mengeZusammenfassen('1 Packung', '')).toBe('1 Packung')
    expect(mengeZusammenfassen('0,5 l', '1 Liter')).toBe('1,5 l')
  })

  it('stellt Unvereinbares nebeneinander, statt sich etwas auszudenken', () => {
    expect(mengeZusammenfassen('1 Packung', '200 g')).toBe('1 Packung + 200 g')
    expect(mengeZusammenfassen('500 g', '1 kg')).toBe('500 g + 1 kg')
    expect(mengeZusammenfassen('2 große', '1 kleine')).toBe('2 große + 1 kleine')
  })

  it('behandelt fehlende Angaben als nichts', () => {
    expect(mengeZusammenfassen('', '200 g')).toBe('200 g')
    expect(mengeZusammenfassen('200 g', '')).toBe('200 g')
    expect(mengeZusammenfassen('', '')).toBe('')
  })

  it('rechnet auch dann weiter, wenn schon etwas nebeneinander steht', () => {
    // Sonst wächst die Angabe mit jedem Rezept um ein Glied
    // Die Reihenfolge folgt dem ersten Auftreten der Einheit
    expect(mengeZusammenfassen('1 Becher + 30 g', '20 g')).toBe('1 Becher + 50 g')
    expect(mengeZusammenfassen('500 g + 1 Packung', '250 g')).toBe('750 g + 1 Packung')
  })

  it('schreibt dieselbe Angabe nicht zweimal hin', () => {
    expect(mengeZusammenfassen('nach Geschmack', 'nach Geschmack')).toBe('nach Geschmack')
    expect(mengeZusammenfassen('etwas', 'Etwas')).toBe('etwas')
  })
})

describe('mengenZusammenfassen', () => {
  it('hält auch 25 Angaben kurz', () => {
    // Genau der Fall, der die Liste unlesbar gemacht hat: ein Dutzend Rezepte
    // mit „nach Geschmack“ und ein paar Gramm-Angaben
    const angaben = ['1 Prise', '5 g', 'nach Geschmack', '10 g', 'nach Geschmack', '20 g']
    expect(mengenZusammenfassen(angaben)).toBe('1 Prise + 35 g + nach Geschmack')
  })

  it('trennt nach Einheiten', () => {
    expect(mengenZusammenfassen(['700 ml', '250 ml', '2 l'])).toBe('950 ml + 2 l')
  })

  it('zerlegt nur am eigenen Trennzeichen', () => {
    // „500+ g“ ist eine Angabe, kein Paar – sonst wird daraus „500 + g“
    expect(mengenZusammenfassen(['500+ g'])).toBe('500+ g')
    expect(mengenZusammenfassen(['16 (+1)'])).toBe('16 (+1)')
    // Gerechnetes steht vorn, Freitext dahinter
    expect(mengenZusammenfassen(['2-3 Dosen', '500 g'])).toBe('500 g + 2-3 Dosen')
  })
})

describe('portionsSchritt', () => {
  it('zählt Stückiges in Einern', () => {
    expect(portionsSchritt('1 Packung')).toBe(1)
    expect(portionsSchritt('2 EL')).toBe(1)
    expect(portionsSchritt('3')).toBe(1)
  })

  it('nimmt bei Gewicht und Volumen die Menge selbst als Schritt', () => {
    expect(portionsSchritt('250 g')).toBe(250)
    expect(portionsSchritt('0,5 l')).toBe(0.5)
  })

  it('gibt auf, wo nichts zu rechnen ist', () => {
    expect(portionsSchritt('nach Geschmack')).toBeNull()
    expect(portionsSchritt('250 g + 1 Packung')).toBeNull()
  })
})

describe('mengeStufen', () => {
  it('macht aus 250 g zwei Portionen und wieder zurück', () => {
    // Der Fall, für den es die Knöpfe gibt: ein zweites Gericht mit denselben
    // Cherrytomaten
    expect(mengeStufen('250 g', '250 g', 1)).toBe('500 g')
    expect(mengeStufen('500 g', '250 g', 1)).toBe('750 g')
    expect(mengeStufen('750 g', '250 g', -1)).toBe('500 g')
  })

  it('zählt Packungen einzeln und schreibt den Plural mit', () => {
    expect(mengeStufen('1 Packung', '1 Packung', 1)).toBe('2 Packungen')
    expect(mengeStufen('2 Packungen', '1 Packung', -1)).toBe('1 Packung')
  })

  it('macht aus keiner Angabe eine Zwei und daraus wieder nichts', () => {
    // Ohne Menge steht implizit eine da – der erste Tipp meint „das doppelte“
    expect(mengeStufen('', '1', 1)).toBe('2')
    expect(mengeStufen('2', '1', -1)).toBe('')
  })

  it('geht nicht unter eine Portion', () => {
    expect(mengeStufen('250 g', '250 g', -1)).toBe('250 g')
    expect(mengeStufen('1 Packung', '1 Packung', -1)).toBe('1 Packung')
  })

  it('lässt Unrechenbares in Ruhe', () => {
    expect(mengeStufen('nach Geschmack', 'nach Geschmack', 1)).toBeNull()
    expect(mengeStufen('500 g + 2 Dosen', '500 g + 2 Dosen', 1)).toBeNull()
  })
})
