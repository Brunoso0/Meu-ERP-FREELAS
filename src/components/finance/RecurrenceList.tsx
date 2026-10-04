import { useMemo } from 'react'
import { differenceInCalendarMonths } from 'date-fns'
import { toast } from 'sonner'
import { Pager, usePagination } from '@/components/ui/Pagination'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { useRemove } from '@/hooks/useData'
import { recurrenceSeries, type RecurrenceSeries } from '@/lib/recurrence'
import { formatCurrency, formatDate, sum, toDate } from '@/lib/utils'
import type { Client, FinancialTransaction } from '@/types/database.types'

/** "faltam 6 meses", contando do mês atual até o da última parcela. */
function timeLeft(lastDue: string) {
  const months = differenceInCalendarMonths(toDate(lastDue), new Date())
  if (months <= 0) return 'termina este mês'
  return months === 1 ? 'falta 1 mês' : `faltam ${months} meses`
}

/**
 * Mensalidades e demais lançamentos que se repetem: quanto entra (ou sai) por
 * mês, quantas parcelas faltam e até quando. Some quando não há recorrência
 * em aberto.
 */
export function RecurrenceList({ transactions, clients }: { transactions: FinancialTransaction[]; clients: Client[] }) {
  const remove = useRemove('financial_transactions')
  const series = useMemo(() => recurrenceSeries(transactions), [transactions])
  const pagination = usePagination(series)
  if (series.length === 0) return null

  const income = series.filter((s) => s.type === 'income')
  const clientName = (id: string | null) => {
    const c = clients.find((x) => x.id === id)
    return c ? c.company_name ?? c.name : undefined
  }

  const end = async (s: RecurrenceSeries) => {
    if (s.futureIds.length === 0) {
      toast.info('Nada a remover', { description: 'As parcelas em aberto desta recorrência já venceram.' })
      return
    }
    if (!window.confirm(`Encerrar "${s.description}"? As ${s.futureIds.length} parcelas que ainda não venceram saem do financeiro. As pagas e as já vencidas continuam.`)) return
    try {
      for (const id of s.futureIds) await remove.mutateAsync(id)
      toast.success('Recorrência encerrada')
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">Recorrências</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Mensalidades em andamento e por quanto tempo ainda continuam.</p>
        </div>
        {income.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Entram por mês <span className="tabular font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(sum(income.map((s) => s.amount)))}</span>
            {' · '}ainda a receber <span className="tabular font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(sum(income.map((s) => s.remainingAmount)))}</span>
          </p>
        )}
      </div>
      <ul>
        {pagination.visible.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-5 py-3 last:border-0">
            <div className="min-w-0 flex-1 basis-56">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{s.description}</span>
                <Badge tone={s.type === 'income' ? 'green' : 'slate'}>{s.type === 'income' ? 'Entrada' : 'Despesa'}</Badge>
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {[clientName(s.client_id), `próximo vencimento em ${formatDate(s.nextDue)}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="w-28">
              <p className="tabular text-sm font-medium">{formatCurrency(s.amount)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">por mês</p>
            </div>
            <div className="w-44">
              <p className="tabular text-sm font-medium">
                {s.remaining} de {s.total} em aberto
              </p>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="progressbar"
                aria-label="Parcelas pagas"
                aria-valuemin={0}
                aria-valuemax={s.total}
                aria-valuenow={s.paid}
              >
                <div className="h-full rounded-full bg-brand-600 dark:bg-brand-500" style={{ width: `${(s.paid / s.total) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {timeLeft(s.lastDue)} · até {formatDate(s.lastDue, 'MM/yyyy')}
              </p>
            </div>
            <div className="w-28">
              <p className="tabular text-sm font-medium">{formatCurrency(s.remainingAmount)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.type === 'income' ? 'ainda a receber' : 'ainda a pagar'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => end(s)} loading={remove.isPending}>
              Encerrar
            </Button>
          </li>
        ))}
      </ul>
      <Pager {...pagination} />
    </Card>
  )
}
