import { jsPDF } from 'jspdf'
import type { ProposalDoc } from './proposal'
import { formatCurrency, formatDate } from './utils'

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

export function downloadProposalPdf(p: ProposalDoc) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, p.issuer.name, `PROPOSTA COMERCIAL ${p.number}`, `Emitida em ${formatDate(p.date)}`)

  const w = new Writer(doc)
  w.y = 38
  w.text(p.title, { size: 18, bold: true, gap: 1 })
  w.text(`Válida até ${formatDate(p.validUntil)} (${p.validityDays} dias)`, { size: 9, color: SOFT })

  w.heading('Cliente')
  w.text([p.client.name, p.client.company].filter(Boolean).join(' - ') || 'Cliente não informado', { bold: true, gap: 0.5 })
  const contact = [p.client.document, p.client.email, p.client.phone].filter(Boolean).join('  |  ')
  if (contact) w.text(contact, { size: 9, color: SOFT })

  if (p.scope) {
    w.heading('Escopo')
    w.text(p.scope)
  }

  if (p.deliverables.length) {
    w.heading('Entregáveis')
    p.deliverables.forEach((d) => w.text(`-  ${d}`, { gap: 0.5 }))
  }

  if (p.schedule.length) {
    w.heading('Cronograma')
    p.schedule.forEach((s, i) => w.text(`${i + 1}. ${s.label}${s.duration ? ` (${s.duration})` : ''}`, { gap: 0.5 }))
  }

  if (p.items.length) {
    w.heading('Investimento')
    p.items.forEach((item) => {
      const amount = formatCurrency(item.quantity * item.unit_price)
      w.ensure(8)
      const top = w.y
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      const lines = doc.splitTextToSize(`${item.description}${item.quantity !== 1 ? `  (${item.quantity} x ${formatCurrency(item.unit_price)})` : ''}`, WIDTH - 40) as string[]
      lines.forEach((line, i) => doc.text(line, MARGIN, top + 5 + i * 5))
      doc.text(amount, MARGIN + WIDTH, top + 5, { align: 'right' })
      w.y = top + 5 + (lines.length - 1) * 5 + 2
      w.rule()
    })
  }

  w.ensure(14)
  w.y += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text('Total', MARGIN, w.y + 5)
  doc.setTextColor(...BRAND)
  doc.text(formatCurrency(p.total), MARGIN + WIDTH, w.y + 5, { align: 'right' })
  w.y += 9

  if (p.paymentTerms) {
    w.heading('Condições de pagamento')
    w.text(p.paymentTerms)
  }

  w.ensure(34)
  w.y += 22
  doc.setDrawColor(...SOFT)
  doc.line(MARGIN, w.y, MARGIN + 75, w.y)
  doc.line(MARGIN + 95, w.y, MARGIN + WIDTH, w.y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...SOFT)
  doc.text(p.issuer.name, MARGIN, w.y + 4)
  doc.text(p.client.company || p.client.name || 'Cliente', MARGIN + 95, w.y + 4)

  footer(doc, [p.issuer.name, p.issuer.document, p.issuer.email].filter(Boolean).join('  |  '))
  doc.save(fileName(`Proposta_${p.number.replace('#', '')}_${p.title}`))
}

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

/** Tudo que o documento do orçamento (tela e PDF) precisa, já resolvido. */
export interface QuoteDoc {
  number: string
  title: string
  date: Date
  validUntil: Date
  validityDays: number
  issuer: { name: string; document: string; email: string; phone: string }
  customer: { name: string; document: string; contact: string }
  items: Array<{ description: string; quantity: number; unit_price: number }>
  notes: string
  total: number
}

export const PIX_QR_PATH = '/qrcodepix.jpeg'

async function imageDataUrl(path: string): Promise<string | null> {
  try {
    const blob = await fetch(path).then((r) => (r.ok ? r.blob() : Promise.reject()))
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function downloadQuotePdf(q: QuoteDoc) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, q.issuer.name, `ORÇAMENTO ${q.number}`, `Emitido em ${formatDate(q.date)}`)

  const w = new Writer(doc)
  w.y = 38
  w.text(q.title, { size: 18, bold: true, gap: 1 })
  w.text(`Válido até ${formatDate(q.validUntil)} (${q.validityDays} dias)`, { size: 9, color: SOFT })

  w.heading('Cliente')
  w.text(q.customer.name || 'Cliente não informado', { bold: true, gap: 0.5 })
  const contact = [q.customer.document, q.customer.contact].filter(Boolean).join('  |  ')
  if (contact) w.text(contact, { size: 9, color: SOFT })

  w.heading('Itens')
  q.items.forEach((item) => {
    w.ensure(8)
    const top = w.y
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    const label = `${item.description}${item.quantity !== 1 ? `  (${item.quantity} x ${formatCurrency(item.unit_price)})` : ''}`
    const lines = doc.splitTextToSize(label, WIDTH - 40) as string[]
    lines.forEach((line, i) => doc.text(line, MARGIN, top + 5 + i * 5))
    doc.text(formatCurrency(item.quantity * item.unit_price), MARGIN + WIDTH, top + 5, { align: 'right' })
    w.y = top + 5 + (lines.length - 1) * 5 + 2
    w.rule()
  })

  w.ensure(14)
  w.y += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text('Total', MARGIN, w.y + 5)
  doc.setTextColor(...BRAND)
  doc.text(formatCurrency(q.total), MARGIN + WIDTH, w.y + 5, { align: 'right' })
  w.y += 9

  if (q.notes) {
    w.heading('Observações')
    w.text(q.notes)
  }

  // bloco do Pix: QR à esquerda, instruções à direita; não quebra entre páginas
  const qr = await imageDataUrl(PIX_QR_PATH)
  const size = 42
  w.y += 5
  w.ensure(size + 16)
  w.text('PAGAMENTO VIA PIX', { size: 8, bold: true, color: BRAND, gap: 2 })
  const top = w.y + 1
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(MARGIN, top, WIDTH, size + 8, 2, 2)
  if (qr) doc.addImage(qr, 'JPEG', MARGIN + 4, top + 4, size, size)
  const x = MARGIN + (qr ? size + 12 : 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...INK)
  doc.text(formatCurrency(q.total), x, top + 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...SOFT)
  const steps = [
    '1. Abra o app do seu banco e escolha Pix > Ler QR Code.',
    '2. Aponte a câmera para o código ao lado.',
    `3. Confira o favorecido, informe o valor de ${formatCurrency(q.total)} e confirme.`,
    '4. Envie o comprovante para darmos início ao serviço.',
  ]
  steps.forEach((step, i) => doc.text(doc.splitTextToSize(step, WIDTH - size - 20) as string[], x, top + 20 + i * 6.5))

  footer(doc, [q.issuer.name, q.issuer.document, q.issuer.email].filter(Boolean).join('  |  '))
  doc.save(fileName(`Orcamento_${q.number.replace('#', '')}_${q.title}`))
}
