import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { trialDaysLeft, usePlan } from '@/lib/plan'

/** Aviso fino no topo durante o trial; some para quem já assina. */
export function TrialBanner() {
  const { usage, isOwner } = usePlan()
  const days = trialDaysLeft(usage)
  if (days === null) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-brand-50 px-4 py-2 text-center text-xs text-brand-700 dark:bg-brand-600/15 dark:text-brand-400">
      <span className="flex items-center gap-1.5 font-medium"><Sparkles className="h-3.5 w-3.5" />
        {days <= 1 ? 'Último dia do teste do plano Profissional' : `Faltam ${days} dias do teste do plano Profissional`}
      </span>
      {isOwner && <Link to="/minha-empresa" className="font-semibold underline underline-offset-2">Ver planos</Link>}
    </div>
  )
}
