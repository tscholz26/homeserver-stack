import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findCatalogMatch, levenshtein, normalize, type CatalogEntry } from '@/utils/matching'

// Gegen den echten Katalog testen: die Fallstricke stecken in den Aliasen
const catalog = JSON.parse(
  readFileSync(resolve(process.cwd(), 'seed/artikelkatalog.json'), 'utf8'),
) as CatalogEntry[]

function kategorie(eingabe: string): string | null {
  return findCatalogMatch(eingabe, catalog)?.category_id ?? null
}

describe('normalize', () => {
  it('vereinheitlicht Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(normalize('  Rote   BEETE ')).toBe('rote beete')
  })
})

describe('levenshtein', () => {
  it('zählt einzelne Änderungen', () => {
    expect(levenshtein('milch', 'milch')).toBe(0)
    expect(levenshtein('mich', 'milch')).toBe(1)
    expect(levenshtein('zuchini', 'zucchini')).toBe(1)
  })

  it('bricht oberhalb der Obergrenze ab', () => {
    expect(levenshtein('kaffee', 'klopapier', 2)).toBeGreaterThan(2)
  })
})

describe('findCatalogMatch', () => {
  it('findet den exakten Namen unabhängig von der Schreibweise', () => {
    expect(findCatalogMatch('  hähnchenbrust ', catalog)?.name).toBe('Hähnchenbrust')
  })

  it('findet Aliase', () => {
    expect(kategorie('Knobi')).toBe('obst_gemuese')
    expect(kategorie('Philadelphia')).toBe('milch_kuehlwaren')
    expect(kategorie('Klorolle')).toBe('drogerie')
  })

  it('erkennt Artikel als Teil einer längeren Eingabe', () => {
    expect(kategorie('Bio Zitronen')).toBe('obst_gemuese')
    expect(findCatalogMatch('gehackte Tomaten Dose', catalog)?.name).toBe('Tomaten (Dose)')
  })

  it('fängt Vertipper über die Levenshtein-Distanz ab', () => {
    expect(findCatalogMatch('Champignins', catalog)?.name).toBe('Champignons')
    expect(findCatalogMatch('Kartofeln', catalog)?.name).toBe('Kartoffeln')
  })

  it('gibt ohne Treffer null zurück', () => {
    expect(findCatalogMatch('Wackelpudding', catalog)).toBeNull()
    expect(findCatalogMatch('', catalog)).toBeNull()
  })

  it('fällt nicht auf zufällige Silben in Komposita herein', () => {
    // „Fahrradschlauch“ enthält zwar „lauch“, meint aber kein Gemüse
    expect(findCatalogMatch('Fahrradschlauch', catalog)).toBeNull()
    expect(findCatalogMatch('Blumenerde', catalog)).toBeNull()
  })

  it('rät bei sehr kurzen Eingaben nicht', () => {
    // „xyz“ läge über die Distanz sonst neben zig Einträgen
    expect(findCatalogMatch('xyz', catalog)).toBeNull()
  })
})
