import { jsPDF } from 'jspdf'
import type { Category, Item } from '@/composables/usePackStore'

const PAGE_W = 210
const PAGE_H = 297
const TEXT_GAP = 2.4

export interface PdfOptions {
  // Already packed items get a printed check mark, so you can continue on paper
  packedItemIds?: ReadonlySet<string>
  tripName?: string
}

interface Density {
  columns: number
  fontSize: number
  lineHeight: number
  margin: number
  colGap: number
  box: number
}

// Von gut lesbar nach eng: gerendert wird die erste Stufe, die auf eine Seite
// passt. Wächst die Liste, rutscht sie automatisch eine Stufe weiter, statt
// still auf Seite zwei zu laufen.
const DENSITIES: Density[] = [
  { columns: 2, fontSize: 9, lineHeight: 4.8, margin: 14, colGap: 10, box: 3.2 },
  { columns: 3, fontSize: 8.5, lineHeight: 4.3, margin: 10, colGap: 6, box: 3 },
  { columns: 3, fontSize: 7.8, lineHeight: 3.9, margin: 8, colGap: 5, box: 2.7 },
  { columns: 4, fontSize: 7, lineHeight: 3.5, margin: 7, colGap: 4, box: 2.4 },
]

function render(
  categories: Category[],
  itemsByCategory: Record<string, Item[]>,
  options: PdfOptions,
  d: Density,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const packedItemIds = options.packedItemIds ?? new Set<string>()
  const colW = (PAGE_W - d.margin * 2 - d.colGap * (d.columns - 1)) / d.columns
  const categoryGap = d.lineHeight * 0.7
  const baseline = d.lineHeight - 1.4

  // Eine knappe Zeile Titel, damit ein Ausdruck zuordenbar bleibt
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text(
    options.tripName ? `Packliste – ${options.tripName}` : 'Packliste',
    d.margin,
    d.margin + 3,
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(d.fontSize)

  const bottom = PAGE_H - d.margin
  let colTop = d.margin + 7
  let col = 0
  let y = colTop

  const colX = () => d.margin + col * (colW + d.colGap)

  function nextColumn() {
    if (col < d.columns - 1) {
      col++
    } else {
      doc.addPage()
      col = 0
      colTop = d.margin
    }
    y = colTop
  }

  // Move on if the next block (e.g. heading plus first item) would overflow
  function ensure(height: number) {
    if (y + height > bottom) nextColumn()
  }

  for (const category of categories) {
    const items = itemsByCategory[category.id] ?? []
    if (items.length === 0) continue

    if (y > colTop) y += categoryGap
    ensure(d.lineHeight * 2.5)
    doc.setFont('helvetica', 'bold')
    doc.text(category.name, colX(), y + baseline)
    y += d.lineHeight + 0.8
    doc.setFont('helvetica', 'normal')

    for (const item of items) {
      const lines: string[] = doc.splitTextToSize(item.name, colW - d.box - TEXT_GAP)
      ensure(lines.length * d.lineHeight)
      const bx = colX()
      const by = y + baseline - d.box + 0.5
      doc.rect(bx, by, d.box, d.box)
      if (packedItemIds.has(item.id)) {
        const s = d.box / 3.2
        doc.setLineWidth(0.55 * s)
        doc.line(bx + 0.6 * s, by + 1.7 * s, bx + 1.25 * s, by + 2.45 * s)
        doc.line(bx + 1.25 * s, by + 2.45 * s, bx + 2.6 * s, by + 0.75 * s)
        doc.setLineWidth(0.2)
      }
      doc.text(lines, bx + d.box + TEXT_GAP, y + baseline)
      y += lines.length * d.lineHeight
    }
  }

  return doc
}

export function buildPacklisteDoc(
  categories: Category[],
  itemsByCategory: Record<string, Item[]>,
  options: PdfOptions = {},
): jsPDF {
  let doc = render(categories, itemsByCategory, options, DENSITIES[0]!)
  for (const density of DENSITIES) {
    doc = render(categories, itemsByCategory, options, density)
    if (doc.getNumberOfPages() === 1) break
  }
  return doc
}

export function exportPackliste(
  categories: Category[],
  itemsByCategory: Record<string, Item[]>,
  options: PdfOptions = {},
) {
  const slug = options.tripName
    ?.toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, '-')
    .replace(/^-+|-+$/g, '')
  buildPacklisteDoc(categories, itemsByCategory, options).save(
    slug ? `packliste-${slug}.pdf` : 'packliste.pdf',
  )
}
