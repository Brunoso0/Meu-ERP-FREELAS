import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runRecurrences } from '@/lib/quote-recurrence'

let ran = false

/**
 * Ao abrir o app, gera as mensalidades que já chegaram na data. Em produção
 * a função `billing` faz isso todo dia; aqui é o reforço (e o que funciona
 * no modo demo). Roda uma vez por sessão e nunca duplica um mês.
 */
export function useRecurrenceCatchUp() {
  const qc = useQueryClient()
  useEffect(() => {
    if (ran) return
    ran = true
    runRecurrences()
      .then(async (created) => {
        if (!created.length) return
        await Promise.all(['quotes', 'quote_recurrences', 'financial_transactions'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
        toast.success(created.length === 1 ? 'Mensalidade do mês gerada' : `${created.length} mensalidades geradas`, { description: 'Já estão no gerador de orçamentos e no financeiro.' })
      })
      .catch(() => {
        // sem rede ou sem a tabela ainda: a função do servidor gera no dia
      })
  }, [qc])
}
