import { useRef } from 'react'
import { toast } from 'sonner'
import { Eye, FileText, Paperclip } from 'lucide-react'
import { useUpdate } from '@/hooks/useData'
import { resolveProofUrl, uploadProof } from '@/lib/db'
import { nfseStatus } from '@/lib/nfse'
import { cn } from '@/lib/utils'
import type { FinancialTransaction } from '@/types/database.types'

/** Arquivos que um lançamento pode guardar: o comprovante do pagamento e a nota fiscal emitida. */
export type Attachment = 'proof_url' | 'invoice_url'
const attachments: Record<Attachment, { noun: string; accept: string; types: RegExp; formats: string; attached: string }> = {
  proof_url: { noun: 'O comprovante', accept: 'image/png,image/jpeg,image/webp,application/pdf', types: /^image\/(png|jpe?g|webp)$|^application\/pdf$/, formats: 'PNG, JPG, WEBP ou PDF', attached: 'Comprovante anexado' },
  invoice_url: { noun: 'A nota fiscal', accept: 'application/pdf', types: /^application\/pdf$/, formats: 'PDF', attached: 'Nota fiscal anexada' },
}

/**
 * Anexar e abrir o comprovante e a nota fiscal de um lançamento. Renderize
 * `input` uma vez na página; `pick` abre o seletor de arquivo para o
 * lançamento e `view` abre o arquivo guardado.
 */
export function useTransactionFiles() {
  const update = useUpdate('financial_transactions')
  const fileInput = useRef<HTMLInputElement>(null)
  const target = useRef<{ id: string; field: Attachment } | null>(null)

  const pick = (id: string, field: Attachment) => {
    target.current = { id, field }
    if (fileInput.current) {
      fileInput.current.accept = attachments[field].accept
      fileInput.current.click()
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const current = target.current
    e.target.value = ''
    if (!file || !current) return
    const kind = attachments[current.field]
    // o `accept` do input é só sugestão do navegador; a checagem de verdade é esta
    if (!kind.types.test(file.type)) {
      toast.error('Formato não aceito', { description: `${kind.noun} precisa estar em ${kind.formats}.` })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande', { description: `${kind.noun} pode ter até 5 MB.` })
      return
    }
    try {
      const path = await uploadProof(file)
      await update.mutateAsync({ id: current.id, patch: { [current.field]: path } })
      toast.success(kind.attached)
    } catch (error) {
      toast.error('Não foi possível anexar', { description: error instanceof Error ? error.message : undefined })
    }
  }

  const view = async (path: string | null | undefined) => {
    if (!path) return
    try {
      const url = await resolveProofUrl(path)
      if (url.startsWith('data:')) {
        // navegadores bloqueiam abrir data: direto na barra; mostra dentro de uma página em branco
        const win = window.open('')
        win?.document.write(`<iframe src="${url}" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe>`)
      } else window.open(url, '_blank', 'noopener')
    } catch (error) {
      toast.error('Não foi possível abrir o arquivo', { description: error instanceof Error ? error.message : undefined })
    }
  }

  const input = <input ref={fileInput} type="file" className="hidden" onChange={onFile} aria-label="Arquivo do lançamento" />
  return { pick, view, input }
}

type Files = ReturnType<typeof useTransactionFiles>
const linkClass = 'inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400'
const attachClass = 'inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'

/** Célula do comprovante: "Ver" quando já tem, "Anexar" quando não. */
export function ProofCell({ t, files }: { t: Pick<FinancialTransaction, 'id' | 'proof_url'>; files: Files }) {
  return t.proof_url ? (
    <button type="button" onClick={() => files.view(t.proof_url)} className={linkClass}>
      <Eye className="h-3.5 w-3.5" /> Ver
    </button>
  ) : (
    <button type="button" onClick={() => files.pick(t.id, 'proof_url')} className={attachClass}>
      <Paperclip className="h-3.5 w-3.5" /> Anexar
    </button>
  )
}

/** Célula da nota fiscal: situação da NFS-e em andamento, o PDF, ou "Anexar". */
export function InvoiceCell({ t, files }: { t: Pick<FinancialTransaction, 'id' | 'invoice_url' | 'nfse_status' | 'nfse_number' | 'nfse_error'>; files: Files }) {
  if (t.nfse_status && t.nfse_status !== 'AUTHORIZED' && t.nfse_status !== 'CANCELED') {
    return (
      <span className={cn('text-xs font-medium', t.nfse_status === 'ERROR' || t.nfse_status === 'CANCELLATION_DENIED' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')} title={t.nfse_error ?? undefined}>
        {nfseStatus[t.nfse_status]?.label ?? t.nfse_status}
      </span>
    )
  }
  return t.invoice_url ? (
    <button type="button" onClick={() => files.view(t.invoice_url)} className={linkClass}>
      <FileText className="h-3.5 w-3.5" /> {t.nfse_number ? `nº ${t.nfse_number}` : 'Ver'}
    </button>
  ) : (
    <button type="button" onClick={() => files.pick(t.id, 'invoice_url')} className={attachClass}>
      <Paperclip className="h-3.5 w-3.5" /> Anexar
    </button>
  )
}
