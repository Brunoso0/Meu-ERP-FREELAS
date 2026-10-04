import { jsPDF } from 'jspdf'
import { formatDate } from './utils'

const MARGIN = 20
const WIDTH = 170 // A4 (210mm) menos as margens
const BOTTOM = 277
const BRAND: [number, number, number] = [79, 70, 229]
const INK: [number, number, number] = [15, 23, 42]
const SOFT: [number, number, number] = [100, 116, 139]

type TextOptions = { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number; indent?: number }

/** Cursor vertical com quebra de página automática. */
class Writer {
  y = MARGIN
  constructor(readonly doc: jsPDF) {}

  ensure(height: number) {
    if (this.y + height > BOTTOM) {
      this.doc.addPage()
      this.y = MARGIN
    }
  }

  text(content: string, { size = 10, bold = false, color = INK, gap = 2, indent = 0 }: TextOptions = {}) {
    const { doc } = this
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lineHeight = size * 0.3528 * 1.45
    for (const line of doc.splitTextToSize(content, WIDTH - indent) as string[]) {
      this.ensure(lineHeight)
      this.y += lineHeight
      doc.text(line, MARGIN + indent, this.y)
    }
    this.y += gap
  }

  heading(label: string) {
    this.y += 5
    this.ensure(14)
    this.text(label.toUpperCase(), { size: 8, bold: true, color: BRAND, gap: 1.5 })
  }

  rule() {
    this.ensure(4)
    this.doc.setDrawColor(226, 232, 240)
    this.doc.line(MARGIN, this.y + 1, MARGIN + WIDTH, this.y + 1)
    this.y += 3
  }
}

function header(doc: jsPDF, issuer: string, label: string, sub: string) {
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(issuer, MARGIN, 18)
  doc.setFontSize(10)
  doc.text(label, MARGIN + WIDTH, 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(sub, MARGIN + WIDTH, 20, { align: 'right' })
}

function footer(doc: jsPDF, text: string) {
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...SOFT)
    doc.text(text, MARGIN, 289)
    doc.text(`${p} / ${pages}`, MARGIN + WIDTH, 289, { align: 'right' })
  }
}

// sem acentos nem espaços: nomes de arquivo que funcionam em qualquer sistema
const fileName = (base: string) =>
  base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '') + '.pdf'

/** Converte o markdown simples dos contratos (#, ##, parágrafos, **negrito**) em PDF. */
export function downloadContractPdf(title: string, markdown: string, issuer: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, issuer, 'CONTRATO', `Gerado em ${formatDate(new Date())}`)
  const w = new Writer(doc)
  w.y = 38

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const plain = line.replace(/\*\*/g, '')
    if (line.startsWith('# ')) w.text(plain.slice(2), { size: 15, bold: true, gap: 3 })
    else if (line.startsWith('## ')) {
      w.y += 3
      w.text(plain.slice(3), { size: 10.5, bold: true, gap: 1.5 })
    } else w.text(plain, { size: 10, gap: 2.5 })
  }

  footer(doc, title)
  doc.save(fileName(title))
}
