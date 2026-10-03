import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button, Card, Field, Input } from '@/components/ui/primitives'
import { supabase } from '@/lib/supabase'

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
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const submit = handleSubmit(async (values) => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) toast.error('Não foi possível entrar', { description: error.message })
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
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field label="Senha" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  )
}
