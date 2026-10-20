import type { Quote, QuoteRecurrence } from '@/types/database.types'
import { createCharge, usesGateway } from './billing'
import { insertRow, listRows, updateRow } from './db'
import { quoteParts, syncQuoteTransaction } from './quote-finance'
import { supabase } from './supabase'
import { isoDay } from './utils'

/**
 * Mensalidade do gerador de orçamentos. Uma série guarda o dia do
 * vencimento, a antecedência e o próximo vencimento; quando chega a hora,
 * nasce um orçamento novo que é a réplica do último da série (cliente,
 * título, itens, observações, valor), só com o vencimento do mês seguinte,
 * e o lançamento dele no financeiro. No Asaas, a cobrança é gerada junto.
 *
 * Em produção quem gera é a função `billing`, uma vez por dia (pg_cron); o
 * app também confere ao abrir e tem o "Gerar a próxima agora". A troca do
 * próximo vencimento é feita antes de gerar e só vale para quem chegar
 * primeiro, então nunca sai a mesma mensalidade duas vezes.
 */

/** Gera no máximo esta quantidade de meses atrasados de uma vez. */
const MAX_CATCH_UP = 3

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Data (yyyy-MM-dd) no mês `year`/`month` (1 a 12) com o dia limitado ao fim do mês. */
const onDay = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(Math.min(day, daysIn(year, month)))}`

/** Vencimento do mês seguinte, no dia da série (31 vira 30 ou 28 nos meses curtos). */
export function nextMonthly(due: string, day: number) {
  const [y, m] = due.split('-').map(Number)
  return m === 12 ? onDay(y + 1, 1, day) : onDay(y, m + 1, day)
}

export function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Data em que a próxima mensalidade é gerada. */
export const generationDate = (r: Pick<QuoteRecurrence, 'next_due_date' | 'lead_days'>) => shiftDays(r.next_due_date, -r.lead_days)

/** A série já passou do fim (a próxima mensalidade venceria depois do término). */
export const recurrenceEnded = (r: Pick<QuoteRecurrence, 'next_due_date' | 'ends_on'>) => !!r.ends_on && r.next_due_date > r.ends_on

/** Último orçamento da série: é ele que é replicado. */
export async function lastQuoteOf(r: Pick<QuoteRecurrence, 'id' | 'last_quote_id'>) {
  const quotes = await listRows('quotes')
  return quotes.find((q) => q.id === r.last_quote_id) ?? quotes.filter((q) => q.recurrence_id === r.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
}

export interface RecurrenceSettings {
  /** Vencimento da mensalidade deste orçamento (define o dia de todo mês). */
  firstDue: string
  leadDays: number
  endsOn: string | null
}

/** Transforma o orçamento em mensalidade: ele é o primeiro mês, e a série segue a partir do mês seguinte. */
export async function startRecurrence(quote: Quote, settings: RecurrenceSettings) {
  const day = Number(settings.firstDue.slice(8, 10))
  const recurrence = await insertRow('quote_recurrences', {
    client_id: quote.client_id,
    active: true,
    day_of_month: day,
    lead_days: settings.leadDays,
    next_due_date: nextMonthly(settings.firstDue, day),
    ends_on: settings.endsOn,
    last_quote_id: quote.id,
    last_run_at: null,
    last_error: null,
  })
  const saved = await updateRow('quotes', quote.id, { recurrence_id: recurrence.id, due_date: settings.firstDue, deposit_pct: null })
  await syncQuoteTransaction(saved)
  return recurrence
}

/** Ajusta antecedência e término da série (o vencimento do orçamento muda pelo próprio orçamento). */
export async function updateRecurrence(r: QuoteRecurrence, settings: Pick<RecurrenceSettings, 'leadDays' | 'endsOn'>) {
  return updateRow('quote_recurrences', r.id, { lead_days: settings.leadDays, ends_on: settings.endsOn })
}

/** Pausa (para de gerar) ou retoma; ao retomar, pula os meses que passaram durante a pausa. */
export async function setRecurrenceActive(r: QuoteRecurrence, active: boolean) {
  if (!active) return updateRow('quote_recurrences', r.id, { active: false })
  let next = r.next_due_date
  const today = isoDay(new Date())
  while (next < today) next = nextMonthly(next, r.day_of_month)
  return updateRow('quote_recurrences', r.id, { active: true, next_due_date: next, last_error: null })
}

/** Encerra a série: nada mais é gerado (o que já foi gerado continua). */
export const endRecurrence = (r: QuoteRecurrence) => updateRow('quote_recurrences', r.id, { active: false, ends_on: shiftDays(r.next_due_date, -1) })

/** Situação da série para a tela. */
export function recurrenceState(r: QuoteRecurrence): 'active' | 'paused' | 'ended' {
  if (recurrenceEnded(r)) return 'ended'
  return r.active ? 'active' : 'paused'
}

/**
 * Passa o próximo vencimento para o mês seguinte só se ele ainda for `due`.
 * Devolve false quando outra geração (a função ou outra aba) já levou este mês.
 */
async function claim(r: QuoteRecurrence, due: string, next: string) {
  const patch = { next_due_date: next, last_run_at: new Date().toISOString() }
  if (!supabase) {
    const current = (await listRows('quote_recurrences')).find((x) => x.id === r.id)
    if (!current?.active || current.next_due_date !== due) return false
    await updateRow('quote_recurrences', r.id, patch)
    return true
  }
  const { data, error } = await supabase.from('quote_recurrences').update(patch).eq('id', r.id).eq('next_due_date', due).eq('active', true).select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

/** Cria a mensalidade de `due`: réplica do último orçamento da série, lançamento e (no Asaas) a cobrança. */
async function generate(r: QuoteRecurrence, due: string, gateway: boolean): Promise<Quote> {
  const source = await lastQuoteOf(r)
  if (!source) throw new Error('A série não tem orçamento para replicar.')
  const quote = await insertRow('quotes', {
    client_id: source.client_id,
    customer_name: source.customer_name,
    title: source.title,
    items: source.items,
    notes: source.notes,
    total_amount: Number(source.total_amount),
    validity_days: source.validity_days,
    status: 'pending',
    proposal_id: null,
    deposit_pct: null,
    due_date: due,
    recurrence_id: r.id,
  })
  await syncQuoteTransaction(quote)
  let error: string | null = null
  if (gateway && quote.client_id) {
    const part = quoteParts(await listRows('financial_transactions'), quote.id)[0]
    if (part) {
      try {
        await createCharge(part.id)
      } catch (e) {
        error = `Mensalidade gerada, mas a cobrança no Asaas não: ${e instanceof Error ? e.message : 'erro desconhecido'}`
      }
    }
  }
  await updateRow('quote_recurrences', r.id, { last_quote_id: quote.id, last_error: error })
  return quote
}

/**
 * Gera as mensalidades que chegaram na data (vencimento menos a
 * antecedência). Com `force`, gera a próxima da série `onlyId` já, sem
 * esperar a data. Devolve os orçamentos criados.
 */
export async function runRecurrences({ onlyId, force = false }: { onlyId?: string; force?: boolean } = {}): Promise<Quote[]> {
  const today = isoDay(new Date())
  const profile = (await listRows('profiles'))[0]
  const gateway = usesGateway(profile)
  const created: Quote[] = []
  const series = (await listRows('quote_recurrences')).filter((r) => r.active && (!onlyId || r.id === onlyId))
  for (const r of series) {
    let current = r
    for (let i = 0; i < (force ? 1 : MAX_CATCH_UP); i++) {
      const due = current.next_due_date
      if (recurrenceEnded(current)) {
        await updateRow('quote_recurrences', current.id, { active: false })
        break
      }
      if (!force && generationDate(current) > today) break
      const next = nextMonthly(due, current.day_of_month)
      if (!(await claim(current, due, next))) break
      try {
        created.push(await generate(current, due, gateway))
      } catch (e) {
        await updateRow('quote_recurrences', current.id, { last_error: e instanceof Error ? e.message : 'Não foi possível gerar a mensalidade.' })
        break
      }
      current = { ...current, next_due_date: next }
    }
  }
  return created
}
