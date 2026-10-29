import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Card } from '@/components/ui/primitives'
import { featureMinPlan, usePlan, type PlanFeature } from '@/lib/plan'

/** Mostra o conteúdo se o plano libera o recurso; senão, um aviso de upgrade no lugar. */
export function PlanGate({ feature, title, children }: { feature: PlanFeature; title: string; children: React.ReactNode }) {
  const { has, isOwner } = usePlan()
  if (has(feature)) return <>{children}</>
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-600/20 dark:text-brand-400"><Lock className="h-5 w-5" /></span>
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Disponível no plano {featureMinPlan[feature]} ou superior.{isOwner ? '' : ' Peça ao dono do workspace.'}</p>
      {isOwner && <Link to="/minha-empresa?aba=planos" className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Ver planos</Link>}
    </Card>
  )
}
