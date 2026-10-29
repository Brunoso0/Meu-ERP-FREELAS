import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import type { PlanId, SubscriptionStatus } from '@/types/database.types'

export type PlanFeature = 'signature' | 'billing' | 'nfse' | 'reminders'
export type PlanCounter = 'members' | 'viewers' | 'clients' | 'proposals_month' | 'quotes_month' | 'leads_month' | 'storage_mb'

export interface PlanUsage {
  plan: PlanId
  chosen_plan: PlanId
  status: SubscriptionStatus
  trial_ends_at: string | null
  extra_members: number
  current_period_end: string | null
  cancel_at_period_end: boolean
  past_due_since: string | null
  has_subscription: boolean
  pending_plan: PlanId | null
  /** Limite ausente = sem limite. */
  limits: Partial<Record<PlanCounter, number>> & Partial<Record<PlanFeature, boolean>>
  usage: Record<PlanCounter, number>
}

export interface PlanInfo {
  id: PlanId
  name: string
  price: number
  tagline: string
  features: string[]
}

export const planNames: Record<PlanId, string> = { free: 'Grátis', essential: 'Essencial', pro: 'Profissional' }

/** O que cada plano oferece, para a tela de planos (os números reais vêm do banco). */
export const planCatalog: PlanInfo[] = [
  { id: 'free', name: 'Grátis', price: 0, tagline: 'Para começar e organizar o básico', features: ['Só você no workspace', 'Até 5 clientes ativos', '5 propostas e 5 orçamentos por mês', 'Projetos, demandas, agenda e financeiro', '100 MB de comprovantes'] },
  { id: 'essential', name: 'Essencial', price: 29.9, tagline: 'Para fechar e cobrar sem sair do sistema', features: ['2 pessoas + 1 contador (leitura)', 'Clientes, propostas e orçamentos ilimitados', 'Assinatura online de proposta e contrato', 'Cobrança pelo Asaas e mensalidades', '20 buscas de leads por mês', 'Lembretes por e-mail', '1 GB de comprovantes'] },
  { id: 'pro', name: 'Profissional', price: 59.9, tagline: 'Para quem tem equipe e emite nota', features: ['5 pessoas + 1 contador (leitura)', 'Pessoa extra por R$ 10/mês', 'Tudo do Essencial', 'Nota fiscal (NFS-e)', '100 buscas de leads por mês', '5 GB de comprovantes'] },
]

export const featureMinPlan: Record<PlanFeature, string> = { signature: 'Essencial', billing: 'Essencial', nfse: 'Profissional', reminders: 'Essencial' }

/** Dias que faltam para o fim do trial (0 no último dia); null fora do trial. */
export function trialDaysLeft(u: Pick<PlanUsage, 'status' | 'trial_ends_at'> | undefined): number | null {
  if (!u || u.status !== 'trialing' || !u.trial_ends_at) return null
  const ms = new Date(u.trial_ends_at).getTime() - Date.now()
  return ms > 0 ? Math.ceil(ms / 86_400_000) : null
}

/** Dias de tolerância depois do primeiro aviso de atraso (o mesmo valor de effective_plan no banco). */
export const PAST_DUE_GRACE_DAYS = 7

export interface PlanNoticeData {
  /** Muda quando o aviso muda, para "dispensar" valer só para este aviso. */
  key: string
  tone: 'info' | 'warn' | 'danger'
  text: string
  /** Avisos de atraso e de fim do teste (a poucos dias) não podem ser dispensados. */
  dismissible: boolean
}

const day = 86_400_000

/** O aviso do topo do app conforme a situação do plano; null quando está tudo certo. */
export function planNotice(u: PlanUsage | undefined, now = Date.now()): PlanNoticeData | null {
  if (!u) return null
  const trial = trialDaysLeft(u)
  if (trial !== null) {
    return {
      key: `trial-${trial}`,
      tone: trial <= 3 ? 'warn' : 'info',
      text: trial <= 1 ? 'Último dia do teste do plano Profissional' : `Faltam ${trial} dias do teste do plano Profissional`,
      dismissible: trial > 3,
    }
  }
  if (u.status === 'trialing') {
    return { key: 'trial-ended', tone: 'info', text: 'O teste acabou e o workspace voltou ao plano Grátis. Seus dados continuam aqui.', dismissible: true }
  }
  if (u.status === 'past_due') {
    const since = u.past_due_since ? new Date(u.past_due_since).getTime() : now
    const left = Math.max(0, PAST_DUE_GRACE_DAYS - Math.floor((now - since) / day))
    return {
      key: `past-due-${left}`,
      tone: left <= 2 ? 'danger' : 'warn',
      text: left === 0
        ? 'Pagamento em atraso: o plano volta ao Grátis hoje se a fatura não for paga.'
        : `Pagamento em atraso: pague em até ${left} ${left === 1 ? 'dia' : 'dias'} para não voltar ao plano Grátis.`,
      dismissible: false,
    }
  }
  if (u.status === 'canceled') {
    const end = u.current_period_end ? new Date(u.current_period_end).getTime() : 0
    if (u.plan !== 'free' && end > now) {
      const left = Math.ceil((end - now) / day)
      const date = new Date(end).toLocaleDateString('pt-BR')
      return {
        key: `canceled-${left <= 7 ? left : 'long'}`,
        tone: left <= 7 ? 'warn' : 'info',
        text: left <= 7 ? `Assinatura cancelada: o plano termina em ${left} ${left === 1 ? 'dia' : 'dias'} (${date}).` : `Assinatura cancelada: o plano vale até ${date}.`,
        dismissible: left > 7,
      }
    }
    if (u.plan === 'free' && u.chosen_plan !== 'free') {
      return { key: 'canceled-ended', tone: 'info', text: 'A assinatura terminou e o workspace voltou ao plano Grátis. Seus dados continuam aqui.', dismissible: true }
    }
  }
  return null
}

const DEMO: PlanUsage = {
  plan: 'pro',
  chosen_plan: 'pro',
  status: 'courtesy',
  trial_ends_at: null,
  extra_members: 0,
  current_period_end: null,
  cancel_at_period_end: false,
  past_due_since: null,
  has_subscription: false,
  pending_plan: null,
  limits: { signature: true, billing: true, nfse: true, reminders: true },
  usage: { members: 1, viewers: 0, clients: 0, proposals_month: 0, quotes_month: 0, leads_month: 0, storage_mb: 0 },
}

/** O plano em vigor do workspace aberto, o que ele permite e quanto já foi usado. */
export function usePlan() {
  const { workspace, can } = useActiveWorkspace()
  const id = workspace?.id
  const query = useQuery<PlanUsage>({
    queryKey: ['plan-usage', id],
    enabled: !!id,
    staleTime: 60_000,
    // voltando da página de pagamento, confere se o plano já mudou
    refetchOnWindowFocus: 'always',
    queryFn: async () => {
      if (!supabase) return DEMO
      const { data, error } = await supabase.rpc('plan_usage', { p_workspace: id })
      if (error) throw new Error(error.message)
      return data as PlanUsage
    },
  })
  const data = query.data
  return {
    ...query,
    usage: data,
    isOwner: can('owner'),
    /** Enquanto carrega, não bloqueia: o banco é quem recusa de verdade. */
    has: (feature: PlanFeature) => (data ? data.limits[feature] === true : true),
    limit: (counter: PlanCounter) => data?.limits[counter],
    used: (counter: PlanCounter) => data?.usage[counter] ?? 0,
  }
}
