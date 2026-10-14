import { Fragment } from 'react'
import { formatDate, maskCpfCnpj } from '@/lib/utils'

/** Aceite do contratante, quando o contrato já foi assinado. */
export interface ContractSignature {
  name: string
  document: string
  signedAt: string
  method: 'link' | 'manual'
  image: string | null
  ip: string
  hash: string
}

export interface ContractSignatures {
  /** Assinatura do emitente (CONTRATADA), cadastrada em Minha empresa. */
  contractor?: string | null
  /** Assinatura de quem contratou (CONTRATANTE). */
  customer?: ContractSignature | null
}

// só data URL de PNG vira <img>: o valor vem do banco e não pode apontar para outro lugar
const safeImage = (value: string | null | undefined) => (value?.startsWith('data:image/png;base64,') ? value : null)

const isSignatureLine = (line: string) => /^_{5,}$/.test(line)

/** Texto de evidência que acompanha a assinatura do contratante. */
export function signatureEvidence(s: ContractSignature) {
  const when = formatDate(s.signedAt, s.method === 'link' ? "dd/MM/yyyy 'às' HH:mm" : 'dd/MM/yyyy')
  return [
    s.method === 'link' ? `Assinado eletronicamente por ${s.name || 'contratante'}` : `Cópia assinada recebida${s.name ? ` de ${s.name}` : ''}`,
    s.document && `CPF/CNPJ ${maskCpfCnpj(s.document)}`,
    `em ${when}`,
    s.ip && `IP ${s.ip}`,
    s.hash && `Registro ${s.hash.slice(0, 16)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Renderiza o markdown simples do contrato (#, ##, parágrafos, **negrito**).
 * Nas linhas de assinatura do fim, encaixa a assinatura do emitente e, se o
 * contrato já foi assinado, a do contratante com os dados do aceite.
 */
export function ContractMarkdown({ source, signatures }: { source: string; signatures?: ContractSignatures }) {
  const bold = (text: string) =>
    text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))

  const lines = source.split('\n').map((l) => l.trim())
  const nextText = (from: number) => lines.slice(from + 1).find((l) => l) ?? ''

  return (
    <>
      {lines.map((line, i) => {
        if (!line) return null
        if (line.startsWith('# ')) return <h2 key={i} className="mb-6 text-center text-xl font-semibold tracking-tight">{line.slice(2)}</h2>
        if (line.startsWith('## ')) return <h3 key={i} className="mb-1.5 mt-6 text-sm font-semibold">{line.slice(3)}</h3>
        if (isSignatureLine(line)) {
          const owner = nextText(i)
          const image = owner.endsWith('(CONTRATADA)') ? safeImage(signatures?.contractor) : owner.endsWith('(CONTRATANTE)') ? safeImage(signatures?.customer?.image) : null
          return (
            <div key={i} className="mt-8 w-64 max-w-full">
              {/* altura reservada mesmo sem imagem: é o espaço para assinar à mão */}
              <div className="flex h-14 items-end">{image && <img src={image} alt="Assinatura" className="max-h-14 max-w-full object-contain object-left-bottom" />}</div>
              <div className="border-t border-slate-400" />
            </div>
          )
        }
        const customer = signatures?.customer
        return (
          <Fragment key={i}>
            <p className="mb-2.5 text-justify">{bold(line)}</p>
            {customer && line.endsWith('(CONTRATANTE)') && lines[i - 1] && isSignatureLine(lines[i - 1]) && (
              <p className="-mt-1.5 mb-2.5 text-[11px] leading-snug text-slate-500">{signatureEvidence(customer)}</p>
            )}
          </Fragment>
        )
      })}
    </>
  )
}
