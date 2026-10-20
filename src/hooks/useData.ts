import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deleteRow, insertRow, insertRows, listRows, updateRow } from '@/lib/db'
import { hasOpenCharge, receiveInCash, undoReceiveInCash, updateCharge } from '@/lib/billing'
import { registerProjectPayment } from '@/lib/project-payment'
import { ensureProposalForProject, projectToRemoveWithProposal, proposalProjectIsBilled, proposalToRemoveWithProject, removeLinked, syncProjectFromProposal } from '@/lib/project-proposal'
import { createQuoteFromProposal, quoteOfProposal, removeQuoteTransaction, syncQuoteFromTransaction, syncQuoteTransaction } from '@/lib/quote-finance'
import { registerContractInstallments } from '@/lib/recurrence'
import { formatCurrency, formatQuoteNumber, isoDay } from '@/lib/utils'
import type { Contract, FinancialTransaction, Project, Proposal, Quote, TableName, Tables } from '@/types/database.types'

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

const inForce = (status: string | undefined) => status === 'signed' || status === 'active'

/**
 * Contrato com mensalidade que acabou de ser assinado ganha as parcelas no
 * financeiro, uma por mês de vigência.
 */
async function settleSignedContract(qc: QueryClient, table: TableName, row: unknown, previousStatus: string | undefined) {
  if (table !== 'contracts') return
  const contract = row as Contract
  if (!inForce(contract.status) || inForce(previousStatus)) return
  try {
    const count = await registerContractInstallments(contract)
    if (count > 0) {
      await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
      toast.success('Mensalidades lançadas no financeiro', { description: `${count} × ${formatCurrency(contract.monthly_amount)} · ${contract.title}` })
    }
  } catch (error) {
    toast.error('Contrato assinado, mas as mensalidades não foram lançadas', { description: describe(error) })
  }
}

/**
 * Orçamento, proposta e financeiro andam juntos:
 * - orçamento criado ou alterado atualiza o seu lançamento no financeiro;
 * - lançamento de orçamento marcado como pago (ou reaberto) leva o orçamento junto.
 * A aprovação de proposta, que pergunta a forma de pagamento, fica em useApproveProposal.
 */
async function settleQuoteLinks(qc: QueryClient, table: TableName, row: unknown) {
  try {
    if (table === 'quotes') {
      if (await syncQuoteTransaction(row as Quote)) {
        // valores do orçamento mudaram: as cobranças abertas dele acompanham
        const parts = (await listRows('financial_transactions')).filter((t) => t.quote_id === (row as Quote).id && hasOpenCharge(t))
        for (const t of parts) {
          await updateCharge(t.id)
            .then(({ notice }) => notice && toast.info('Cobrança no Asaas', { description: notice, duration: 12000 }))
            .catch((error) => toast.error('A cobrança no Asaas não foi atualizada', { description: describe(error) }))
        }
        await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
      }
    } else if (table === 'financial_transactions') {
      if (await syncQuoteFromTransaction(row as FinancialTransaction)) await qc.invalidateQueries({ queryKey: ['quotes'] })
    }
  } catch (error) {
    toast.error('Salvo, mas o orçamento e o financeiro não foram sincronizados', { description: describe(error) })
  }
}

/**
 * Lançamento com cobrança no gateway (Asaas) acompanha o que muda aqui:
 * - marcado como pago à mão: dá baixa "recebido por fora" no Asaas, para o cliente não pagar de novo;
 * - reaberto: desfaz essa baixa (pagamento recebido pelo Asaas só se estorna lá);
 * - valor, vencimento ou descrição alterados: a cobrança é atualizada.
 */
async function settleGatewayCharge(qc: QueryClient, table: TableName, row: unknown, before: unknown) {
  if (table !== 'financial_transactions') return
  const t = row as FinancialTransaction
  const b = before as FinancialTransaction | undefined
  if (!t.gateway_charge_id || !b) return
  try {
    if (b.status !== 'paid' && t.status === 'paid') {
      await receiveInCash(t.id, t.payment_date ?? isoDay(new Date()))
      toast.success('Baixa registrada no Asaas', { description: 'A cobrança foi marcada como recebida por fora; o cliente não paga de novo.' })
    } else if (b.status === 'paid' && t.status !== 'paid') {
      await undoReceiveInCash(t.id)
      toast.success('Baixa desfeita no Asaas', { description: 'A cobrança voltou a aguardar pagamento.' })
    } else if (hasOpenCharge(t) && (Number(b.amount) !== Number(t.amount) || b.due_date !== t.due_date || b.description !== t.description || b.client_id !== t.client_id)) {
      const { notice } = await updateCharge(t.id)
      if (notice) toast.info('Cobrança no Asaas', { description: notice, duration: 12000 })
      else toast.success('Cobrança atualizada no Asaas')
    } else return
  } catch (error) {
    // o que vale é o que está no Asaas: volta o lançamento para o estado anterior
    if (b.status !== t.status) await updateRow('financial_transactions', t.id, { status: b.status, payment_date: b.payment_date }).catch(() => null)
    toast.error(b.status !== t.status ? 'Situação não alterada' : 'Salvo aqui, mas a cobrança no Asaas não foi atualizada', { description: describe(error) })
  }
  await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
  await qc.invalidateQueries({ queryKey: ['quotes'] })
}

