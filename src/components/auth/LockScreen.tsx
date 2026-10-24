import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Fingerprint } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'
import { expireSession, useSessionLock, verifyBiometric } from '@/lib/session'

/** Tela de bloqueio: a digital/rosto do aparelho libera; a senha é a saída alternativa. */
export function LockScreen({ session }: { session: Session }) {
  const setLocked = useSessionLock((s) => s.setLocked)
  const manual = useSessionLock((s) => s.manual)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(false)

  const unlock = async () => {
    setBusy(true)
    setError(null)
    try {
      await verifyBiometric(session.user.id)
      setLocked(false)
    } catch (e) {
      // cancelar o pedido do sistema não é erro que precise de explicação
      const name = e instanceof DOMException ? e.name : ''
      setError(name === 'NotAllowedError' || name === 'AbortError' ? null : e instanceof Error ? e.message : 'Não foi possível confirmar a biometria.')
    } finally {
      setBusy(false)
    }
  }

  // tenta já ao abrir; alguns navegadores exigem um toque antes, e aí fica o botão
  useEffect(() => {
    if (tried.current || manual) return
    tried.current = true
    void unlock()
  }, [])

  return (
    <div className="safe-top safe-bottom flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">F</span>
          <span className="text-sm font-semibold tracking-tight">Meu ERP Freelas</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight">App bloqueado</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Use a digital, o rosto ou o bloqueio de tela deste aparelho para continuar como <strong className="break-all">{session.user.email}</strong>.
        </p>
        <Button type="button" className="mt-6 w-full" loading={busy} onClick={unlock}>
          <Fingerprint className="h-4 w-4" /> Desbloquear
        </Button>
        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={() => void expireSession()}
          className="mt-4 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
        >
          Entrar com e-mail e senha
        </button>
      </Card>
    </div>
  )
}
