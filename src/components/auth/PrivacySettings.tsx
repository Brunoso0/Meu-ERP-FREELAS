import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Input } from '@/components/ui/primitives'
import { useAuth } from '@/hooks/useAuth'
import { exportMyData, deleteMyAccount } from '@/lib/privacy'

/* Direitos do titular: baixar os dados e apagar a conta. Sem <form>, pois mora dentro do formulário de Minha empresa. */
export function PrivacySettings() {
  const { session } = useAuth()
  const email = session?.user.email ?? ''
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  const download = async () => {
    setBusy(true)
    try {
      await exportMyData()
      toast.success('Arquivo baixado')
    } catch (e) {
      toast.error('Não foi possível exportar', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteMyAccount()
    } catch (e) {
      toast.error('Não foi possível apagar a conta', { description: e instanceof Error ? e.message : undefined })
      setBusy(false)
    }
  }

  return (
    <div className="col-span-2 space-y-5">
      <div>
        <p className="text-sm text-slate-600 dark:text-slate-300">Baixe uma cópia de tudo o que está na sua conta (perfil, clientes, propostas, contratos, financeiro, agenda, demandas) em um arquivo JSON.</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={download} disabled={busy}>
          <Download className="h-4 w-4" /> Baixar meus dados
        </Button>
      </div>
      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-300">Apagar a conta remove de forma definitiva o seu acesso e os workspaces em que você é a única pessoa. Não dá para desfazer.</p>
        {!confirming ? (
          <Button type="button" variant="secondary" className="mt-3 text-red-600" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" /> Apagar minha conta
          </Button>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">Para confirmar, digite o seu e-mail: <strong>{email}</strong></p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} autoComplete="off" />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => { setConfirming(false); setTyped('') }} disabled={busy}>Cancelar</Button>
              <Button type="button" className="bg-red-600 hover:bg-red-700" onClick={remove} disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()}>
                Apagar para sempre
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">
        <Link to="/termos" className="underline">Termos de uso</Link> · <Link to="/privacidade" className="underline">Política de privacidade</Link>
      </p>
    </div>
  )
}
