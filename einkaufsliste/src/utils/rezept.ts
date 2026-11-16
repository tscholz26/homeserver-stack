import { findCatalogMatch, normalize, type CatalogEntry } from '@/utils/matching'
import { mengeZusammenfassen } from '@/utils/mengen'

/**
 * Vorbereitung, bevor ein Rezept auf der Liste landet: Für jede Zutat steht
 * fest, in welche Kategorie sie gehört und ob sie schon auf der Liste steht.
 *
 * Was daraus wird, entscheidet das Fenster davor – hier wird nur gerechnet.
 */

export interface Zutat {
  name: string
  quantity: string
}

export interface ListenArtikel {
  id: string
  name: string
  quantity: string
  matchedName: string
  done: boolean
}

export interface PlanZeile extends Zutat {
  categoryId: string
  matchedName: string
  /** Artikel auf der Liste, der dieselbe Sache meint – sonst null */
  vorhandenId: string | null
  vorhandenMenge: string
  /** Menge, die nach dem Zusammenlegen auf der Zeile stünde */
  zusammen: string
}

/**
 * Zwei Namen meinen denselben Artikel, wenn der Katalog beide auf denselben
 * Eintrag zurückführt („Cherrytomaten“ und „Kirschtomaten“) – und sonst, wenn
 * sie sich buchstäblich gleichen.
 */
function istDerselbe(zutat: { name: string; matchedName: string }, artikel: ListenArtikel) {
  if (zutat.matchedName && artikel.matchedName) {
    return normalize(zutat.matchedName) === normalize(artikel.matchedName)
  }
  return normalize(zutat.name) === normalize(artikel.name)
}

export function planeRezept(
  zutaten: Zutat[],
  artikel: ListenArtikel[],
  catalog: CatalogEntry[],
): PlanZeile[] {
  return zutaten.map((z) => {
    const match = findCatalogMatch(z.name, catalog)
    const zeile = {
      name: z.name,
      quantity: z.quantity,
      categoryId: match?.category_id ?? 'sonstiges',
      matchedName: match?.name ?? '',
    }

    // Abgehaktes zählt nicht: was im Wagen liegt, ist erledigt – der Bedarf
    // aus dem Rezept ist ein neuer.
    const vorhanden = artikel.find((a) => !a.done && istDerselbe(zeile, a)) ?? null

    return {
      ...zeile,
      vorhandenId: vorhanden?.id ?? null,
      vorhandenMenge: vorhanden?.quantity ?? '',
      zusammen: vorhanden ? mengeZusammenfassen(vorhanden.quantity, z.quantity) : z.quantity,
    }
  })
}

/**
 * Zerlegt Freitext in Text und Links, damit ein eingefügter Verweis auf das
 * Originalrezept antippbar wird. Nur http(s) – alles andere bleibt Text.
 */
export function textMitLinks(text: string): { text: string; url?: string }[] {
  const teile: { text: string; url?: string }[] = []
  let pos = 0
  for (const treffer of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    // Satzzeichen am Ende gehören zum Satz, nicht zur Adresse
    const url = treffer[0].replace(/[.,;:!?)\]]+$/, '')
    if (treffer.index > pos) teile.push({ text: text.slice(pos, treffer.index) })
    teile.push({ text: url, url })
    pos = treffer.index + url.length
  }
  if (pos < text.length) teile.push({ text: text.slice(pos) })
  return teile
}
