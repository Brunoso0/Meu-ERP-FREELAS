import * as Dialog from '@radix-ui/react-dialog'
import { create } from 'zustand'
import { AlertTriangle } from 'lucide-react'
import { Button } from './primitives'

export interface ConfirmOptions {
  title: string
  /** Consequência da ação, em uma ou duas frases. */
  description?: string
  /** Texto do botão que confirma. Padrão: "Excluir". */
  confirmLabel?: string
  cancelLabel?: string
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  open: boolean
}

const useConfirm = create<ConfirmState>(() => ({ request: null, open: false }))

function settle(ok: boolean) {
  const { request, open } = useConfirm.getState()
  if (!open) return
  // mantém o texto durante a animação de saída; só o `open` muda
  useConfirm.setState({ open: false })
  request?.resolve(ok)
}

/**
 * Pede confirmação em um modal do próprio app, no lugar do `window.confirm`
 * do navegador. Resolve `true` se a pessoa confirmar e `false` se cancelar,
 * fechar ou apertar Esc.
 *
 *   if (!(await confirm({ title: 'Excluir o orçamento #ORC-0001?' }))) return
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  // um pedido novo com outro ainda aberto cancela o anterior
  settle(false)
  return new Promise((resolve) => useConfirm.setState({ request: { ...options, resolve }, open: true }))
}

/** Montado uma vez no layout; quem pede a confirmação usa a função `confirm`. */
export function ConfirmDialog() {
  const { request, open } = useConfirm()

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && settle(false)}>
      <Dialog.Portal>
        {/* acima dos formulários laterais (z-50), que também abrem confirmações */}
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-xl border bg-white p-5 shadow-2xl focus:outline-none dark:bg-slate-900"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 pt-0.5">
              <Dialog.Title className="break-words text-base font-semibold">{request?.title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {request?.description ?? 'Esta ação não pode ser desfeita.'}
              </Dialog.Description>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => settle(false)}>
              {request?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant="danger" onClick={() => settle(true)}>
              {request?.confirmLabel ?? 'Excluir'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