/**
 * Projeto e proposta andam juntos: proposta criada ou alterada garante o seu
 * projeto (e o mantém em dia); projeto criado sem proposta ganha uma.
 */
async function settleProjectProposal(qc: QueryClient, table: TableName, row: unknown) {
  try {
    if (table === 'proposals') {
      if (await syncProjectFromProposal(row as Proposal)) await qc.invalidateQueries({ queryKey: ['projects'] })
    } else if (table === 'projects') {
      if (await ensureProposalForProject(row as Project)) {
        await qc.invalidateQueries({ queryKey: ['projects'] })
        await qc.invalidateQueries({ queryKey: ['proposals'] })
      }
    }
  } catch (error) {
    toast.error(table === 'proposals' ? 'Proposta salva, mas o projeto dela não foi atualizado' : 'Projeto salvo, mas a proposta dele não foi criada', { description: describe(error) })
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
      await settleSignedContract(qc, table, row, undefined)
      await settleQuoteLinks(qc, table, row)
      await settleProjectProposal(qc, table, row)
    },
    onError: (error) => toast.error('Não foi possível salvar', { description: describe(error) }),
  })
}

/** Cria várias linhas de uma vez (as parcelas de uma recorrência). */
export function useInsertMany<T extends TableName>(table: T) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: Partial<Tables[T]>[]) => insertRows(table, rows),
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
    onSuccess: async (row, { id }, context) => {
      const before = context?.previous?.find((r) => r.id === id) as { status?: string } | undefined
      await settleCompletedProject(qc, table, row, before?.status, false)
      await settleSignedContract(qc, table, row, before?.status)
      await settleGatewayCharge(qc, table, row, before)
      await settleQuoteLinks(qc, table, row)
      await settleProjectProposal(qc, table, row)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [table] }),
  })
}

/**
 * Aprova a proposta e, se ela ainda não tem orçamento, gera o orçamento
 * aguardando pagamento, integral ou com entrada (`depositPct`, ex.: 50).
 * Com `keepStatus`, só gera o orçamento (proposta assinada continua "Assinado").
 */
export function useApproveProposal() {
  const qc = useQueryClient()
  return async (proposal: Proposal, depositPct: number | null, keepStatus = false) => {
    try {
      const existing = await quoteOfProposal(proposal.id)
      if (!keepStatus) await updateRow('proposals', proposal.id, { status: 'approved' })
      // projeto que já tem recebimentos lançados não ganha orçamento (cobraria duas vezes)
      const billed = !existing && (await proposalProjectIsBilled(proposal.id))
      const quote = existing || billed ? null : await createQuoteFromProposal(proposal, depositPct)
      // aprovar tira o projeto do planejamento
      if (!keepStatus) await syncProjectFromProposal({ ...proposal, status: 'approved' })
      await Promise.all(['proposals', 'projects', 'quotes', 'financial_transactions'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
      if (billed) {
        toast.success(keepStatus ? 'Orçamento não gerado' : 'Proposta marcada como aprovada', { description: 'O projeto dela já tem recebimentos no financeiro, então nenhum orçamento novo foi criado.' })
        return
      }
      if (quote) {
        const first = depositPct ? `entrada de ${formatCurrency(Math.round(Number(quote.total_amount) * depositPct) / 100)} (${depositPct}%)` : formatCurrency(quote.total_amount)
        toast.success(`${keepStatus ? 'Orçamento' : 'Proposta aprovada · orçamento'} ${formatQuoteNumber(quote.quote_number)} criado`, { description: `Aguardando ${first}, já no financeiro` })
      } else {
        if (!keepStatus || existing) toast.success(keepStatus ? 'A proposta já tem orçamento' : 'Proposta marcada como aprovada', existing ? { description: `Ela já tem o orçamento ${formatQuoteNumber(existing.quote_number)}` } : undefined)
      }
    } catch (error) {
      toast.error('Não foi possível aprovar a proposta', { description: describe(error) })
    }
  }
}

export function useRemove<T extends TableName>(table: T) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // orçamento excluído não deixa cobrança pendente no financeiro
      if (table === 'quotes') await removeQuoteTransaction(id)
      // projeto e proposta saem juntos (ou nenhum dos dois, se já há histórico)
      const linkedProposal = table === 'projects' ? await proposalToRemoveWithProject(id) : null
      const linkedProject = table === 'proposals' ? await projectToRemoveWithProposal(id) : null
      await deleteRow(table, id)
      await removeLinked('proposals', linkedProposal)
      await removeLinked('projects', linkedProject)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [table] })
      if (table === 'quotes') await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
      if (table === 'projects') await qc.invalidateQueries({ queryKey: ['proposals'] })
      if (table === 'proposals') await qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error) => toast.error('Não foi possível excluir', { description: describe(error) }),
  })
}
