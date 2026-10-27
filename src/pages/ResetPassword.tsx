import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

/** Tela aberta pelo link do e-mail de recuperação: define a nova senha e segue para o app. */
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    if (password.length < 6) return void toast.error('A senha precisa ter ao menos 6 caracteres')
    if (password !== confirm) return void toast.error('As senhas não são iguais')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return void toast.error('Não foi possível trocar a senha', { description: error.message })
    toast.success('Senha alterada')
    onDone()
  }

  const input = 'w-full rounded-2xl border border-slate-800 bg-slate-900/90 py-3.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500/60 focus:outline-none'
  return (
    <div className="safe-top safe-bottom flex min-h-screen items-center justify-center bg-[#020617] p-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border border-slate-800/80 bg-[rgba(9,13,22,0.85)] p-8">
        <div>
          <h1 className="text-xl font-semibold">Criar nova senha</h1>
          <p className="mt-1 text-sm text-slate-400">Escolha a senha que você vai usar daqui para frente.</p>
        </div>
        {[['Nova senha', password, setPassword], ['Repita a senha', confirm, setConfirm]].map(([label, value, set], i) => (
          <div key={i}>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">{label as string}</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input type="password" autoComplete="new-password" autoFocus={i === 0} value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className={input} />
            </div>
          </div>
        ))}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-70">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  )
}
