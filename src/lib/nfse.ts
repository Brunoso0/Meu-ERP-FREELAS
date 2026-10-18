import type { FinancialTransaction, NfseRegime, NfseService, NfseTaxes, Quote } from '@/types/database.types'
import { formatQuoteNumber } from './utils'

/**
 * Catálogo inicial de serviços para a nota fiscal, a partir dos CNAEs da empresa
 * (consulta pública do CNPJ). Cada nota descreve um destes serviços, com o
 * código de serviço que você usa no Portal Nacional da NFS-e.
 *
 * O código fica em branco de propósito: confira no Portal Nacional (ou numa
 * nota emitida à mão no Asaas) qual código de tributação nacional corresponde
 * a cada serviço e preencha no perfil.
 */
export const defaultNfseServices: NfseService[] = [
  {
    id: 'manutencao',
    label: 'Manutenção e suporte técnico em informática',
    cnae: '9511-8/00',
    code: '',
    description: 'Serviços de manutenção preventiva e corretiva, configuração e suporte técnico em computadores e equipamentos de informática.',
  },
  {
    id: 'treinamento',
    label: 'Treinamento em informática',
    cnae: '8599-6/03',
    code: '',
    description: 'Treinamento e orientação no uso de computadores, programas e ferramentas de informática.',
  },
  {
    id: 'cadastros',
    label: 'Edição de cadastros e listas de dados',
    cnae: '5819-1/00',
    code: '',
    description: 'Edição, organização, padronização e atualização de cadastros e listas de dados.',
  },
]

/** Situações da NFS-e no Asaas, em português. */
export const nfseStatus: Record<string, { label: string; tone: 'slate' | 'green' | 'amber' | 'red' | 'blue' }> = {
  SCHEDULED: { label: 'NF agendada', tone: 'blue' },
  SYNCHRONIZED: { label: 'NF em emissão', tone: 'blue' },
  AUTHORIZED: { label: 'NF emitida', tone: 'green' },
  PROCESSING_CANCELLATION: { label: 'NF cancelando', tone: 'amber' },
  CANCELED: { label: 'NF cancelada', tone: 'slate' },
  CANCELLATION_DENIED: { label: 'Cancelamento negado', tone: 'red' },
  ERROR: { label: 'NF com erro', tone: 'red' },
}

/** O lançamento já tem uma nota que conta (só cancelada ou com erro permite emitir outra). */
export const hasLiveInvoice = (t: Pick<FinancialTransaction, 'nfse_id' | 'nfse_status'>) =>
  !!t.nfse_id && !!t.nfse_status && !['CANCELED', 'ERROR'].includes(t.nfse_status)

/** Recebimento pago que ainda pode ganhar nota. */
export const canIssueInvoice = (t: Pick<FinancialTransaction, 'type' | 'status' | 'nfse_id' | 'nfse_status'>) =>
  t.type === 'income' && t.status === 'paid' && !hasLiveInvoice(t)

/**
 * Referência neutra que pode ir na nota: o número do orçamento e a parte
 * (entrada ou saldo), ou a parcela de uma mensalidade. Não repete títulos.
 */
export function invoiceReference(t: Pick<FinancialTransaction, 'quote_id' | 'installment' | 'installments'>, quotes: Pick<Quote, 'id' | 'quote_number' | 'deposit_pct'>[]) {
  const quote = t.quote_id ? quotes.find((q) => q.id === t.quote_id) : undefined
  if (quote) {
    const part = quote.deposit_pct ? (t.installment === 1 ? `, entrada (1/2)` : `, saldo (2/2)`) : ''
    return `orçamento ${formatQuoteNumber(quote.quote_number)}${part}`
  }
  if (t.installment && t.installments) return `parcela ${t.installment}/${t.installments}`
  return ''
}

/** Regimes da nota, como aparecem no Emissor Nacional. */
export const nfseRegimes: Record<NfseRegime, { label: string; hint: string }> = {
  mei: { label: 'MEI (Simples Nacional · SIMEI)', hint: 'O ISS já vai no DAS mensal: a nota sai sem alíquota e sem retenções.' },
  simples: { label: 'ME/EPP do Simples Nacional', hint: 'O ISS sai destacado na nota, com a alíquota do Simples, e o tomador pode reter. Os tributos federais vão no DAS.' },
  normal: { label: 'Fora do Simples (Lucro Presumido ou Real)', hint: 'ISS com a alíquota do município e, quando o tomador é empresa, as retenções federais (IR, PIS, COFINS, CSLL, INSS).' },
}

/** Valores da nota: base do ISS, ISS, retenções e o líquido que o tomador paga. */
export function invoiceTotals(value: number, regime: NfseRegime, taxes: NfseTaxes, deductions = 0) {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const pct = (n: number | undefined) => (Number.isFinite(Number(n)) ? Number(n) : 0)
  if (regime === 'mei') return { base: value, iss: 0, issRetained: 0, federal: 0, retentions: 0, net: value }
  const base = Math.max(0, value - deductions)
  const iss = r2((base * pct(taxes.iss)) / 100)
  const issRetained = taxes.retainIss ? iss : 0
  const federal = regime === 'normal' ? r2(((pct(taxes.pis) + pct(taxes.cofins) + pct(taxes.csll) + pct(taxes.inss) + pct(taxes.ir)) * value) / 100) : 0
  const retentions = r2(issRetained + federal)
  return { base, iss, issRetained, federal, retentions, net: r2(value - retentions) }
}
