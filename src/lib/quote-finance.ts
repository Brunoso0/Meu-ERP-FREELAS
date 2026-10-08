import { addDays } from 'date-fns'
import type { FinancialTransaction, Proposal, Quote, QuoteStatus } from '@/types/database.types'
import { deleteRow, insertRow, listRows, updateRow } from './db'
import { formatProposalNumber, formatQuoteNumber, isoDay, sum, toDate } from './utils'

/**
 * Orçamento e financeiro andam juntos. Cada orçamento tem os seus
 * lançamentos de entrada (`quote_id`):
 * - cobrança integral: um lançamento com o valor total;
 * - entrada + saldo: dois lançamentos (ex.: 50% agora e 50% depois), que
 *   somam o total do orçamento, numerados 1/2 e 2/2.
 *
 * A situação do orçamento vem desses lançamentos: nenhum pago = aguardando,
 * parte paga = parcialmente pago, todos pagos = pago. Registrar um pagamento
 * pelo orçamento ou pelo financeiro dá no mesmo.
 */

export const DEFAULT_DEPOSIT_PCT = 50

const round2 = (n: number) => Math.round(n * 100) / 100
const sameMoney = (a: number, b: number) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100)

/** Quanto é a entrada de um orçamento com entrada + saldo. */
export const depositAmount = (total: number, pct: number) => round2((Number(total) * pct) / 100)

/** Lançamentos de um orçamento, na ordem de pagamento (entrada antes do saldo). */
export function quoteParts(transactions: FinancialTransaction[], quoteId: string) {
  return transactions.filter((t) => t.quote_id === quoteId).sort((a, b) => (a.installment ?? 1) - (b.installment ?? 1))
}

export function statusFromParts(parts: FinancialTransaction[]): QuoteStatus {
  const paid = parts.filter((t) => t.status === 'paid').length
  if (paid === 0) return 'pending'
  return paid === parts.length ? 'paid' : 'partial'
}

/** Resumo do que já entrou e do que falta de um orçamento. */
export function quoteProgress(transactions: FinancialTransaction[], quoteId: string) {
  const parts = quoteParts(transactions, quoteId)
  const received = sum(parts.filter((t) => t.status === 'paid').map((t) => t.amount))
  const next = parts.find((t) => t.status !== 'paid') ?? null
  const lastPaid = [...parts].reverse().find((t) => t.status === 'paid') ?? null
  return { parts, received, next, lastPaid }
}

interface Plan {
  amount: number
  label: string | null
  installment: number | null
  installments: number | null
}

function plan(quote: Quote, paidDeposit?: number): Plan[] {
  const total = Number(quote.total_amount)
  const pct = quote.deposit_pct
  if (!pct) return [{ amount: total, label: null, installment: null, installments: null }]
  // entrada já paga não muda de valor: o saldo absorve qualquer alteração do total
  const deposit = paidDeposit ?? depositAmount(total, pct)
  return [
    { amount: deposit, label: `Entrada (${pct}%)`, installment: 1, installments: 2 },
    { amount: round2(total - deposit), label: `Saldo (${100 - pct}%)`, installment: 2, installments: 2 },
  ]
}

/** O orçamento tem pagamento registrado? Nesse caso a forma de cobrança não pode mais mudar. */
export async function quoteHasPayment(quoteId: string) {
  return quoteParts(await listRows('financial_transactions'), quoteId).some((t) => t.status === 'paid')
}

/**
 * Cria ou ajusta os lançamentos do orçamento (valores, descrição, cliente)
 * e acerta a situação do orçamento. Chamar de novo sem mudanças não altera
 * nada. Devolve true se algo mudou.
 */
