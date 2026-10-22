import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { create } from 'zustand'
import { Button, Field, Input } from '@/components/ui/primitives'
import { formatCurrency, formatDate, isoDay } from '@/lib/utils'

interface Request {
  title: string
  amount: number
  /** Vencimento sugerido (o do financeiro, ou um novo quando aquele já passou). */
  suggested: string
  /** Vencimento que está no financeiro hoje, para avisar quando já passou. */
  current: string
  resolve: (due: string | null) => void
}

const useBalanceDue = create<{ request: Request | null; open: boolean }>(() => ({ request: null, open: false }))

function settle(value: string | null) {
  const { request, open } = useBalanceDue.getState()
  if (!open) return
  useBalanceDue.setState({ open: false })
  request?.resolve(value)
}

/**
 * Pergunta o vencimento do saldo antes de gerar o orçamento da parte 2.
 * Resolve a data escolhida (AAAA-MM-DD) ou `null` se cancelou.
 */
export function chooseBalanceDue(options: Omit<Request, 'resolve'>): Promise<string | null> {
  settle(null)
  return new Promise((resolve) => useBalanceDue.setState({ request: { ...options, resolve }, open: true }))
}

/** Montado uma vez no layout, ao lado do ConfirmDialog. */
export function BalanceDueDialog() {
  const { request, open } = useBalanceDue()
  const [due, setDue] = useState('')
  const today = isoDay(new Date())
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(due) && due >= today
  const overdue = !!request && request.current < today

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && settle(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Content
          onOpenAutoFocus={() => setDue(useBalanceDue.getState().request?.suggested ?? today)}
          className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-xl border bg-white p-5 shadow-2xl focus:outline-none dark:bg-slate-900"
        >
          <Dialog.Title className="text-base font-semibold">Orçamento do saldo</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {request?.title} · saldo de {formatCurrency(request?.amount ?? 0)}. O documento sai com a data de hoje e o vencimento abaixo, mostrando a entrada já paga.
          </Dialog.Description>

          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) settle(due)
            }}
          >
            <Field label="Vencimento do saldo" error={due && !valid ? 'Escolha hoje ou uma data futura' : undefined}>
              <Input type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            {overdue && request && (
              <p className="-mt-2 text-xs text-amber-700 dark:text-amber-300">O vencimento anterior era {formatDate(request.current)} e já passou.</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">A data também muda no Financeiro.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => settle(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!valid}>
                Gerar orçamento do saldo
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
