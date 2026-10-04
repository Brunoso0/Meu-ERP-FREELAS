import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deleteRow, insertRow, listRows, updateRow } from '@/lib/db'
import { registerProjectPayment } from '@/lib/project-payment'
import { formatCurrency } from '@/lib/utils'
import type { Project, TableName, Tables } from '@/types/database.types'

const describe = (error: unknown) => (error instanceof Error ? error.message : 'Erro inesperado.')

/**
 * Projeto que acabou de virar "concluído" ganha o recebimento no financeiro,
 * para o valor não precisar ser digitado de novo em outra tela.
 */
async function settleCompletedProject(qc: QueryClient, table: TableName, row: unknown, previousStatus: string | undefined, created: boolean) {
  if (table !== 'projects') return
  const project = row as Project
  if (project.status !== 'completed' || previousStatus === 'completed') return
  try {
    const amount = await registerProjectPayment(project, created)
    if (amount > 0) {
      await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
      toast.success('Recebimento lançado no financeiro', { description: `${formatCurrency(amount)} · ${project.title}` })
    } else if (!Number(project.budget)) {
      toast.info('Projeto sem orçamento', { description: 'Nenhum recebimento foi lançado. Informe o orçamento para lançar automaticamente.' })
    }
  } catch (error) {
    toast.error('Projeto concluído, mas o recebimento não foi lançado', { description: describe(error) })
  }
}

export function useTable<T extends TableName>(table: T) {
  return useQuery<Tables[T][]>({ queryKey: [table], queryFn: () => listRows(table) })
}

export function useInsert<T extends TableName>(table: T) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<Tables[T]>) => insertRow(table, values),
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: [table] })
      await settleCompletedProject(qc, table, row, undefined, true)
    },
    onError: (error) => toast.error('Não foi possível salvar', { description: describe(error) }),
  })
}

/**
 * Atualização otimista: a tela muda na hora e volta ao estado anterior se o
 * servidor recusar. É o que dá a sensação de arrastar-e-soltar instantâneo
 * no kanban.
 */
export function useUpdate<T extends TableName>(table: T) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Tables[T]> }) => updateRow(table, id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: [table] })
      const previous = qc.getQueryData<Tables[T][]>([table])
      qc.setQueryData<Tables[T][]>([table], (old) =>
        old?.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData([table], context.previous)
      toast.error('Alteração desfeita', { description: describe(error) })
    },
    onSuccess: (row, { id }, context) => {
      const before = context?.previous?.find((r) => r.id === id) as { status?: string } | undefined
      return settleCompletedProject(qc, table, row, before?.status, false)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [table] }),
  })
}

export function useRemove<T extends TableName>(table: T) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRow(table, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
    onError: (error) => toast.error('Não foi possível excluir', { description: describe(error) }),
  })
}
