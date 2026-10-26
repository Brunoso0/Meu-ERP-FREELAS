import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { hasRole, listMyWorkspaces, type MyWorkspace } from '@/lib/workspace'
import { useWorkspaceStore } from '@/store/workspace'
import type { WorkspaceRole } from '@/types/database.types'

export const MY_WORKSPACES_KEY = ['my-workspaces']

/** Os workspaces da pessoa; a consulta não depende do workspace aberto. */
export function useMyWorkspaces() {
  return useQuery<MyWorkspace[]>({ queryKey: MY_WORKSPACES_KEY, queryFn: listMyWorkspaces })
}

/** O workspace aberto agora, o papel da pessoa nele e a troca para outro. */
export function useActiveWorkspace() {
  const { data: mine = [], isLoading } = useMyWorkspaces()
  const activeId = useWorkspaceStore((s) => s.activeId)
  const setActive = useWorkspaceStore((s) => s.setActive)
  const qc = useQueryClient()

  const current = mine.find((m) => m.workspace.id === activeId)

  const switchTo = useCallback(
    async (id: string) => {
      if (id === useWorkspaceStore.getState().activeId) return
      setActive(id)
      // os dados em cache são do workspace anterior: refaz tudo o que está na tela
      await qc.resetQueries({ predicate: (q) => q.queryKey[0] !== MY_WORKSPACES_KEY[0] })
    },
    [qc, setActive],
  )

  return {
    isLoading,
    all: mine,
    workspace: current?.workspace,
    role: current?.role,
    can: (min: WorkspaceRole) => hasRole(current?.role, min),
    switchTo,
  }
}
