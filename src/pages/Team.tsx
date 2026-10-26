import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Copy, LogOut, Trash2, UserPlus } from 'lucide-react'
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui/primitives'
import { confirm } from '@/components/ui/confirm'
import { MY_WORKSPACES_KEY, useActiveWorkspace } from '@/hooks/useWorkspace'
import {
  changeMemberRole, createInvite, inviteLink, leaveWorkspace, listInvites, listMembers,
  removeMember, revokeInvite, roleHint, roleLabel, transferOwnership,
} from '@/lib/workspace'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/lib/utils'
import type { MemberInfo, WorkspaceRole } from '@/types/database.types'

type Assignable = Exclude<WorkspaceRole, 'owner'>
const message = (error: unknown) => (error instanceof Error ? error.message : 'Erro inesperado.')

/**
 * Equipe: quem participa do workspace e com qual papel, convites em aberto e
 * as saídas (sair, remover, passar a posse). As regras de quem pode o quê
 * valem no banco; aqui a tela só esconde o que a pessoa não pode fazer.
 */
export default function Team() {
  const { workspace, role, can, switchTo, all } = useActiveWorkspace()
  const { session } = useAuth()
  const qc = useQueryClient()
  const me = session?.user.id
  const wsId = workspace?.id ?? ''

  const members = useQuery({ queryKey: ['team-members', wsId], queryFn: () => listMembers(wsId), enabled: !!wsId })
  const invites = useQuery({ queryKey: ['team-invites', wsId], queryFn: () => listInvites(wsId), enabled: !!wsId && can('admin') })

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['team-members', wsId] }), qc.invalidateQueries({ queryKey: ['team-invites', wsId] })])

  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Assignable>('member')
  const [link, setLink] = useState<{ email: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const invite = useMutation({
    mutationFn: () => createInvite(wsId, email, inviteRole),
    onSuccess: async (data) => {
      setLink({ email: data.email, url: inviteLink(data.token) })
      setEmail('')
      setCopied(false)
      await refresh()
    },
    onError: (e) => toast.error('Não foi possível criar o convite', { description: message(e) }),
  })

  const run = (label: string, action: () => Promise<unknown>, after?: () => Promise<unknown> | void) =>
    action()
      .then(async () => {
        await refresh()
        await after?.()
      })
      .catch((e) => toast.error(label, { description: message(e) }))

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link.url).catch(() => undefined)
    setCopied(true)
  }

  async function onRemove(m: MemberInfo) {
    if (!(await confirm({ title: `Remover ${m.full_name || m.email}?`, description: 'A pessoa perde o acesso a este workspace na hora. Os dados dela criados aqui continuam com a empresa.', confirmLabel: 'Remover' }))) return
    await run('Não foi possível remover', () => removeMember(wsId, m.user_id))
  }

  async function onTransfer(m: MemberInfo) {
    if (!(await confirm({ title: `Passar a posse para ${m.full_name || m.email}?`, description: 'Ela vira a dona do workspace (plano, cobrança e exclusão). Você passa a administrador.', confirmLabel: 'Passar a posse', tone: 'default' }))) return
    await run('Não foi possível transferir a posse', () => transferOwnership(wsId, m.user_id), () => qc.invalidateQueries({ queryKey: MY_WORKSPACES_KEY }))
  }

  async function onLeave() {
    if (!(await confirm({ title: 'Sair deste workspace?', description: 'Você perde o acesso aos dados dele. Para voltar, um administrador precisa convidar você de novo.', confirmLabel: 'Sair' }))) return
    await leaveWorkspace(wsId)
      .then(async () => {
        await qc.invalidateQueries({ queryKey: MY_WORKSPACES_KEY })
        const next = all.find((m) => m.workspace.id !== wsId)
        if (next) await switchTo(next.workspace.id)
      })
      .catch((e) => toast.error('Não foi possível sair', { description: message(e) }))
  }

  // papéis que a pessoa pode dar: o administrador só o dono concede
  const grantable: Assignable[] = role === 'owner' ? ['admin', 'member', 'viewer'] : ['member', 'viewer']
  const canManage = (m: MemberInfo) => can('admin') && m.role !== 'owner' && m.user_id !== me && (m.role !== 'admin' || role === 'owner')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Equipe" description={workspace ? `Quem participa de ${workspace.name} e o que cada pessoa pode fazer.` : undefined} />

      <Card className="mb-6 divide-y">
        {members.isLoading ? (
          <div className="space-y-3 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : (
          members.data?.map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar name={m.full_name || m.email} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.full_name || m.email}
                  {m.user_id === me && <span className="ml-2 text-xs font-normal text-slate-400">você</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.email} · desde {formatDate(m.joined_at)}</p>
              </div>
              {canManage(m) ? (
                <Select
                  aria-label={`Papel de ${m.full_name || m.email}`}
                  className="w-44"
                  value={m.role}
                  onChange={(e) => run('Não foi possível alterar o papel', () => changeMemberRole(wsId, m.user_id, e.target.value as Assignable))}
                >
                  {[...new Set<WorkspaceRole>([m.role, ...grantable])].map((r) => (
                    <option key={r} value={r} disabled={r === 'owner'}>{roleLabel[r]}</option>
                  ))}
                </Select>
              ) : (
                <Badge tone={m.role === 'owner' ? 'indigo' : 'slate'}>{roleLabel[m.role]}</Badge>
              )}
              {role === 'owner' && m.user_id !== me && (
                <Button size="sm" variant="secondary" onClick={() => onTransfer(m)}>Passar a posse</Button>
              )}
              {canManage(m) && (
                <Button size="icon" variant="danger" aria-label={`Remover ${m.full_name || m.email}`} onClick={() => onRemove(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </Card>

      {can('admin') && (
        <Card className="mb-6 p-4">
          <h2 className="mb-1 text-sm font-semibold">Convidar alguém</h2>
          <p className="mb-4 text-xs text-slate-500">A pessoa entra pelo link, com o e-mail convidado. O convite vale por 7 dias e um uso.</p>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              invite.mutate()
            }}
          >
            <Field label="E-mail">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contador@exemplo.com" />
            </Field>
            <Field label="Papel">
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Assignable)}>
                {grantable.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
              </Select>
            </Field>
            <Button type="submit" loading={invite.isPending}><UserPlus className="h-4 w-4" />Convidar</Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">{roleHint[inviteRole]}</p>

          {link && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="mb-2 text-xs text-emerald-800 dark:text-emerald-300">Convite para {link.email}. Copie e envie agora: por segurança, o link não aparece de novo.</p>
              <div className="flex gap-2">
                <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiado' : 'Copiar'}</Button>
              </div>
            </div>
          )}

          {!!invites.data?.length && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Convites em aberto</h3>
              <ul className="divide-y rounded-lg border">
                {invites.data.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{i.email}</span>
                    <Badge>{roleLabel[i.role]}</Badge>
                    <span className="hidden text-xs text-slate-500 sm:inline">vence {formatDate(i.expires_at)}</span>
                    <Button size="sm" variant="danger" onClick={() => run('Não foi possível cancelar', () => revokeInvite(i.id))}>Cancelar</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {role && role !== 'owner' && (
        <Button variant="danger" onClick={onLeave}><LogOut className="h-4 w-4" />Sair deste workspace</Button>
      )}
    </div>
  )
}
