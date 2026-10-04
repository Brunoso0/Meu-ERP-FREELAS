import { addMonths } from 'date-fns'
import type { Contract, FinancialTransaction } from '@/types/database.types'
import { insertRows, listRows } from './db'
import { isoDay, sum, toDate } from './utils'

export const MAX_INSTALLMENTS = 120

/**
 * Transforma um lançamento em uma série mensal: uma linha por mês, a partir do
 * vencimento informado. Só a primeira parcela herda a situação "pago"; as
 * demais nascem pendentes.
 */
export function expandRecurrence(base: Partial<FinancialTransaction>, months: number, contractId?: string): Partial<FinancialTransaction>[] {
  const first = toDate(base.due_date!)
  const recurrence_id = crypto.randomUUID()
  return Array.from({ length: months }, (_, i) => ({
    ...base,
    // sempre a partir da primeira data: dia 31 vira 28/30 só nos meses curtos
    due_date: isoDay(addMonths(first, i)),
    status: i === 0 ? base.status ?? 'pending' : 'pending',
    payment_date: i === 0 ? base.payment_date ?? null : null,
    recurrence_id,
    installment: i + 1,
    installments: months,
    contract_id: contractId ?? null,
  }))
}

/**
 * Lança no financeiro as mensalidades de um contrato assinado. Contrato sem
 * mensalidade, ou que já tem parcelas lançadas, não gera nada. Devolve quantas
 * parcelas foram criadas.
 */
export async function registerContractInstallments(contract: Contract): Promise<number> {
  const amount = Number(contract.monthly_amount ?? 0)
  const months = Math.min(Number(contract.term_months ?? 0), MAX_INSTALLMENTS)
  if (amount <= 0 || months < 1) return 0

  const transactions = await listRows('financial_transactions')
  if (transactions.some((t) => t.contract_id === contract.id)) return 0

  const rows = expandRecurrence(
    {
      type: 'income',
      category: 'Mensalidade',
      description: `Mensalidade — ${contract.title.replace(/^Contrato\s+[—-]\s+/i, '')}`,
      amount,
      due_date: contract.first_due_date ?? isoDay(addMonths(new Date(), 1)),
      payment_date: null,
      status: 'pending',
      client_id: contract.client_id,
      freelancer_id: null,
      project_id: null,
    },
    months,
    contract.id,
  )
  await insertRows('financial_transactions', rows)
  return rows.length
}

export interface RecurrenceSeries {
  id: string
  type: FinancialTransaction['type']
  description: string
  client_id: string | null
  contract_id: string | null
  amount: number
  total: number
  paid: number
  /** Parcelas ainda não pagas. */
  remaining: number
  remainingAmount: number
  nextDue: string
  lastDue: string
  /** Parcelas não pagas que ainda não venceram (as que somem ao encerrar). */
  futureIds: string[]
}

/** Recorrências que ainda têm parcelas em aberto, da que vence antes para a que vence depois. */
export function recurrenceSeries(transactions: FinancialTransaction[]): RecurrenceSeries[] {
  const groups = new Map<string, FinancialTransaction[]>()
  for (const t of transactions) {
    if (!t.recurrence_id) continue
    groups.set(t.recurrence_id, [...(groups.get(t.recurrence_id) ?? []), t])
  }

  const today = isoDay(new Date())
  const series: RecurrenceSeries[] = []
  for (const [id, rows] of groups) {
    const open = rows.filter((t) => t.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date))
    if (open.length === 0) continue
    const sample = open[0]
    series.push({
      id,
      type: sample.type,
      description: sample.description ?? sample.category ?? 'Recorrência',
      client_id: sample.client_id,
      contract_id: sample.contract_id ?? null,
      amount: sample.amount,
      total: Math.max(rows.length, ...rows.map((t) => t.installments ?? 0)),
      paid: rows.filter((t) => t.status === 'paid').length,
      remaining: open.length,
      remainingAmount: sum(open.map((t) => t.amount)),
      nextDue: sample.due_date,
      lastDue: open[open.length - 1].due_date,
      futureIds: open.filter((t) => t.due_date > today).map((t) => t.id),
    })
  }
  return series.sort((a, b) => a.nextDue.localeCompare(b.nextDue))
}