export async function syncQuoteTransaction(quote: Quote): Promise<boolean> {
  const parts = quoteParts(await listRows('financial_transactions'), quote.id)
  const base = `Orçamento ${formatQuoteNumber(quote.quote_number)} — ${quote.title}`
  const dueDate = isoDay(addDays(toDate(quote.created_at), quote.validity_days))
  let changed = false

  const paidParts = parts.filter((t) => t.status === 'paid')
  const sameShape = parts.length === (quote.deposit_pct ? 2 : 1)

  if (!sameShape) {
    // mudar de integral para entrada + saldo (ou o contrário) só sem pagamento registrado
    if (paidParts.length > 0) throw new Error('Este orçamento já tem pagamento registrado; a forma de cobrança não pode mais ser alterada.')
    for (const t of parts) await deleteRow('financial_transactions', t.id)
    changed = parts.length > 0
    parts.length = 0
  }

  if (parts.length === 0) {
    if (Number(quote.total_amount) <= 0) return changed
    for (const p of plan(quote)) {
      await insertRow('financial_transactions', {
        type: 'income',
        category: 'Orçamento',
        description: p.label ? `${base} · ${p.label}` : base,
        amount: p.amount,
        // a entrada vence com a validade do orçamento; o saldo, um mês depois (ajustável no financeiro)
        due_date: p.installment === 2 ? isoDay(addDays(toDate(dueDate), 30)) : dueDate,
        payment_date: null,
        status: 'pending',
        client_id: quote.client_id,
        freelancer_id: null,
        project_id: null,
        quote_id: quote.id,
        installment: p.installment,
        installments: p.installments,
      })
    }
    changed = true
  } else {
    const paidDeposit = quote.deposit_pct && parts[0].status === 'paid' ? Number(parts[0].amount) : undefined
    const wanted = plan(quote, paidDeposit)
    for (const [i, t] of parts.entries()) {
      const p = wanted[i]
      const patch: Partial<FinancialTransaction> = {}
      const description = p.label ? `${base} · ${p.label}` : base
      if (t.description !== description) patch.description = description
      if (t.client_id !== quote.client_id) patch.client_id = quote.client_id
      // o valor de uma parte já paga é o que entrou de fato; só as abertas acompanham o orçamento
      if (t.status !== 'paid' && !sameMoney(t.amount, p.amount)) patch.amount = p.amount
      if (Object.keys(patch).length) {
        await updateRow('financial_transactions', t.id, patch)
        changed = true
      }
    }
  }

  if (await refreshQuoteStatus(quote)) changed = true
  return changed
}

/** Recalcula a situação do orçamento a partir dos lançamentos. Devolve true se mudou. */
async function refreshQuoteStatus(quote: Pick<Quote, 'id' | 'status'>): Promise<boolean> {
  const parts = quoteParts(await listRows('financial_transactions'), quote.id)
  if (parts.length === 0) return false
  const status = statusFromParts(parts)
  if (quote.status === status) return false
  await updateRow('quotes', quote.id, { status })
  return true
}

/** Registra o próximo pagamento do orçamento (o integral, a entrada ou o saldo). */
export async function registerQuotePayment(quote: Quote): Promise<FinancialTransaction | null> {
  const { next } = quoteProgress(await listRows('financial_transactions'), quote.id)
  if (!next) return null
  const paid = await updateRow('financial_transactions', next.id, { status: 'paid', payment_date: isoDay(new Date()) })
  await refreshQuoteStatus(quote)
  return paid
}

/** Desfaz o último pagamento registrado do orçamento. */
export async function undoQuotePayment(quote: Quote): Promise<FinancialTransaction | null> {
  const { lastPaid } = quoteProgress(await listRows('financial_transactions'), quote.id)
  if (!lastPaid) return null
  const reopened = await updateRow('financial_transactions', lastPaid.id, { status: 'pending', payment_date: null })
  await refreshQuoteStatus(quote)
  return reopened
}

/** Antes de excluir um orçamento: tira do financeiro o que ainda não foi pago (o que já entrou fica). */
export async function removeQuoteTransaction(quoteId: string): Promise<void> {
  for (const t of quoteParts(await listRows('financial_transactions'), quoteId)) {
    if (t.status !== 'paid') await deleteRow('financial_transactions', t.id)
  }
}

/** Lançamento de orçamento que mudou de situação no financeiro leva o orçamento junto. */
export async function syncQuoteFromTransaction(transaction: FinancialTransaction): Promise<boolean> {
  if (!transaction.quote_id) return false
  const quote = (await listRows('quotes')).find((q) => q.id === transaction.quote_id)
  return quote ? refreshQuoteStatus(quote) : false
}

/** Orçamento já gerado para a proposta, se houver (uma proposta tem no máximo um). */
export async function quoteOfProposal(proposalId: string) {
  return (await listRows('quotes')).find((q) => q.proposal_id === proposalId) ?? null
}

/**
 * Proposta aprovada vira orçamento aguardando pagamento, integral ou com
 * entrada (`depositPct`, ex.: 50). Uma proposta gera no máximo um orçamento:
 * aprovar de novo não cria outro. Devolve o orçamento criado.
 */
export async function createQuoteFromProposal(proposal: Proposal, depositPct: number | null = null): Promise<Quote | null> {
  if (Number(proposal.total_amount) <= 0) return null
  if (await quoteOfProposal(proposal.id)) return null

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
    deposit_pct: depositPct,
  })
  await syncQuoteTransaction(quote)
  return quote
}
