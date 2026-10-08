import type { Client, Profile, Proposal } from '@/types/database.types'
import { listRows, updateRow } from './db'
import { supabase } from './supabase'

/** O que a página pública de assinatura recebe: só a proposta do link, o emitente e o cliente. */
export interface SharedProposal {
  proposal: Pick<
    Proposal,
    | 'proposal_number' | 'title' | 'scope_text' | 'content' | 'total_amount' | 'validity_days' | 'payment_terms' | 'created_at' | 'status'
    | 'signed_at' | 'signer_name' | 'signer_document' | 'signature_image' | 'signature_method' | 'signature_ip' | 'signature_hash'
  >
  issuer: Pick<Profile, 'full_name' | 'company_name' | 'document' | 'email' | 'phone'> | null
  client: Pick<Client, 'name' | 'company_name' | 'document' | 'email' | 'phone'> | null
}

export interface SignatureInput {
  name: string
  document: string
  /** Assinatura desenhada, em PNG (data URL). */
  signature: string
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/** Endereço que o cliente abre para ler e assinar a proposta. */
export const signatureLink = (token: string) => `${window.location.origin}/assinar/${token}`

const linkIsOpen = (p: Proposal) => p.status === 'awaiting_signature' || p.status === 'signed' || (p.status === 'approved' && !!p.signed_at)

/** Proposta do link, ou null se o link não existe ou não vale mais. Não exige login. */
export async function getSharedProposal(token: string): Promise<SharedProposal | null> {
  if (!isUuid(token)) return null
  if (!supabase) {
    const proposal = (await listRows('proposals')).find((p) => p.share_token === token)
    if (!proposal || !linkIsOpen(proposal)) return null
    const client = (await listRows('clients')).find((c) => c.id === proposal.client_id) ?? null
    const issuer = (await listRows('profiles'))[0] ?? null
    return { proposal, issuer, client }
  }
  const { data, error } = await supabase.rpc('get_shared_proposal', { p_token: token })
  if (error) throw new Error('Não foi possível abrir a proposta. Tente de novo em instantes.')
  return (data as SharedProposal | null) ?? null
}

/** Registra a assinatura do cliente. Só funciona uma vez, enquanto a proposta aguarda assinatura. */
export async function signSharedProposal(token: string, input: SignatureInput): Promise<void> {
  if (!supabase) {
    const proposal = (await listRows('proposals')).find((p) => p.share_token === token)
    if (!proposal || proposal.status !== 'awaiting_signature') throw new Error('Esta proposta não está aguardando assinatura.')
    await updateRow('proposals', proposal.id, {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signer_name: input.name.trim(),
      signer_document: input.document.replace(/\D/g, ''),
      signature_image: input.signature,
      signature_method: 'link',
      signature_ip: null,
      signature_hash: null,
    })
    return
  }
  const { error } = await supabase.rpc('sign_shared_proposal', { p_token: token, p_name: input.name, p_document: input.document, p_signature: input.signature })
  // as mensagens da função já são escritas para quem está assinando
  if (error) throw new Error(error.message || 'Não foi possível registrar a assinatura.')
}
