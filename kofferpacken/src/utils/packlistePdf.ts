import { jsPDF } from 'jspdf'
import type { Category, Item } from '@/composables/usePackStore'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 14
const COL_GAP = 10
const COL_W = (PAGE_W - MARGIN * 2 - COL_GAP) / 2
const LINE_H = 4.8
const BOX = 3.2
const TEXT_GAP = 2.4
const CATEGORY_GAP = 3.5

export function buildPacklisteDoc(
  categories: Category[],
  itemsByCategory: Record<string, Item[]>,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Packliste', MARGIN, MARGIN + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(120)
  doc.text('Zum Abhaken mit dem Stift', PAGE_W - MARGIN, MARGIN + 4, { align: 'right' })
  doc.setTextColor(0)
  doc.setFontSize(9)

  const bottom = PAGE_H - MARGIN
  let colTop = MARGIN + 13
  let col = 0
  let y = colTop

  const colX = () => MARGIN + col * (COL_W + COL_GAP)

  function nextColumn() {
    if (col === 0) {
      col = 1
    } else {
      doc.addPage()
      col = 0
      colTop = MARGIN + 4
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

    if (y > colTop) y += CATEGORY_GAP
    ensure(LINE_H * 2.5)
    doc.setFont('helvetica', 'bold')
    doc.text(category.name, colX(), y + LINE_H - 1.4)
    y += LINE_H + 0.8
    doc.setFont('helvetica', 'normal')

    for (const item of items) {
      const lines: string[] = doc.splitTextToSize(item.name, COL_W - BOX - TEXT_GAP)
      ensure(lines.length * LINE_H)
      doc.rect(colX(), y + LINE_H - 1.4 - BOX + 0.5, BOX, BOX)
      doc.text(lines, colX() + BOX + TEXT_GAP, y + LINE_H - 1.4)
      y += lines.length * LINE_H
    }
  }

  return doc
}

export function exportEmptyPackliste(
  categories: Category[],
  itemsByCategory: Record<string, Item[]>,
) {
  buildPacklisteDoc(categories, itemsByCategory).save('packliste.pdf')
}
