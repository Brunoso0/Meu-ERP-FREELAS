import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Field, Input, Select } from '@/components/ui/primitives'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { planCatalog } from '@/lib/plan'
import { startCheckout, type BillingMethod } from '@/lib/subscription'
import { formatCurrency, maskCpfCnpj } from '@/lib/utils'

/** Contratar (ou trocar) o plano: forma de pagamento, CPF/CNPJ e, no Profissional, pessoas extras. */
export function PlanCheckout({ plan, open, onClose }: { plan: 'essential' | 'pro' | null; open: boolean; onClose: () => void }) {
  const { workspace } = useActiveWorkspace()
  const qc = useQueryClient()
  const [method, setMethod] = useState<BillingMethod>('PIX')
  const [document, setDocument] = useState('')
  const [extra, setExtra] = useState('0')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setMethod(workspace?.billing_method ?? 'PIX')
      setDocument(workspace?.document ? maskCpfCnpj(workspace.document) : '')
      setExtra(String(workspace?.extra_members ?? 0))
    }
  }, [open, workspace?.document, workspace?.extra_members, workspace?.billing_method])

  const info = planCatalog.find((p) => p.id === plan)
  if (!info || !workspace) return null
  const extraCount = plan === 'pro' ? Math.min(Math.max(Math.trunc(Number(extra) || 0), 0), 20) : 0
  const total = info.price + extraCount * 10
  const digits = document.replace(/\D/g, '')
  const valid = digits.length === 11 || digits.length === 14

  async function go() {
    if (!plan || !workspace) return
    setBusy(true)
    try {
      const result = await startCheckout(workspace.id, { plan, billingType: method, document: digits, extraMembers: extraCount })
      await qc.invalidateQueries({ queryKey: ['plan-usage'] })
      if (result.changed) {
        toast.success('Plano atualizado', { description: 'O novo valor vale a partir da próxima fatura.' })
      } else if (result.url) {
        window.open(result.url, '_blank', 'noopener')
        toast.success('Fatura gerada', { description: 'Pague na página que abriu. Ao voltar para cá, o plano é atualizado sozinho.' })
      } else {
        toast.info('Assinatura criada', { description: 'A fatura aparece em instantes. Reabra esta tela para pagar.' })
      }
      onClose()
    } catch (error) {
      toast.error('Não foi possível contratar', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-xl border bg-white p-5 shadow-2xl focus:outline-none dark:bg-slate-900">
          <Dialog.Title className="text-base font-semibold">Assinar o plano {info.name}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {formatCurrency(total)} por mês, renovado todo mês. Você pode cancelar quando quiser e o plano vale até o fim do período pago.
          </Dialog.Description>

          <div className="mt-4 space-y-4">
            <Field label="Forma de pagamento">
              <Select value={method} onChange={(e) => setMethod(e.target.value as BillingMethod)}>
                <option value="PIX">Pix</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
              </Select>
            </Field>
            <Field label="CPF ou CNPJ (vai na cobrança)">
              <Input inputMode="numeric" value={document} onChange={(e) => setDocument(maskCpfCnpj(e.target.value))} />
            </Field>
            {plan === 'pro' && (
              <Field label="Pessoas extras (R$ 10 por mês cada)">
                <Input type="number" min={0} max={20} value={extra} onChange={(e) => setExtra(e.target.value)} />
              </Field>
            )}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button onClick={go} loading={busy} disabled={!valid}>Gerar fatura</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
