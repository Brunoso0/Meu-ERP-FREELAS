import { addDays } from 'date-fns'
import type { Client, Profile, Proposal, ProposalItem, ProposalScheduleStep } from '@/types/database.types'
import { formatProposalNumber, sum } from './utils'

/** Tudo que o documento da proposta (tela e PDF) precisa, já resolvido. */
export interface ProposalDoc {
  number: string
  title: string
  date: Date
  validUntil: Date
  validityDays: number
  issuer: { name: string; document: string; email: string; phone: string }
  client: { name: string; company: string; document: string; email: string; phone: string }
  scope: string
  deliverables: string[]
  schedule: ProposalScheduleStep[]
  items: ProposalItem[]
  total: number
  paymentTerms: string
  /** Aceite do cliente, quando a proposta já foi assinada. */
  signature: {
    name: string
    document: string
    signedAt: Date
    method: 'link' | 'manual'
    image: string | null
    ip: string
    hash: string
  } | null
}

export const itemsTotal = (items: ProposalItem[]) =>
  sum(items.map((i) => Number(i.quantity || 0) * Number(i.unit_price || 0)))

export function buildProposalDoc(
  proposal: Pick<Proposal, 'proposal_number' | 'title' | 'scope_text' | 'content' | 'total_amount' | 'validity_days' | 'payment_terms'> &
    Partial<Pick<Proposal, 'created_at' | 'signed_at' | 'signer_name' | 'signer_document' | 'signature_image' | 'signature_method' | 'signature_ip' | 'signature_hash'>>,
  client: Client | undefined,
  profile: Profile | undefined,
): ProposalDoc {
  const date = proposal.created_at ? new Date(proposal.created_at) : new Date()
  const validityDays = Number(proposal.validity_days) || 0
  return {
    number: formatProposalNumber(proposal.proposal_number),
    title: proposal.title || 'Proposta sem título',
    date,
    validUntil: addDays(date, validityDays),
    validityDays,
    issuer: {
      name: profile?.company_name || profile?.full_name || 'Sua empresa',
      document: profile?.document ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
    },
    client: {
      name: client?.name ?? '',
      company: client?.company_name ?? '',
      document: client?.document ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
    },
    scope: proposal.scope_text ?? '',
    deliverables: (proposal.content?.deliverables ?? []).filter(Boolean),
    schedule: (proposal.content?.schedule ?? []).filter((s) => s.label),
    items: (proposal.content?.items ?? []).filter((i) => i.description),
    total: Number(proposal.total_amount) || 0,
    paymentTerms: proposal.payment_terms ?? '',
    signature: proposal.signed_at
      ? {
          name: proposal.signer_name ?? '',
          document: proposal.signer_document ?? '',
          signedAt: new Date(proposal.signed_at),
          method: proposal.signature_method === 'link' ? 'link' : 'manual',
          // só data URL de PNG vira <img>: o valor vem do banco e não pode apontar para outro lugar
          image: proposal.signature_image?.startsWith('data:image/png;base64,') ? proposal.signature_image : null,
          ip: proposal.signature_ip ?? '',
          hash: proposal.signature_hash ?? '',
        }
      : null,
  }
}
