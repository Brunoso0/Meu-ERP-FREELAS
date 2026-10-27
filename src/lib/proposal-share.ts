import type { Client, Contract, Profile, Proposal } from '@/types/database.types'
import { appUrl } from './app-base'
import { listRows, updateRow } from './db'
import { registerContractInstallments } from './recurrence'
import { supabase } from './supabase'

/**
 * Links públicos de assinatura (proposta e contrato). Quem abre o link não
 * tem login: fala só com funções do banco que exigem o token do link e
 * devolvem um único documento.
 */

/** O que a página pública de assinatura recebe: só a proposta do link, o emitente e o cliente. */
export interface SharedProposal {
  proposal: Pick<
    Proposal,
    | 'proposal_number' | 'title' | 'scope_text' | 'content' | 'total_amount' | 'validity_days' | 'payment_terms' | 'created_at' | 'status'
    | 'signed_at' | 'signer_name' | 'signer_document' | 'signature_image' | 'signature_method' | 'signature_ip' | 'signature_hash'
  >
  issuer: Pick<Profile, 'full_name' | 'company_name' | 'document' | 'email' | 'phone' | 'signature_image'> | null
  client: Pick<Client, 'name' | 'company_name' | 'document' | 'email' | 'phone'> | null
}

export interface SharedContract {
  contract: Pick<
    Contract,
    'title' | 'content_markdown' | 'created_at' | 'status' | 'signed_at' | 'signer_name' | 'signer_document' | 'signature_image' | 'signature_method' | 'signature_ip' | 'signature_hash'
  >
  issuer: Pick<Profile, 'full_name' | 'company_name' | 'signature_image'> | null
}

export interface SignatureInput {
  name: string
  document: string
  /** Assinatura desenhada, em PNG (data URL). */
  signature: string
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/** Endereço que o cliente abre para ler e assinar a proposta ou o contrato. */
export const signatureLink = (token: string, kind: 'proposal' | 'contract' = 'proposal') =>
  appUrl(`/assinar/${kind === 'contract' ? 'contrato/' : ''}${token}`)

const proposalLinkIsOpen = (p: Proposal) => p.status === 'awaiting_signature' || p.status === 'signed' || (p.status === 'approved' && !!p.signed_at)
const contractLinkIsOpen = (c: Contract) => c.status === 'awaiting_signature' || (c.signature_method === 'link' && (c.status === 'signed' || c.status === 'active'))

const signedPatch = (input: SignatureInput) => ({
  status: 'signed' as const,
  signed_at: new Date().toISOString(),
  signer_name: input.name.trim(),
  signer_document: input.document.replace(/\D/g, ''),
  signature_image: input.signature,
  signature_method: 'link' as const,
  signature_ip: null,
  signature_hash: null,
})

/** Proposta do link, ou null se o link não existe ou não vale mais. Não exige login. */
export async function getSharedProposal(token: string): Promise<SharedProposal | null> {
  if (!isUuid(token)) return null
  if (!supabase) {
    const proposal = (await listRows('proposals')).find((p) => p.share_token === token)
    if (!proposal || !proposalLinkIsOpen(proposal)) return null
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
    await updateRow('proposals', proposal.id, signedPatch(input))
    return
  }
  const { error } = await supabase.rpc('sign_shared_proposal', { p_token: token, p_name: input.name, p_document: input.document, p_signature: input.signature })
  // as mensagens da função já são escritas para quem está assinando
  if (error) throw new Error(error.message || 'Não foi possível registrar a assinatura.')
}

/** Contrato do link, ou null se o link não existe ou não vale mais. Não exige login. */
export async function getSharedContract(token: string): Promise<SharedContract | null> {
  if (!isUuid(token)) return null
  if (!supabase) {
    const contract = (await listRows('contracts')).find((c) => c.share_token === token)
    if (!contract || !contractLinkIsOpen(contract)) return null
    return { contract, issuer: (await listRows('profiles'))[0] ?? null }
  }
  const { data, error } = await supabase.rpc('get_shared_contract', { p_token: token })
  if (error) throw new Error('Não foi possível abrir o contrato. Tente de novo em instantes.')
  return (data as SharedContract | null) ?? null
}

/** Registra a assinatura do contrato. Contrato com mensalidade já lança as parcelas no financeiro. */
export async function signSharedContract(token: string, input: SignatureInput): Promise<void> {
  if (!supabase) {
    const contract = (await listRows('contracts')).find((c) => c.share_token === token)
    if (!contract || contract.status !== 'awaiting_signature') throw new Error('Este contrato não está aguardando assinatura.')
    // no banco real, quem lança as mensalidades é a própria função de assinatura
    await registerContractInstallments(await updateRow('contracts', contract.id, signedPatch(input)))
    return
  }
  const { error } = await supabase.rpc('sign_shared_contract', { p_token: token, p_name: input.name, p_document: input.document, p_signature: input.signature })
  if (error) throw new Error(error.message || 'Não foi possível registrar a assinatura.')
}
