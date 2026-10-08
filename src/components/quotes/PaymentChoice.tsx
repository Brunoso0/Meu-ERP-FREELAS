import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { create } from 'zustand'
import { Button, Input } from '@/components/ui/primitives'
import { DEFAULT_DEPOSIT_PCT, depositAmount } from '@/lib/quote-finance'
import { cn, formatCurrency } from '@/lib/utils'

interface Request {
  title: string
  total: number
  resolve: (depositPct: number | null | undefined) => void
}

const useChoice = create<{ request: Request | null; open: boolean }>(() => ({ request: null, open: false }))

function settle(value: number | null | undefined) {
  const { request, open } = useChoice.getState()
  if (!open) return
  useChoice.setState({ open: false })
  request?.resolve(value)
}

/**
 * Pergunta como o cliente vai pagar: `null` = valor integral, um número =
 * percentual de entrada (o resto fica como saldo), `undefined` = cancelou.
 */
export function choosePayment(title: string, total: number): Promise<number | null | undefined> {
  settle(undefined)
  return new Promise((resolve) => useChoice.setState({ request: { title, total, resolve }, open: true }))
}

/** Montado uma vez no layout, ao lado do ConfirmDialog. */
export function PaymentChoiceDialog() {
  const { request, open } = useChoice()
  const [mode, setMode] = useState<'full' | 'deposit'>('full')
  const [pct, setPct] = useState(String(DEFAULT_DEPOSIT_PCT))

  const total = request?.total ?? 0
  const pctNumber = Number(pct)
  const validPct = Number.isInteger(pctNumber) && pctNumber >= 1 && pctNumber <= 99
  const deposit = validPct ? depositAmount(total, pctNumber) : 0

  const option = (value: 'full' | 'deposit', label: string, detail: string) => (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        mode === value ? 'border-brand-600 bg-brand-50/60 dark:bg-brand-600/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
      )}
    >
      <input type="radio" name="payment-mode" className="mt-1 accent-brand-600" checked={mode === value} onChange={() => setMode(value)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
    </label>
  )

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(undefined)
        else {
          setMode('full')
          setPct(String(DEFAULT_DEPOSIT_PCT))
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            setMode('full')
            setPct(String(DEFAULT_DEPOSIT_PCT))
          }}
          className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-xl border bg-white p-5 shadow-2xl focus:outline-none dark:bg-slate-900"
        >
          <Dialog.Title className="text-base font-semibold">Como o cliente vai pagar?</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {request?.title} · {formatCurrency(total)}. O orçamento é criado aguardando pagamento e já entra no financeiro.
          </Dialog.Description>

          <div className="mt-4 space-y-2">
            {option('full', 'Valor integral', `Um pagamento de ${formatCurrency(total)}.`)}
            {option('deposit', 'Entrada + saldo', validPct ? `${formatCurrency(deposit)} agora e ${formatCurrency(total - deposit)} depois.` : 'Informe o percentual da entrada.')}
            {mode === 'deposit' && (
              <label className="ml-7 flex items-center gap-2 text-sm">
                Entrada de
                <Input type="number" min={1} max={99} step={1} value={pct} onChange={(e) => setPct(e.target.value)} className="w-20" aria-label="Percentual da entrada" />
                %
              </label>
            )}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => settle(undefined)}>
              Cancelar
            </Button>
            <Button disabled={mode === 'deposit' && !validPct} onClick={() => settle(mode === 'full' ? null : pctNumber)}>
              Aprovar e gerar orçamento
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
