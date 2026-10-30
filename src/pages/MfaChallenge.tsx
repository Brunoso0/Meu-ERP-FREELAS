import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { activeFactor, recoverWithCode, verifyCode } from '@/lib/mfa'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'

/** Segundo passo do login: o código de 6 dígitos do app autenticador (ou um código de recuperação). */
export default function MfaChallenge() {
  const { signOut } = useAuth()
  const queryClient = useQueryClient()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    activeFactor()
      .then((f) => setFactorId(f?.id ?? null))
      .catch(() => setFactorId(null))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    try {
      if (recovery) {
        await recoverWithCode(code)
        toast.success('Verificação em duas etapas desativada', { description: 'Ative de novo em Minha empresa > Segurança e gere novos códigos.' })
      } else if (factorId) {
        await verifyCode(factorId, code)
      }
      // o que foi consultado antes do código voltou vazio (a sessão ainda não valia): refaz tudo
      await queryClient.resetQueries()
      // o app libera sozinho: a sessão passou a valer como confirmada
    } catch (error) {
      toast.error(recovery ? 'Não foi possível usar o código' : 'Código não confere', { description: error instanceof Error ? error.message : undefined })
      setBusy(false)
    }
  }

  const ready = recovery ? code.replace(/[^A-Za-z0-9]/g, '').length === 10 : code.length === 6
  const input = 'w-full rounded-2xl border border-slate-800 bg-slate-900/90 py-3.5 pl-11 pr-4 text-center font-mono text-lg tracking-widest text-white placeholder-slate-600 focus:border-indigo-500/60 focus:outline-none'
  const Icon = recovery ? KeyRound : ShieldCheck
  return (
    <div className="safe-top safe-bottom flex min-h-screen items-center justify-center bg-[#020617] p-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border border-slate-800/80 bg-[rgba(9,13,22,0.85)] p-8">
        <div>
          <h1 className="text-xl font-semibold">{recovery ? 'Código de recuperação' : 'Verificação em duas etapas'}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {recovery
              ? 'Digite um dos códigos que você guardou ao ativar. Ele vale uma vez e desliga a verificação, para você entrar e configurar de novo.'
              : 'Abra o aplicativo autenticador no celular e digite o código de 6 dígitos.'}
          </p>
        </div>
        <div className="relative">
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            key={recovery ? 'recovery' : 'totp'}
            autoFocus
            value={code}
            onChange={(e) => setCode(recovery ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode={recovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder={recovery ? 'XXXXX-XXXXX' : '000000'}
            aria-label={recovery ? 'Código de recuperação' : 'Código de 6 dígitos'}
            className={input}
          />
        </div>
        <button type="submit" disabled={busy || !ready || (!recovery && !factorId)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : recovery ? 'Usar código e entrar' : 'Confirmar'}
        </button>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setRecovery(!recovery)
              setCode('')
            }}
            className="font-medium text-indigo-400 transition-colors hover:text-indigo-300"
          >
            {recovery ? 'Voltar ao código do aplicativo' : 'Perdi meu celular'}
          </button>
          <button type="button" onClick={() => signOut()} className="text-slate-400 transition-colors hover:text-slate-200">
            Sair
          </button>
        </div>
      </form>
    </div>
  )
}
