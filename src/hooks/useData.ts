import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deleteRow, insertRow, listRows, updateRow } from '@/lib/db'
import type { TableName, Tables } from '@/types/database.types'

const describe = (error: unknown) => (error instanceof Error ? error.message : 'Erro inesperado.')

export function useTable<T extends TableName>(table: T) {
  return useQuery<Tables[T][]>({ queryKey: [table], queryFn: () => listRows(table) })
}

export function useInsert<T extends TableName>(table: T) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<Tables[T]>) => insertRow(table, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
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
