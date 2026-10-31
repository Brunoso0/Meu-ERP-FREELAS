import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/*
 * Painel do dono do SaaS. Quem pode entrar é decidido no banco (tabela platform_admins, que o app não
 * lê nem grava, e sessão confirmada com o código de duas etapas). Esta camada só chama as funções
 * admin_*; se alguém alterar o navegador para ver a tela, o banco recusa os dados.
 */

export type AdminStatus = 'none' | 'needs_2fa' | 'ok'

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('O painel precisa do Supabase configurado.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function platformAdminStatus(): Promise<AdminStatus> {
  if (!supabase) return 'none'
  const { data, error } = await supabase.rpc('platform_admin_status')
  if (error) return 'none'
  return (data as AdminStatus) ?? 'none'
}

export const ADMIN_STATUS_KEY = ['platform-admin-status']

/** 'none' para a maioria das pessoas: o menu do painel só aparece quando não é 'none'. */
export function useAdminStatus() {
  return useQuery<AdminStatus>({ queryKey: ADMIN_STATUS_KEY, queryFn: platformAdminStatus, staleTime: 60_000, retry: false })
}

export interface AdminOverview {
  users: number
  workspaces: number
  by_status: Record<string, number>
  by_plan: Record<string, number>
  mrr_cents: number
  trials_ending_3d: number
  signups_30d: { day: string; n: number }[]
  sources: Record<string, number>
  errors_24h: number
  error_kinds_24h: number
  recent_payments: { created_at: string; event: string; value: string | null; workspace: string | null }[]
}

export interface AdminWorkspace {
  id: string
  name: string
  owner_email: string | null
  plan_id: string
  status: string
  created_at: string
  trial_ends_at: string | null
  current_period_end: string | null
  billing_method: string | null
  past_due_since: string | null
  business_type: string | null
  city: string | null
  state: string | null
  source: string | null
  phone: string | null
  members: number
  clients: number
  last_login: string | null
}

export interface AdminError {
  id: number
  kind: string | null
  message: string
  path: string | null
  count: number
  people: number
  app_version: string | null
  first_seen: string
  last_seen: string
  workspace_id: string | null
  context: Record<string, unknown> | null
  breadcrumbs: Record<string, unknown>[] | null
  stack: string | null
  user_agent: string | null
}

export interface AdminAuditRow {
  created_at: string
  action: string
  admin: string | null
  workspace: string | null
  detail: Record<string, unknown>
}

export const adminOverview = () => rpc<AdminOverview>('admin_overview')
export const adminWorkspaces = (search: string, offset = 0) => rpc<{ total: number; rows: AdminWorkspace[] }>('admin_workspaces', { p_search: search || null, p_limit: 50, p_offset: offset })
export const adminErrors = () => rpc<AdminError[]>('admin_errors', { p_limit: 100 })
export const adminAudit = () => rpc<AdminAuditRow[]>('admin_audit_list', { p_limit: 100 })
export const adminGrantCourtesy = (workspace: string, plan: string, note: string) => rpc<void>('admin_grant_courtesy', { p_workspace: workspace, p_plan: plan, p_note: note || null })
export const adminExtendTrial = (workspace: string, days: number, note: string) => rpc<void>('admin_extend_trial', { p_workspace: workspace, p_days: days, p_note: note || null })
