import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { Button, Card, Field, Input } from '@/components/ui/primitives'
import type { SignatureInput } from '@/lib/proposal-share'
import { maskCpfCnpj } from '@/lib/utils'
import { SignaturePad } from './SignaturePad'

/**
 * Formulário de assinatura das páginas públicas (proposta e contrato): nome,
 * CPF/CNPJ, assinatura desenhada e o "li e concordo".
 */
export function SignForm({
  title,
  intro,
  agreement,
  submitLabel,
  onSign,
}: {
  title: string
  intro: string
  /** Texto do "li e concordo". */
  agreement: string
  submitLabel: string
  onSign: (input: SignatureInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [document_, setDocument] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const digits = document_.replace(/\D/g, '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 3) return setError('Informe o nome completo de quem assina.')
    if (digits.length !== 11 && digits.length !== 14) return setError('Informe um CPF ou CNPJ completo.')
    if (!signature) return setError('Desenhe a sua assinatura no quadro.')
    if (!agreed) return setError('Marque que leu e concorda antes de assinar.')
    setError(null)
    setSending(true)
    try {
      await onSign({ name: name.trim(), document: digits, signature })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a assinatura.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="no-print p-5">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <PenLine className="h-4 w-4" /> {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{intro}</p>
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
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked)
              setError(null)
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600"
          />
          {agreement}
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
            <PenLine className="h-4 w-4" /> {submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  )
}
