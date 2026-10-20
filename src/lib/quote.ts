import { addDays } from 'date-fns'
import type { Client, FinancialTransaction, Profile, Quote } from '@/types/database.types'
import { depositAmount } from './quote-finance'
import { formatQuoteNumber } from './utils'

/** Tudo que o documento do orçamento (tela e PDF) precisa, já resolvido. */
export interface QuoteDoc {
  number: string
  title: string
  date: Date
  validUntil: Date
  validityDays: number
  /** Vencimento fixo (mensalidade): o documento mostra a data no lugar da validade. */
  dueDate: Date | null
  monthly: boolean
  issuer: { name: string; document: string; email: string; phone: string }
  customer: { name: string; document: string; contact: string }
  items: Array<{ description: string; quantity: number; unit_price: number }>
  notes: string
  total: number
  /** Entrada e saldo, quando o orçamento não é cobrado de uma vez. */
  split: Array<{ label: string; amount: number; paid: boolean }>
  /** O que o cliente deve pagar agora (o total, a entrada ou o saldo). */
  due: { label: string; amount: number }
  /** Dados de pagamento cadastrados no perfil (Minha empresa). */
  pix: { key: string; qr: string | null }
  /**
   * Cobrança por gateway (Asaas), quando é a forma de cobrança do perfil.
   * Sem cobrança gerada ainda, os campos da cobrança vêm vazios.
   */
  gateway: {
    url: string | null
    pixImage: string | null
    pixPayload: string | null
    dueDate: string | null
    fine: number
    interest: number
    discount: { pct: number; days: number } | null
  } | null
}

export type QuoteDraft = Pick<Quote, 'quote_number' | 'client_id' | 'customer_name' | 'title' | 'items' | 'notes' | 'total_amount' | 'validity_days'> & {
  created_at?: string
  deposit_pct?: number | null
  due_date?: string | null
  recurrence_id?: string | null
  /** O orçamento vai virar mensalidade ao salvar. */
  monthly?: boolean
}

/**
 * `received` é o que já foi pago do orçamento (soma dos lançamentos pagos).
 * `charge` é o lançamento que o cliente deve pagar agora, com a cobrança do gateway, se houver.
 */
export function buildQuoteDoc(quote: QuoteDraft, client: Client | undefined, profile: Profile | undefined, received = 0, charge?: FinancialTransaction | null): QuoteDoc {
  const date = quote.created_at ? new Date(quote.created_at) : new Date()
  const validityDays = Number(quote.validity_days) || 0
  const total = Number(quote.total_amount) || 0
  const pct = quote.deposit_pct || null
  const deposit = pct ? depositAmount(total, pct) : total
  const depositPaid = pct !== null && received > 0 && received >= deposit - 0.005
  return {
    number: formatQuoteNumber(quote.quote_number),
    title: quote.title || 'Orçamento sem título',
    date,
    validUntil: addDays(date, validityDays),
    validityDays,
    dueDate: quote.due_date ? new Date(`${quote.due_date}T12:00:00`) : null,
    monthly: !!(quote.monthly || quote.recurrence_id),
    issuer: {
      name: profile?.company_name || profile?.full_name || 'Sua empresa',
      document: profile?.document ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
    },
    customer: client
      ? {
          name: [client.name, client.company_name].filter(Boolean).join(' — '),
          document: client.document ?? '',
          contact: [client.email, client.phone].filter(Boolean).join(' · '),
        }
      : { name: quote.customer_name ?? '', document: '', contact: '' },
    items: (quote.items ?? []).filter((i) => i.description),
    notes: quote.notes ?? '',
    total,
    split: pct
      ? [
          { label: `Entrada (${pct}%)`, amount: deposit, paid: depositPaid },
          { label: `Saldo (${100 - pct}%)`, amount: Math.round((total - deposit) * 100) / 100, paid: received >= total - 0.005 && total > 0 },
        ]
      : [],
    due: !pct
      ? { label: 'Valor total', amount: total }
      : depositPaid
        ? { label: `Saldo (${100 - pct}%)`, amount: Math.round((total - deposit) * 100) / 100 }
        : { label: `Entrada (${pct}%) a pagar agora`, amount: deposit },
    // só data URL de imagem vira <img>: o valor vem do banco e não pode apontar para outro lugar
    pix: { key: profile?.pix_key?.trim() ?? '', qr: profile?.pix_qr_image?.startsWith('data:image/') ? profile.pix_qr_image : null },
    gateway:
      profile?.billing_provider === 'asaas'
        ? {
            url: charge?.gateway_charge_id && /^https:\/\//.test(charge.gateway_invoice_url ?? '') ? charge.gateway_invoice_url! : null,
            pixImage: charge?.gateway_charge_id && charge.gateway_pix_image?.startsWith('data:image/') ? charge.gateway_pix_image : null,
            pixPayload: charge?.gateway_charge_id ? charge.gateway_pix_payload ?? null : null,
            dueDate: charge?.gateway_charge_id ? charge.due_date : null,
            fine: Number(profile.billing_fine_pct) || 0,
            interest: Number(profile.billing_interest_pct) || 0,
            discount: Number(profile.billing_discount_pct) > 0 ? { pct: Number(profile.billing_discount_pct), days: Number(profile.billing_discount_days) || 0 } : null,
          }
        : null,
  }
}
