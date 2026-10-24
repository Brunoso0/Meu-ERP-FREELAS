import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Fingerprint, ShieldOff } from 'lucide-react'
import { Badge, Button } from '@/components/ui/primitives'
import { useAuth } from '@/hooks/useAuth'
import { biometricAvailable, biometricFor, disableBiometric, enableBiometric } from '@/lib/session'

/** Liga/desliga o desbloqueio por digital/rosto neste aparelho (cada aparelho é ativado nele mesmo). */
export function BiometricSettings({ name }: { name?: string }) {
  const { session } = useAuth()
  const user = session?.user
  const [available, setAvailable] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    biometricAvailable().then(setAvailable)
  }, [])
  useEffect(() => {
    setEnabled(Boolean(user && biometricFor(user.id)))
  }, [user])

  if (!user) return null

  const toggle = async () => {
    if (enabled) {
      disableBiometric()
      setEnabled(false)
      toast.success('Biometria desligada neste aparelho', { description: 'A sessão volta a encerrar depois de 12 horas sem uso.' })
      return
    }
    setBusy(true)
    try {
      await enableBiometric({ id: user.id, email: user.email, name })
      setEnabled(true)
      toast.success('Biometria ativada neste aparelho', { description: 'Da próxima vez que abrir o app, ele pede a sua digital ou rosto.' })
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'NotAllowedError'
      if (!cancelled) toast.error('Não foi possível ativar a biometria', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const tone = enabled ? 'green' : available === false ? 'amber' : 'slate'
  const label = enabled ? 'Ativada' : available === false ? 'Indisponível' : 'Desligada'
  const hint = enabled
    ? 'O app bloqueia ao abrir, depois de 5 minutos fora dele ou 15 minutos parado, e a digital ou o rosto deste aparelho desbloqueia.'
    : available === false
      ? 'Este aparelho ou navegador não oferece digital, rosto ou bloqueio de tela para sites. No celular, use o app instalado no Chrome (Android) ou no Safari (iPhone).'
      : 'Ative para entrar com a digital ou o rosto em vez de digitar a senha. Sem biometria, a sessão encerra depois de 12 horas sem uso.'

  return (
    <div className="col-span-2 space-y-3">
      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Fingerprint className="h-4 w-4 text-slate-400" /> Biometria neste aparelho
          </p>
          {available !== null && <Badge tone={tone}>{label}</Badge>}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        {(available || enabled) && (
          <Button type="button" variant={enabled ? 'secondary' : 'primary'} size="sm" className="mt-3" loading={busy} onClick={toggle}>
            {enabled ? <ShieldOff className="h-3.5 w-3.5" /> : <Fingerprint className="h-3.5 w-3.5" />}
            {enabled ? 'Desligar neste aparelho' : 'Ativar neste aparelho'}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Por segurança, a cada 30 dias o app pede a senha de novo, com ou sem biometria.</p>
    </div>
  )
}
