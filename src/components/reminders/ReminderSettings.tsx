import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Bell, BellOff, Send, Smartphone } from 'lucide-react'
import { Badge, Button } from '@/components/ui/primitives'
import { disablePush, enablePush, pushState, sendTestReminder, type PushState } from '@/lib/reminders'

const states: Record<PushState, { label: string; tone: 'green' | 'slate' | 'amber' | 'red'; hint: string }> = {
  on: { label: 'Ativadas', tone: 'green', hint: 'Este aparelho recebe o lembrete no horário escolhido.' },
  off: { label: 'Desligadas', tone: 'slate', hint: 'Ative para receber o lembrete como notificação neste aparelho.' },
  denied: { label: 'Bloqueadas', tone: 'red', hint: 'As notificações deste site estão bloqueadas. Libere nas configurações do navegador (ou do app instalado) e volte aqui.' },
  'needs-install': { label: 'Instale o app', tone: 'amber', hint: 'No iPhone, as notificações só funcionam com o app na tela de início: toque em Compartilhar → Adicionar à Tela de Início e abra por lá.' },
  unsupported: { label: 'Indisponível', tone: 'amber', hint: 'Este navegador não recebe notificações do site. No celular, use o app instalado (Chrome no Android, ou Safari no iPhone com o app na tela de início).' },
}

/**
 * Notificações deste aparelho e o teste do lembrete, no perfil. Cada
 * aparelho (celular, computador) é ativado nele mesmo.
 */
export function ReminderSettings({ email }: { email: string }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState<'push' | 'test' | null>(null)

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'))
  }, [])

  const toggle = async () => {
    setBusy('push')
    try {
      const next = state === 'on' ? await disablePush() : await enablePush()
      setState(next)
      if (next === 'on') toast.success('Notificações ativadas neste aparelho')
      else if (next === 'denied') toast.error('Notificações bloqueadas', { description: states.denied.hint })
      else if (state === 'on') toast.success('Notificações desligadas neste aparelho')
    } catch (error) {
      toast.error('Não foi possível ativar as notificações', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      const r = await sendTestReminder()
      const lines = [
        `${r.summary}.`,
        r.emailTo ? `E-mail para ${r.emailTo}: ${r.email}.` : `E-mail: ${r.email}.`,
        r.push ? (r.push.sent ? `Notificação enviada para ${r.push.sent} aparelho${r.push.sent === 1 ? '' : 's'}.` : 'Nenhum aparelho com notificações ativadas.') : 'Notificações desligadas no perfil.',
      ]
      const failed = r.email !== 'enviado' && r.email !== 'desligado' && !r.email.startsWith('não enviado')
      ;(failed ? toast.warning : toast.success)('Lembrete de teste', { description: lines.join(' '), duration: 12000 })
    } catch (error) {
      toast.error('Não foi possível enviar o teste', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  const s = state ? states[state] : null
  const canToggle = state === 'on' || state === 'off'

  return (
    <div className="col-span-2 space-y-3">
      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Smartphone className="h-4 w-4 text-slate-400" /> Notificações neste aparelho
          </p>
          {s && <Badge tone={s.tone}>{s.label}</Badge>}
        </div>
        {s && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.hint}</p>}
        {canToggle && (
          <Button type="button" variant={state === 'on' ? 'secondary' : 'primary'} size="sm" className="mt-3" loading={busy === 'push'} onClick={toggle}>
            {state === 'on' ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {state === 'on' ? 'Desligar neste aparelho' : 'Ativar neste aparelho'}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">O e-mail vai para {email ? <strong>{email}</strong> : 'o e-mail de contato acima (ou o do login)'}. Dia sem demanda, nada é enviado.</p>
        <Button type="button" variant="secondary" size="sm" loading={busy === 'test'} onClick={test}>
          <Send className="h-3.5 w-3.5" /> Enviar um lembrete de teste agora
        </Button>
      </div>
    </div>
  )
}
