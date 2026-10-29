import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Sparkles, X } from 'lucide-react'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { planNotice, usePlan } from '@/lib/plan'
import { cn } from '@/lib/utils'

const dismissedKey = (workspace: string, key: string) => `krono-aviso-${workspace}-${key}`

function wasDismissed(workspace: string, key: string) {
  try {
    return localStorage.getItem(dismissedKey(workspace, key)) === '1'
  } catch {
    return false
  }
}

const tones = {
  info: 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-400',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
}

/** Aviso fino no topo: teste acabando, pagamento em atraso, assinatura cancelada. Some quando está tudo certo. */
export function PlanNotice() {
  const { usage, isOwner } = usePlan()
  const [, rerender] = useState(0)
  const notice = planNotice(usage)
  const workspace = useActiveWorkspace().workspace?.id ?? ''
  if (!notice) return null
  if (notice.dismissible && wasDismissed(workspace, notice.key)) return null

  const Icon = notice.tone === 'info' ? Sparkles : AlertTriangle
  function dismiss() {
    try {
      localStorage.setItem(dismissedKey(workspace, notice!.key), '1')
    } catch {
      /* sem armazenamento: o aviso só volta no próximo carregamento */
    }
    rerender((n) => n + 1)
  }

  return (
    <div role="status" className={cn('flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-xs', tones[notice.tone])}>
      <span className="flex items-center gap-1.5 font-medium"><Icon className="h-3.5 w-3.5 shrink-0" />{notice.text}</span>
      {isOwner
        ? <Link to="/minha-empresa" className="font-semibold underline underline-offset-2">{notice.tone === 'info' ? 'Ver planos' : 'Resolver agora'}</Link>
        : <span className="opacity-80">Avise o dono do workspace.</span>}
      {notice.dismissible && (
        <button type="button" onClick={dismiss} aria-label="Dispensar aviso" className="rounded p-0.5 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
      )}
    </div>
  )
}
