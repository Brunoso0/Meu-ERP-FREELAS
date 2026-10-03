import { useState } from 'react'
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

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const submit = handleSubmit(async (values) => {
    if (!supabase) return
    const { data, error } =
      mode === 'signin' ? await supabase.auth.signInWithPassword(values) : await supabase.auth.signUp(values)
    if (error) {
      toast.error(mode === 'signin' ? 'Não foi possível entrar' : 'Não foi possível criar a conta', { description: error.message })
      return
    }
    if (mode === 'signup' && !data.session) {
      toast.success('Conta criada', { description: 'Confirme o e-mail que enviamos para concluir o cadastro.' })
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">F</span>
          <span className="text-sm font-semibold tracking-tight">Meu ERP Freelas</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{mode === 'signin' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {mode === 'signin' ? 'Acesse seus projetos, demandas e finanças.' : 'Leva menos de um minuto.'}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="E-mail" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field label="Senha" error={errors.password?.message}>
            <Input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} {...register('password')} />
          </Field>
          <Button type="submit" loading={isSubmitting} className="w-full">
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-4 w-full text-center text-sm text-brand-600 hover:underline dark:text-brand-400"
        >
          {mode === 'signin' ? 'Ainda não tem conta? Criar agora' : 'Já tenho conta'}
        </button>
      </Card>
    </div>
  )
}
