import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useMyWorkspaces } from '@/hooks/useWorkspace'
import { useWorkspaceStore } from '@/store/workspace'

/**
 * Só deixa o app abrir depois de saber em qual workspace a pessoa está:
 * todas as consultas e gravações dependem disso. Usa o último que ela abriu
 * (se ainda for membro) ou o principal, onde ela é dona.
 */
export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { data: mine, isLoading, isError, refetch } = useMyWorkspaces()
  const activeId = useWorkspaceStore((s) => s.activeId)
  const setActive = useWorkspaceStore((s) => s.setActive)

  const valid = !!mine?.some((m) => m.workspace.id === activeId)

  useEffect(() => {
    if (!mine || valid) return
    setActive(mine[0]?.workspace.id ?? null)
  }, [mine, valid, setActive])

  if (isLoading || (mine && mine.length > 0 && !valid)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError || !mine || mine.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {isError ? 'Não foi possível carregar a sua empresa.' : 'Esta conta ainda não faz parte de nenhum workspace.'}
        </p>
        <button type="button" onClick={() => refetch()} className="text-sm font-medium text-brand-600 hover:underline">
          Tentar de novo
        </button>
      </div>
    )
  }

  return <>{children}</>
}
