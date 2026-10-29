import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CreditCard, FileText, Lock, QrCode } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { cardLink, setBillingMethod, type BillingMethod } from '@/lib/subscription'
import { usePlan } from '@/lib/plan'
import { cn } from '@/lib/utils'

const methods: { id: BillingMethod; label: string; hint: string; icon: typeof QrCode }[] = [
  { id: 'PIX', label: 'Pix', hint: 'Todo mês chega a fatura com o código Pix.', icon: QrCode },
  { id: 'BOLETO', label: 'Boleto', hint: 'Todo mês chega a fatura com o boleto.', icon: FileText },
  { id: 'CREDIT_CARD', label: 'Cartão de crédito', hint: 'Cobrado sozinho todo mês, sem você precisar lembrar.', icon: CreditCard },
]

const brandLabel = (brand: string | null) => (brand ? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase() : 'Cartão')

/**
 * Como o plano é pago todo mês. O cartão é digitado na página do Asaas, que o guarda e
 * cobra; o Krono só mostra a bandeira e os 4 últimos dígitos e nunca vê o número.
 */
export function PaymentMethods() {
  const { workspace, role } = useActiveWorkspace()
  const { usage } = usePlan()
  const qc = useQueryClient()
  const [choice, setChoice] = useState<BillingMethod | null>(null)
  const [busy, setBusy] = useState(false)
  if (!workspace) return null

  const isOwner = role === 'owner'
  const saved: BillingMethod = workspace.billing_method ?? 'PIX'
  const selected = choice ?? saved
  const dirty = selected !== saved
  const hasCard = !!workspace.card_last4

  async function save() {
    if (!workspace) return
    setBusy(true)
    try {
      const result = await setBillingMethod(workspace.id, selected)
      await qc.invalidateQueries({ queryKey: ['my-workspaces'] })
      setChoice(null)
      if (selected === 'CREDIT_CARD' && result.url) {
        window.open(result.url, '_blank', 'noopener')
        toast.success('Forma de pagamento salva', { description: 'Cadastre o cartão na página do Asaas que abriu.' })
      } else {
        toast.success('Forma de pagamento salva', { description: selected === 'CREDIT_CARD' ? 'O cartão é pedido na próxima fatura.' : 'Vale a partir da próxima fatura.' })
      }
    } catch (error) {
      toast.error('Não foi possível salvar', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function openCard() {
    if (!workspace) return
    setBusy(true)
    try {
      const { url } = await cardLink(workspace.id)
      if (url) window.open(url, '_blank', 'noopener')
      else toast.info('A próxima fatura ainda não saiu', { description: 'Assim que ela for gerada, o cartão é pedido nela. Você também recebe o link por e-mail.' })
    } catch (error) {
      toast.error('Não foi possível abrir', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Formas de pagamento</h2>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Como você paga o plano todo mês.</p>

      <div role="radiogroup" aria-label="Forma de pagamento do plano" className="mt-4 grid gap-3 sm:grid-cols-3">
        {methods.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected === id}
            disabled={!isOwner}
            onClick={() => setChoice(id)}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              selected === id ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30 dark:bg-brand-600/10' : 'hover:border-brand-400',
            )}
          >
            <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <span className="text-sm font-semibold">{label}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
          </button>
        ))}
      </div>

      {selected === 'CREDIT_CARD' && (
        <div className="mt-4 rounded-lg border p-4">
          <p className="text-sm font-medium">
            {hasCard ? `${brandLabel(workspace.card_brand)} com final ${workspace.card_last4}` : 'Nenhum cartão cadastrado ainda'}
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            O número do cartão é digitado na página segura do Asaas, que o guarda e faz a cobrança todo mês. O Krono nunca vê nem guarda o número, a validade ou o código do cartão.
          </p>
          {isOwner && !dirty && usage?.has_subscription && (
            <Button className="mt-3" size="sm" variant="secondary" onClick={openCard} loading={busy}>
              {hasCard ? 'Trocar cartão' : 'Cadastrar cartão'}
            </Button>
          )}
        </div>
      )}

      {isOwner ? (
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={busy} disabled={!dirty}>Salvar forma de pagamento</Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Só o dono do workspace altera a forma de pagamento.</p>
      )}
    </Card>
  )
}
