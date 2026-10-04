import { addDays } from 'date-fns'
import type { Client, Profile, Quote } from '@/types/database.types'
import { formatQuoteNumber } from './utils'

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
  /** Dados de pagamento cadastrados no perfil (Minha empresa). */
  pix: { key: string; qr: string | null }
}

export type QuoteDraft = Pick<Quote, 'quote_number' | 'client_id' | 'customer_name' | 'title' | 'items' | 'notes' | 'total_amount' | 'validity_days'> & {
  created_at?: string
}

export function buildQuoteDoc(quote: QuoteDraft, client: Client | undefined, profile: Profile | undefined): QuoteDoc {
  const date = quote.created_at ? new Date(quote.created_at) : new Date()
  const validityDays = Number(quote.validity_days) || 0
  return {
    number: formatQuoteNumber(quote.quote_number),
    title: quote.title || 'Orçamento sem título',
    date,
    validUntil: addDays(date, validityDays),
    validityDays,
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
    total: Number(quote.total_amount) || 0,
    // só data URL de imagem vira <img>: o valor vem do banco e não pode apontar para outro lugar
    pix: { key: profile?.pix_key?.trim() ?? '', qr: profile?.pix_qr_image?.startsWith('data:image/') ? profile.pix_qr_image : null },
  }
}
