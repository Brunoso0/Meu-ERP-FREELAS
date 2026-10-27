import type { BusinessType, MemberInfo, TeamSize, Workspace, WorkspaceInvite, WorkspaceRole } from '@/types/database.types'
import { listRows } from './db'
import { DEMO_USER_ID } from './mock-data'
import { supabase } from './supabase'

/** Papéis do menor para o maior poder. */
const RANK: Record<WorkspaceRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 }

export const roleLabel: Record<WorkspaceRole, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Leitura (contador)',
}

export const roleHint: Record<WorkspaceRole, string> = {
  owner: 'Tudo, inclusive plano, cobrança, excluir o workspace e transferir a posse.',
  admin: 'Tudo menos plano e exclusão: membros, integrações (Asaas) e nota fiscal.',
  member: 'Clientes, propostas, projetos, demandas, agenda e financeiro.',
  viewer: 'Vê e exporta o financeiro, as notas e os comprovantes, sem alterar nada.',
}

export const hasRole = (role: WorkspaceRole | undefined, min: WorkspaceRole) => !!role && RANK[role] >= RANK[min]

export interface MyWorkspace {
  workspace: Workspace
  role: WorkspaceRole
}

const demoOnly = () => new Error('Equipe e convites precisam do Supabase configurado (o modo demo tem um workspace só).')

const describe = (error: { message: string } | null) => {
  if (error) throw new Error(error.message)
}

/** Os workspaces de que a pessoa participa, com o papel dela em cada um. */
export async function listMyWorkspaces(): Promise<MyWorkspace[]> {
  if (!supabase) {
    return (await listRows('workspaces')).map((workspace) => ({ workspace, role: 'owner' as const }))
  }
  const { data: session } = await supabase.auth.getSession()
  const uid = session.session?.user.id
  if (!uid) return []
  const { data, error } = await supabase.from('workspace_members').select('role, workspaces(*)').eq('user_id', uid)
  describe(error)
  return ((data ?? []) as unknown as { role: WorkspaceRole; workspaces: Workspace | null }[])
    .filter((row) => row.workspaces)
    .map((row) => ({ workspace: row.workspaces as Workspace, role: row.role }))
    .sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.workspace.created_at.localeCompare(b.workspace.created_at))
}

export async function listMembers(workspaceId: string): Promise<MemberInfo[]> {
  if (!supabase) {
    return [{ user_id: DEMO_USER_ID, role: 'owner', full_name: 'Usuário Demo', email: 'demo@meuerp.example', joined_at: new Date().toISOString() }]
  }
  const { data, error } = await supabase.rpc('list_workspace_members', { p_workspace: workspaceId })
  describe(error)
  return (data ?? []) as MemberInfo[]
}

export async function listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, invited_by, expires_at, accepted_at, created_at')
    .eq('workspace_id', workspaceId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  describe(error)
  return (data ?? []) as WorkspaceInvite[]
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw demoOnly()
  const { data, error } = await supabase.rpc(name, args)
  describe(error)
  return data as T
}

export const inviteLink = (token: string) => `${window.location.origin}/convite/${token}`

export const createInvite = (workspaceId: string, email: string, role: Exclude<WorkspaceRole, 'owner'>) =>
  rpc<{ id: string; token: string; email: string; role: string; expires_at: string }>('create_workspace_invite', { p_workspace: workspaceId, p_email: email, p_role: role })

export const revokeInvite = (inviteId: string) => rpc('revoke_workspace_invite', { p_invite: inviteId })

export const changeMemberRole = (workspaceId: string, userId: string, role: Exclude<WorkspaceRole, 'owner'>) =>
  rpc('change_member_role', { p_workspace: workspaceId, p_user: userId, p_role: role })

export const removeMember = (workspaceId: string, userId: string) => rpc('remove_workspace_member', { p_workspace: workspaceId, p_user: userId })

export const leaveWorkspace = (workspaceId: string) => rpc('leave_workspace', { p_workspace: workspaceId })

export const transferOwnership = (workspaceId: string, userId: string) => rpc('transfer_workspace_ownership', { p_workspace: workspaceId, p_user: userId })

export interface InviteInfo {
  workspace: string
  role: WorkspaceRole
  email: string
  expired: boolean
  accepted: boolean
  for_you: boolean
}

export const getInvite = (token: string) => rpc<InviteInfo | null>('get_workspace_invite', { p_token: token })

/** Devolve o id do workspace em que a pessoa entrou. */
export const acceptInvite = (token: string) => rpc<string>('accept_workspace_invite', { p_token: token })

export const createWorkspace = (name: string) => rpc<string>('create_workspace', { p_name: name })

/** Apaga primeiro os arquivos do Storage (o SQL não pode) e depois o workspace inteiro. */
export async function deleteWorkspace(workspaceId: string, confirmName: string): Promise<void> {
  if (!supabase) throw demoOnly()
  await removeFolder(workspaceId)
  await rpc('delete_workspace', { p_workspace: workspaceId, p_confirm_name: confirmName })
}

async function removeFolder(prefix: string): Promise<void> {
  if (!supabase) throw demoOnly()
  const bucket = supabase.storage.from('proofs')
  const { data, error } = await bucket.list(prefix, { limit: 1000 })
  if (error) throw error
  const files: string[] = []
  for (const item of data ?? []) {
    if (item.id) files.push(`${prefix}/${item.name}`)
    else await removeFolder(`${prefix}/${item.name}`)
  }
  if (files.length) {
    const { error: rmError } = await bucket.remove(files)
    if (rmError) throw rmError
  }
}

export const businessTypeLabel: Record<BusinessType, string> = {
  mei: 'MEI',
  me: 'ME (Microempresa)',
  epp: 'EPP (Empresa de Pequeno Porte)',
  outra_pj: 'Outra empresa (CNPJ)',
  pf: 'Sem CNPJ (pessoa física / autônomo)',
}

export const teamSizeLabel: Record<TeamSize, string> = {
  solo: 'Só eu',
  '2-5': '2 a 5 pessoas',
  '6-15': '6 a 15 pessoas',
  '16+': 'Mais de 15 pessoas',
}

export interface BusinessProfile {
  business_type: BusinessType
  team_size: TeamSize
  company_name?: string
  document?: string
  segment?: string
}

/** Grava a entrevista (ou a edição do perfil do negócio) no workspace. */
export async function saveBusinessProfile(workspaceId: string, profile: BusinessProfile, markDone = true): Promise<void> {
  if (!supabase) throw demoOnly()
  const name = profile.company_name?.trim()
  const patch: Record<string, unknown> = {
    business_type: profile.business_type,
    team_size: profile.team_size,
    segment: profile.segment?.trim() || null,
  }
  if (profile.document !== undefined) patch.document = profile.document.trim() || null
  if (name) {
    patch.company_name = name
    patch.name = name
  }
  if (markDone) patch.onboarded_at = new Date().toISOString()
  const { error } = await supabase.from('workspaces').update(patch).eq('id', workspaceId)
  describe(error)
}
