import type { Project } from '@/types/database.types'
import { insertRow, listRows } from './db'
import { isoDay, sum } from './utils'

/**
 * Lança no financeiro o recebimento de um projeto concluído.
 *
 * O valor é o orçamento do projeto menos o que já foi lançado como entrada
 * para ele (parcelas registradas à mão contam, e também o orçamento gerado
 * pela proposta que originou o projeto), então concluir duas vezes ou já ter
 * lançado tudo não duplica nada. Devolve o valor lançado (0 = nada a
 * lançar).
 *
 * `historic` é para projeto cadastrado já como concluído (registro de trabalho
 * antigo): o recebimento é datado no prazo do projeto, não em hoje, para cair
 * no mês em que aconteceu.
 */
export async function registerProjectPayment(project: Project, historic = false): Promise<number> {
  const budget = Number(project.budget ?? 0)
  if (budget <= 0) return 0

  const transactions = await listRows('financial_transactions')
  // o orçamento criado quando a proposta foi aprovada já cobra este trabalho
  const proposalQuotes = project.proposal_id ? (await listRows('quotes')).filter((q) => q.proposal_id === project.proposal_id).map((q) => q.id) : []
  const alreadyBilled = sum(
    transactions
      .filter((t) => t.type === 'income' && (t.project_id === project.id || (t.quote_id && proposalQuotes.includes(t.quote_id))))
      .map((t) => t.amount),
  )
  const remaining = Math.round((budget - alreadyBilled) * 100) / 100
  if (remaining <= 0) return 0

  const today = isoDay(new Date())
  const paidOn = historic && project.deadline && project.deadline < today ? project.deadline : today
  await insertRow('financial_transactions', {
    type: 'income',
    category: 'Projeto',
    description: `Projeto concluído — ${project.title}`,
    amount: remaining,
    due_date: paidOn,
    payment_date: paidOn,
    status: 'paid',
    client_id: project.client_id,
    freelancer_id: null,
    project_id: project.id,
  })
  return remaining
}
