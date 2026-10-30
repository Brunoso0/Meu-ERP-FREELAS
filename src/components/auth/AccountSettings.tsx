import { useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Mail } from 'lucide-react'
import { Badge, Button, Field, Input } from '@/components/ui/primitives'
import { useAuth } from '@/hooks/useAuth'
import { appUrl } from '@/lib/app-base'
import { supabase } from '@/lib/supabase'

/*
 * Troca de senha e de e-mail de login. Estes blocos moram dentro do formulário de Minha empresa:
 * por isso não usam <form> (o Enter e os botões não podem salvar a empresa por engano).
 */

const MIN_PASSWORD = 6

/** Mensagens do Supabase Auth em português, para o que a pessoa pode resolver sozinha. */
function authMessage(error: { code?: string; message: string }) {
  switch (error.code) {
    case 'same_password':
      return 'A nova senha precisa ser diferente da atual.'
    case 'weak_password':
      return 'Senha fraca demais. Misture letras, números e símbolos.'
    case 'email_exists':
    case 'email_address_invalid':
      return 'Este e-mail não pode ser usado. Confira se está certo ou se já tem outra conta.'
    case 'over_email_send_rate_limit':
      return 'Muitos e-mails enviados. Tente de novo em alguns minutos.'
    case 'insufficient_aal':
      return 'Confirme com o código do aplicativo autenticador e tente de novo.'
    case 'reauthentication_needed':
      return 'Por segurança, saia e entre de novo antes de trocar.'
    default:
      return error.message
  }
}

export function EmailSettings() {
  const { session } = useAuth()
  const current = session?.user.email ?? ''
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // com uma troca em andamento o Supabase guarda o novo endereço até a confirmação
  const pending = sentTo ?? session?.user.new_email ?? null

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.trim().toLowerCase() !== current.toLowerCase()

  const save = async () => {
    if (!supabase || !valid) return
    setBusy(true)
    const next = email.trim().toLowerCase()
    const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: appUrl('/') })
    setBusy(false)
    if (error) return void toast.error('Não foi possível trocar o e-mail', { description: authMessage(error) })
    setSentTo(next)
    setEmail('')
    toast.success('Confirme pelo e-mail', { description: `Enviamos um link de confirmação para ${next}. O e-mail de login só muda depois de abrir o link.` })
  }

  return (
    <div className="col-span-2 space-y-3">
      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-slate-400" /> E-mail de login
          </p>
          {pending && <Badge tone="amber">Aguardando confirmação</Badge>}
        </div>
        <p className="mt-1 break-all text-sm">{current || '—'}</p>
        {pending && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Falta abrir o link enviado para <strong>{pending}</strong>. Até lá, você continua entrando com {current}.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Novo e-mail" className="min-w-[14rem] flex-1">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!busy) save()
                }
              }}
              autoComplete="email"
              placeholder="voce@exemplo.com"
            />
          </Field>
          <Button type="button" size="sm" loading={busy} disabled={!valid} onClick={save}>Trocar e-mail</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">É o e-mail que você usa para entrar. O e-mail de contato que aparece nas propostas fica em Dados da empresa e não muda aqui.</p>
      </div>
    </div>
  )
}

export function PasswordSettings() {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = repeat.length > 0 && repeat !== password
  const valid = password.length >= MIN_PASSWORD && repeat === password

  const save = async () => {
    if (!supabase || !valid) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return void toast.error('Não foi possível trocar a senha', { description: authMessage(error) })
    setPassword('')
    setRepeat('')
    toast.success('Senha alterada', { description: 'Use a nova senha no próximo login.' })
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!busy) save()
    }
  }

  return (
    <div className="col-span-2 space-y-3">
      <div className="rounded-lg border p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-slate-400" /> Alterar senha
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nova senha" error={tooShort ? `Mínimo de ${MIN_PASSWORD} caracteres` : undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} autoComplete="new-password" />
          </Field>
          <Field label="Repita a nova senha" error={mismatch ? 'As senhas não são iguais' : undefined}>
            <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} onKeyDown={onEnter} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="button" size="sm" className="mt-3" loading={busy} disabled={!valid} onClick={save}>Alterar senha</Button>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Esqueceu a senha atual? Saia e use "Esqueci minha senha" na tela de login.</p>
      </div>
    </div>
  )
}
