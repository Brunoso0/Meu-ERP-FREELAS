import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'
import { MY_WORKSPACES_KEY, useActiveWorkspace } from '@/hooks/useWorkspace'
import { acceptInvite, getInvite, roleLabel } from '@/lib/workspace'

/** Abre o link de convite: mostra a empresa e o papel e, ao aceitar, entra nela. */
export default function AcceptInvite() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { switchTo } = useActiveWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => getInvite(token), retry: false })

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const workspaceId = await acceptInvite(token)
      await qc.invalidateQueries({ queryKey: MY_WORKSPACES_KEY })
      await switchTo(workspaceId)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.')
      setBusy(false)
    }
  }

  const data = invite.data
  const unusable = !data || data.expired || data.accepted

  return (
    <div className="mx-auto mt-16 max-w-md">
      <Card className="p-6 text-center">
        {invite.isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
        ) : unusable ? (
          <>
            <h1 className="mb-2 text-lg font-semibold">Convite indisponível</h1>
            <p className="mb-5 text-sm text-slate-500">Este convite não existe, já foi usado ou venceu. Peça um novo a quem convidou.</p>
            <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>Ir para o sistema</Button>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-lg font-semibold">Convite para {data.workspace}</h1>
            <p className="mb-1 text-sm text-slate-500">Papel: <strong>{roleLabel[data.role]}</strong></p>
            <p className="mb-5 text-xs text-slate-400">Enviado para {data.email}</p>
            {!data.for_you && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Você está logado com outro e-mail. Entre com {data.email} para aceitar.
              </p>
            )}
            {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button onClick={accept} loading={busy} disabled={!data.for_you}>Aceitar e entrar</Button>
          </>
        )}
      </Card>
    </div>
  )
}
