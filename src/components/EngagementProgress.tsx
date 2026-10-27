import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENGAGEMENT_STEPS, type Engagement } from '@/lib/engagement'

/** Faixa de 7 etapas do atendimento; as concluídas e a atual podem ser abertas. */
export function StepTrack({
  done,
  current,
  viewing,
  onSelect,
}: {
  done: boolean[]
  current: number
  viewing: number
  onSelect?: (index: number) => void
}) {
  return (
    <ol className="mx-auto flex w-full max-w-3xl items-start" aria-label="Etapas do atendimento">
      {ENGAGEMENT_STEPS.map((label, i) => {
        const complete = done[i] && i !== 6
        const reachable = !!onSelect && i <= current
        return (
          <li key={label} className="flex flex-1 flex-col items-center last:flex-none">
            <div className="flex w-full items-center">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect?.(i)}
                aria-current={i === viewing ? 'step' : undefined}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  complete && 'bg-brand-600 text-white',
                  !complete && i === viewing && 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-600/20',
                  !complete && i !== viewing && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                  reachable && 'cursor-pointer',
                )}
              >
                {complete ? <Check className="h-4 w-4" /> : i + 1}
              </button>
              {i < ENGAGEMENT_STEPS.length - 1 && <span className={cn('mx-1 h-0.5 flex-1 rounded', done[i] ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700')} />}
            </div>
            <span className={cn('mt-1.5 hidden text-xs sm:block', i === viewing ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400')}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Resumo de uma linha: etapa atual e quantas já foram feitas. */
export function stepSummary(e: Engagement) {
  const finished = e.done.slice(0, 6).filter(Boolean).length
  return { label: e.step === 6 ? 'Pronto' : `Etapa ${e.step + 1} de 7 · ${['Cliente', 'Proposta', 'Assinatura', 'Cobrança', 'Contrato', 'Projeto', 'Pronto'][e.step]}`, finished }
}
