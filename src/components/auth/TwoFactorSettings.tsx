import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download, KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { Badge, Button, Input } from '@/components/ui/primitives'
import { confirm } from '@/components/ui/confirm'
import { activeFactor, cancelEnrollment, disableTwoFactor, generateRecoveryCodes, recoveryCodesLeft, startEnrollment, verifyCode, type Enrollment } from '@/lib/mfa'

type Step = 'loading' | 'off' | 'enrolling' | 'on'

/** Verificação em duas etapas: liga com o app autenticador, mostra os códigos de recuperação uma única vez. */
export function TwoFactorSettings() {
  const [step, setStep] = useState<Step>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const factor = await activeFactor()
      setFactorId(factor?.id ?? null)
      setStep(factor ? 'on' : 'off')
      setLeft(factor ? await recoveryCodesLeft().catch(() => null) : null)
    } catch {
      setStep('off')
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const run = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      toast.error(fail, { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const begin = () =>
    run(async () => {
      setEnrollment(await startEnrollment())
      setCode('')
      setStep('enrolling')
    }, 'Não foi possível começar a ativação')

  const abandon = async () => {
    if (enrollment) await cancelEnrollment(enrollment.factorId).catch(() => undefined)
    setEnrollment(null)
    setStep('off')
  }

  const confirmCode = () =>
    run(async () => {
      if (!enrollment) return
      await verifyCode(enrollment.factorId, code)
      setCodes(await generateRecoveryCodes())
      setEnrollment(null)
      setFactorId(enrollment.factorId)
      setLeft(8)
      setStep('on')
      toast.success('Verificação em duas etapas ativada')
    }, 'Código não confere')

  const newCodes = async () => {
    if (!(await confirm({ title: 'Gerar novos códigos?', description: 'Os códigos anteriores deixam de valer.', confirmLabel: 'Gerar novos', tone: 'default' }))) return
    run(async () => {
      setCodes(await generateRecoveryCodes())
      setLeft(8)
    }, 'Não foi possível gerar os códigos')
  }

  const disable = async () => {
    if (!factorId) return
    if (!(await confirm({ title: 'Desativar a verificação em duas etapas?', description: 'O acesso volta a pedir só e-mail e senha. Os códigos de recuperação deixam de ter uso.', confirmLabel: 'Desativar' }))) return
    run(async () => {
      await disableTwoFactor(factorId)
      setFactorId(null)
      setCodes(null)
      setLeft(null)
      setStep('off')
      toast.success('Verificação em duas etapas desativada')
    }, 'Não foi possível desativar')
  }

  const copy = async () => {
    if (!codes) return
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast.success('Códigos copiados')
    } catch {
      toast.error('Não foi possível copiar', { description: 'Selecione os códigos e copie à mão.' })
    }
  }

  const download = () => {
    if (!codes) return
    const text = `Krono — códigos de recuperação\nCada código vale uma vez. Guarde em lugar seguro.\n\n${codes.join('\n')}\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'krono-codigos-de-recuperacao.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (step === 'loading') return <p className="col-span-2 text-sm text-slate-500">Carregando…</p>

  return (
    <div className="col-span-2 space-y-3">
      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Smartphone className="h-4 w-4 text-slate-400" /> Aplicativo autenticador
          </p>
          <Badge tone={step === 'on' ? 'green' : 'slate'}>{step === 'on' ? 'Ativada' : step === 'enrolling' ? 'Configurando' : 'Desligada'}</Badge>
        </div>

        {step === 'off' && (
          <>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Além da senha, o acesso passa a pedir um código de 6 dígitos que muda a cada 30 segundos, gerado no seu celular (Google Authenticator, Microsoft Authenticator, Authy…). Mesmo com a senha vazada, ninguém entra sem o seu celular.
            </p>
            <Button type="button" size="sm" className="mt-3" loading={busy} onClick={begin}>
              <ShieldCheck className="h-3.5 w-3.5" /> Ativar verificação em duas etapas
            </Button>
          </>
        )}

        {step === 'enrolling' && enrollment && (
          <div className="mt-3 space-y-3">
            <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
              <li>Abra o aplicativo autenticador no celular e escolha adicionar conta.</li>
              <li>Leia o QR Code abaixo (ou digite a chave).</li>
              <li>Digite aqui o código de 6 dígitos que o aplicativo mostrar.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              <img src={enrollment.qrCode} alt="QR Code para o aplicativo autenticador" className="h-40 w-40 rounded-lg border bg-white p-2" />
              <div className="min-w-0 text-xs">
                <p className="text-slate-500">Não consegue ler o QR Code? Digite esta chave:</p>
                <p className="mt-1 break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-sm tracking-wider dark:bg-slate-800">{enrollment.secret}</p>
              </div>
            </div>
            {/* sem <form>: este bloco já mora dentro do formulário de Minha empresa e o Enter não pode salvar a empresa */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (code.length === 6 && !busy) confirmCode()
                  }
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                aria-label="Código de 6 dígitos"
                className="w-32 text-center font-mono tracking-widest"
              />
              <Button type="button" size="sm" loading={busy} disabled={code.length !== 6} onClick={confirmCode}>Confirmar e ativar</Button>
              <Button type="button" size="sm" variant="ghost" onClick={abandon} disabled={busy}>Cancelar</Button>
            </div>
          </div>
        )}

        {step === 'on' && (
          <>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ao entrar, o app pede o código do aplicativo autenticador.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" loading={busy} onClick={newCodes}>
                <KeyRound className="h-3.5 w-3.5" /> Gerar novos códigos de recuperação
              </Button>
              <Button type="button" size="sm" variant="secondary" loading={busy} onClick={disable}>
                <ShieldOff className="h-3.5 w-3.5" /> Desativar
              </Button>
            </div>
          </>
        )}
      </div>

      {step === 'on' && codes && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Guarde estes códigos de recuperação agora</p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Se você perder o celular, cada código deixa você entrar uma vez. Eles não aparecem de novo. Guarde num gerenciador de senhas ou imprima.</p>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm">
            {codes.map((c) => (
              <li key={c} className="rounded bg-white px-2 py-1 text-center tracking-wider dark:bg-slate-900">{c}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={download}>
              <Download className="h-3.5 w-3.5" /> Baixar .txt
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCodes(null)}>Já guardei</Button>
          </div>
        </div>
      )}

      {step === 'on' && !codes && left !== null && (
        <p className={left <= 2 ? 'text-xs font-medium text-amber-700 dark:text-amber-400' : 'text-xs text-slate-500 dark:text-slate-400'}>
          {left === 0 ? 'Você não tem mais códigos de recuperação. Gere novos para não ficar sem acesso se perder o celular.' : `Códigos de recuperação restantes: ${left}.`}
        </p>
      )}
    </div>
  )
}
