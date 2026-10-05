import { addDays } from 'date-fns'
import type { FinancialTransaction, Proposal, Quote } from '@/types/database.types'
import { deleteRow, insertRow, listRows, updateRow } from './db'
import { formatProposalNumber, formatQuoteNumber, isoDay, toDate } from './utils'

/**
 * Orçamento e financeiro andam juntos: todo orçamento tem um lançamento de
 * entrada ligado a ele (`quote_id`), pendente enquanto aguarda pagamento e
 * pago quando o orçamento é marcado como pago. Marcar o lançamento como pago
 * no financeiro também marca o orçamento.
 */

const sameMoney = (a: number, b: number) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100)

/**
 * Cria ou atualiza o lançamento do orçamento. Chamar de novo com o mesmo
 * orçamento não duplica nem altera nada. Devolve true se algo mudou no
 * financeiro.
 */
export async function syncQuoteTransaction(quote: Quote): Promise<boolean> {
  const transactions = await listRows('financial_transactions')
  const existing = transactions.find((t) => t.quote_id === quote.id)
  const paid = quote.status === 'paid'
  const today = isoDay(new Date())

  const wanted = {
    description: `Orçamento ${formatQuoteNumber(quote.quote_number)} — ${quote.title}`,
    amount: Number(quote.total_amount),
    status: (paid ? 'paid' : 'pending') as FinancialTransaction['status'],
    payment_date: paid ? existing?.payment_date ?? today : null,
    client_id: quote.client_id,
  }

  if (!existing) {
    if (wanted.amount <= 0) return false
    await insertRow('financial_transactions', {
      type: 'income',
      category: 'Orçamento',
      ...wanted,
      // vence quando a validade do orçamento acaba
      due_date: isoDay(addDays(toDate(quote.created_at), quote.validity_days)),
      freelancer_id: null,
      project_id: null,
      quote_id: quote.id,
    })
    return true
  }

  const changed =
    existing.description !== wanted.description ||
    !sameMoney(existing.amount, wanted.amount) ||
    (existing.status === 'paid') !== paid ||
    existing.payment_date !== wanted.payment_date ||
    existing.client_id !== wanted.client_id
  if (!changed) return false
  await updateRow('financial_transactions', existing.id, wanted)
  return true
}

/** Antes de excluir um orçamento: tira do financeiro o lançamento que ainda não foi pago. */
export async function removeQuoteTransaction(quoteId: string): Promise<void> {
  const transactions = await listRows('financial_transactions')
  const pending = transactions.find((t) => t.quote_id === quoteId && t.status !== 'paid')
  if (pending) await deleteRow('financial_transactions', pending.id)
}

/**
 * Lançamento de orçamento que mudou de situação no financeiro leva o
 * orçamento junto. Devolve true se o orçamento foi alterado.
 */
export async function syncQuoteFromTransaction(transaction: FinancialTransaction): Promise<boolean> {
  if (!transaction.quote_id) return false
  const quote = (await listRows('quotes')).find((q) => q.id === transaction.quote_id)
  if (!quote) return false
  const status = transaction.status === 'paid' ? 'paid' : 'pending'
  if (quote.status === status) return false
  await updateRow('quotes', quote.id, { status })
  return true
}

/**
 * Proposta aprovada vira orçamento aguardando pagamento (e, com ele, um
 * lançamento pendente no financeiro). Uma proposta gera no máximo um
 * orçamento: aprovar de novo não cria outro. Devolve o orçamento criado.
 */
export async function createQuoteFromProposal(proposal: Proposal): Promise<Quote | null> {
  if (Number(proposal.total_amount) <= 0) return null
  const quotes = await listRows('quotes')
  if (quotes.some((q) => q.proposal_id === proposal.id)) return null

  const items = proposal.content?.items?.filter((i) => i.description?.trim()) ?? []
  const quote = await insertRow('quotes', {
    client_id: proposal.client_id,
    customer_name: null,
    title: proposal.title,
    items: items.length > 0 ? items : [{ description: proposal.title, quantity: 1, unit_price: Number(proposal.total_amount) }],
    notes: [`Referente à proposta ${formatProposalNumber(proposal.proposal_number)}.`, proposal.payment_terms].filter(Boolean).join(' '),
    total_amount: Number(proposal.total_amount),
    validity_days: 7,
    status: 'pending',
    proposal_id: proposal.id,
  })
  await syncQuoteTransaction(quote)
  return quote
}
