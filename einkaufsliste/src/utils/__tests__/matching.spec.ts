import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findCatalogMatch,
  levenshtein,
  normalize,
  suggestCatalogEntries,
  type CatalogEntry,
} from '@/utils/matching'

// Gegen den echten Katalog testen: die Fallstricke stecken in den Aliasen.
// Er steht in derselben Datei, die auch die App benutzt.
const catalog = JSON.parse(
  readFileSync(resolve(process.cwd(), 'export/katalog.json'), 'utf8'),
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

  it('rät bei kurzen Wörtern höchstens eine Abweichung', () => {
    // „Salami“ lag über zwei Abweichungen beim Alias „Halumi“ und damit im
    // Kühlregal – bei sechs Buchstaben ist das reines Raten
    const mini: CatalogEntry[] = [
      { name: 'Halloumi', aliases: ['Halumi'], category_id: 'milch_kuehlwaren' },
    ]
    expect(findCatalogMatch('Salami', mini)).toBeNull()
    expect(findCatalogMatch('Hallouni', mini)?.name).toBe('Halloumi')
  })

  it('ordnet Wurst der Wursttheke zu', () => {
    expect(kategorie('Salami')).toBe('fleisch_wurst')
    expect(kategorie('Mortadella')).toBe('fleisch_wurst')
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

describe('suggestCatalogEntries', () => {
  it('schlägt für ein Kompositum die verwandten Artikel vor', () => {
    // Automatisch zugeordnet wird hier nichts, vorgeschlagen schon
    expect(findCatalogMatch('Kokosjoghurt', catalog)).toBeNull()
    const namen = suggestCatalogEntries('Kokosjoghurt', catalog).map((e) => e.name)
    expect(namen).toContain('Joghurt')
  })

  it('sortiert den ähnlichsten Artikel nach vorn', () => {
    expect(suggestCatalogEntries('Zuchhini', catalog)[0]?.name).toBe('Zucchini')
  })

  it('bleibt bei Fremdem knapp und zufällig ähnliches fällt raus', () => {
    // „Lauch“ steckt nun einmal drin – „Paprikapulver“ hat dagegen nichts damit
    // zu tun und darf nicht über die reine Wortlänge hereinrutschen
    const namen = suggestCatalogEntries('Fahrradschlauch', catalog).map((e) => e.name)
    expect(namen).toEqual(['Lauch'])
    expect(suggestCatalogEntries('ab', catalog)).toEqual([])
  })
})
