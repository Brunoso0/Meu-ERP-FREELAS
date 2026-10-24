import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Fingerprint } from 'lucide-react'
import { Button, Card, Field, Input } from '@/components/ui/primitives'
import { supabase } from '@/lib/supabase'
import { biometricAvailable, biometricDevice, enableBiometric, isBiometricCancel, markActive, signInWithBiometric, takeExpiredNotice } from '@/lib/session'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo de 6 caracteres'),
})
type Values = z.infer<typeof schema>

/** Sistema de uso individual: só login. Contas são criadas no painel do Supabase. */
export default function Login() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: biometricDevice()?.email ?? '' } })
  const device = biometricDevice()
  const [biometricBusy, setBiometricBusy] = useState(false)
  const asked = useRef(false)

  useEffect(() => {
    if (takeExpiredNotice()) toast.info('Sua sessão expirou', { description: device ? 'Entre de novo com a biometria ou com a sua senha.' : 'Entre de novo com a sua senha.' })
  }, [])

  const biometric = async () => {
    asked.current = true
    setBiometricBusy(true)
    try {
      await signInWithBiometric()
    } catch (error) {
      if (!isBiometricCancel(error)) toast.error('Não foi possível entrar com a biometria', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBiometricBusy(false)
    }
  }

  // com a biometria ativada neste aparelho, tocar no e-mail já pede a digital/rosto (uma vez);
  // cancelando, segue o login normal com e-mail e senha
  const onEmailFocus = () => {
    if (device && !asked.current && !biometricBusy) void biometric()
  }

  const submit = handleSubmit(async (values) => {
    if (!supabase) return
    markActive()
    const { data, error } = await supabase.auth.signInWithPassword(values)
    if (error) return void toast.error('Não foi possível entrar', { description: error.message })
    // oferece a biometria uma vez por login, só onde o aparelho tem digital/rosto e ainda não foi ativada
    const user = data.user
    if (user && !biometricDevice() && (await biometricAvailable())) {
      toast('Entrar com biometria?', {
        description: 'Use a digital ou o rosto deste aparelho para abrir o app, sem digitar a senha.',
        duration: 15000,
        action: {
          label: 'Ativar',
          onClick: () =>
            enableBiometric({ id: user.id, email: user.email })
              .then(() => toast.success('Biometria ativada neste aparelho'))
              .catch((e) => !isBiometricCancel(e) && toast.error('Não foi possível ativar a biometria', { description: e instanceof Error ? e.message : undefined })),
        },
      })
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">F</span>
          <span className="text-sm font-semibold tracking-tight">Meu ERP Freelas</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Entrar</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acesse seus projetos, demandas e finanças.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="E-mail" error={errors.email?.message}>
            <Input type="email" autoComplete="username" onFocus={onEmailFocus} {...register('email')} />
          </Field>
          <Field label="Senha" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>
          <Button type="submit" loading={isSubmitting} disabled={biometricBusy} className="w-full">
            Entrar
          </Button>
          {device && (
            <Button type="button" variant="secondary" loading={biometricBusy} onClick={biometric} className="w-full">
              <Fingerprint className="h-4 w-4" /> Entrar com biometria
            </Button>
          )}
        </form>
      </Card>
    </div>
  )
}
