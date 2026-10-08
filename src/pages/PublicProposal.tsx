import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileQuestion, Loader2, PenLine, Printer } from 'lucide-react'
import { PrintPortal } from '@/components/proposals/PrintPortal'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { SignaturePad } from '@/components/proposals/SignaturePad'
import { Button, Card, EmptyState, Field, Input } from '@/components/ui/primitives'
import { buildProposalDoc } from '@/lib/proposal'
import { getSharedProposal, signSharedProposal } from '@/lib/proposal-share'
import { formatDate, maskCpfCnpj } from '@/lib/utils'
import type { Client, Profile } from '@/types/database.types'

/**
 * Página que o cliente abre pelo link de assinatura. Não exige login e só
 * conhece a proposta do link: lê o documento e, enquanto ela aguarda
 * assinatura, registra o aceite com nome, CPF/CNPJ e a assinatura desenhada.
 */
export default function PublicProposal() {
  const { token = '' } = useParams()
  const qc = useQueryClient()
  const shared = useQuery({ queryKey: ['shared-proposal', token], queryFn: () => getSharedProposal(token), retry: 1 })
  const [name, setName] = useState('')
  const [document_, setDocument] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  if (shared.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (shared.isError || !shared.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <EmptyState
          icon={FileQuestion}
          title={shared.isError ? 'Não foi possível abrir a proposta' : 'Link indisponível'}
          description={shared.isError ? 'Verifique sua conexão e recarregue a página.' : 'Este link de assinatura não existe ou não está mais ativo. Peça um novo link a quem enviou a proposta.'}
        />
      </div>
    )
  }

  const { proposal, issuer, client } = shared.data
  const doc = buildProposalDoc(proposal, (client ?? undefined) as Client | undefined, (issuer ?? undefined) as Profile | undefined)
  const signed = !!proposal.signed_at
  const digits = document_.replace(/\D/g, '')

  const sign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 3) return setError('Informe o nome completo de quem assina.')
    if (digits.length !== 11 && digits.length !== 14) return setError('Informe um CPF ou CNPJ completo.')
    if (!signature) return setError('Desenhe a sua assinatura no quadro.')
    if (!agreed) return setError('Marque que leu e concorda com a proposta.')
    setError(null)
    setSending(true)
    try {
      await signSharedProposal(token, { name: name.trim(), document: digits, signature })
      await qc.invalidateQueries({ queryKey: ['shared-proposal', token] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a assinatura.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 dark:bg-slate-950">
      <div className="mx-auto max-w-[794px] space-y-4">
        <header className="no-print flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{doc.issuer.name}</p>
            <h1 className="text-xl font-semibold tracking-tight">Proposta {doc.number}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{doc.title}</p>
          </div>
          <Button variant="secondary" onClick={() => document.fonts.ready.then(() => window.print())}>
            <Printer className="h-4 w-4" /> Salvar em PDF / Imprimir
          </Button>
        </header>

        {signed && (
          <Card className="no-print flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-sm">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">Proposta assinada</p>
              <p className="text-emerald-800 dark:text-emerald-300">
                {proposal.signer_name ? `Por ${proposal.signer_name}, em ` : 'Em '}
                {formatDate(proposal.signed_at, "dd/MM/yyyy 'às' HH:mm")}. Guarde uma cópia: use o botão de salvar em PDF acima.
              </p>
            </div>
          </Card>
        )}

        <ProposalDocument doc={doc} />
        <PrintPortal>
          <ProposalDocument doc={doc} />
        </PrintPortal>

        {!signed && (
          <Card className="no-print p-5">
            <form onSubmit={sign} className="space-y-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <PenLine className="h-4 w-4" /> Assinar a proposta
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Leia a proposta acima. Ao assinar, você declara que concorda com o escopo, os prazos e os valores descritos.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome completo de quem assina">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
                </Field>
                <Field label="CPF ou CNPJ">
                  <Input value={document_} onChange={(e) => setDocument(maskCpfCnpj(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
                </Field>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Assinatura</span>
                <SignaturePad onChange={setSignature} />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={agreed} onChange={(e) => {
                    setAgreed(e.target.checked)
                    setError(null)
                  }} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600" />
                Li e concordo com a proposta {doc.number}, emitida por {doc.issuer.name}.
              </label>
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
                  Ficam registrados o nome, o CPF/CNPJ, a assinatura, a data e a hora e o endereço de internet (IP) de quem assinou.
                </p>
                <Button type="submit" loading={sending}>
                  <PenLine className="h-4 w-4" /> Assinar proposta
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}
