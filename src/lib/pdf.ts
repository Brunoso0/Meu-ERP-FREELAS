import { jsPDF } from 'jspdf'
import { signatureEvidence, type ContractSignatures } from '@/components/contracts/ContractMarkdown'
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

const SIGN_HEIGHT = 16
const SIGN_MAX_WIDTH = 70

/** Desenha a assinatura apoiada na linha, mantendo a proporção da imagem. */
function drawSignature(doc: jsPDF, image: string | null | undefined, x: number, baseline: number) {
  if (!image?.startsWith('data:image/png;base64,')) return
  try {
    const { width, height } = doc.getImageProperties(image)
    const scale = Math.min(SIGN_HEIGHT / height, SIGN_MAX_WIDTH / width)
    doc.addImage(image, 'PNG', x, baseline - height * scale, width * scale, height * scale)
  } catch {
    // imagem ilegível: o contrato sai só com a linha, como se fosse assinar à mão
  }
}

/**
 * Converte o markdown simples dos contratos (#, ##, parágrafos, **negrito**) em PDF.
 * Com `signatures`, as linhas de assinatura do fim recebem a do emitente e a do contratante.
 */
export function downloadContractPdf(title: string, markdown: string, issuer: string, signatures?: ContractSignatures) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  header(doc, issuer, 'CONTRATO', `Gerado em ${formatDate(new Date())}`)
  const w = new Writer(doc)
  w.y = 38

  const lines = markdown.split('\n').map((l) => l.trim())
  for (const [i, line] of lines.entries()) {
    if (!line) continue
    const plain = line.replace(/\*\*/g, '')

    // linha de assinatura: reserva a altura, encaixa a imagem (se houver) e traça a linha
    if (/^_{5,}$/.test(line)) {
      const owner = lines.slice(i + 1).find((l) => l) ?? ''
      // as duas assinaturas ficam juntas: se não couberem, vão as duas para a página seguinte
      const isFirst = !lines.slice(0, i).some((l) => /^_{5,}$/.test(l))
      w.ensure(isFirst ? (SIGN_HEIGHT + 22) * 2 : SIGN_HEIGHT + 14)
      w.y += SIGN_HEIGHT + 4
      drawSignature(doc, owner.endsWith('(CONTRATADA)') ? signatures?.contractor : owner.endsWith('(CONTRATANTE)') ? signatures?.customer?.image : null, MARGIN, w.y)
      doc.setDrawColor(100, 116, 139)
      doc.line(MARGIN, w.y, MARGIN + SIGN_MAX_WIDTH, w.y)
      w.y += 1
      continue
    }
    if (signatures?.customer && line.endsWith('(CONTRATANTE)') && /^_{5,}$/.test(lines[i - 1] ?? '')) {
      w.text(plain, { size: 10, gap: 1 })
      w.text(signatureEvidence(signatures.customer), { size: 7.5, color: SOFT, gap: 2.5 })
      continue
    }
    if (line.startsWith('# ')) w.text(plain.slice(2), { size: 15, bold: true, gap: 3 })
    else if (line.startsWith('## ')) {
      w.y += 3
      w.text(plain.slice(3), { size: 10.5, bold: true, gap: 1.5 })
    } else w.text(plain, { size: 10, gap: 2.5 })
  }

  footer(doc, title)
  doc.save(fileName(title))
}
