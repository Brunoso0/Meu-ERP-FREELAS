import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowRight, Eye, EyeOff, Fingerprint, Loader2, Lock, Mail, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TERMS_VERSION } from '@/lib/legal'
import { APP_BASE, appUrl } from '@/lib/app-base'
import { cn } from '@/lib/utils'
import { biometricAvailable, biometricDevice, enableBiometric, isBiometricCancel, markActive, signInWithBiometric, takeExpiredNotice } from '@/lib/session'

const schema = z.object({
  name: z.string().optional(),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo de 6 caracteres'),
})
type Values = z.infer<typeof schema>

/** Logins por Google, Apple e GitHub ainda não existem: os botões só avisam. */
const soon = (what: string) => toast.info(`${what} em breve`, { description: 'Por enquanto, entre com e-mail e senha ou com a biometria.' })

type Social = 'google' | 'github'

const field = 'login-field relative rounded-2xl border border-slate-800 bg-slate-900/90 transition-all'
const input = 'w-full rounded-2xl bg-transparent py-3.5 pl-11 text-sm text-white placeholder-slate-500 focus:outline-none'
const socialButton =
  'group flex items-center justify-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/90 px-4 py-3 text-sm font-medium shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-indigo-500/50 hover:bg-slate-800 active:scale-[0.98]'

/** Entrar ou criar conta. Quem chega por um link de convite (/convite/…) volta a ele depois de entrar. */
export default function Login() {
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: biometricDevice()?.email ?? '' } })
  const device = biometricDevice()
  const [biometricBusy, setBiometricBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const asked = useRef(false)
  // a landing page abre direto no cadastro (/app/?cadastro)
  const [mode, setMode] = useState<'login' | 'signup'>(() => (new URLSearchParams(window.location.search).has('cadastro') ? 'signup' : 'login'))
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const signup = mode === 'signup'
  const invited = window.location.pathname.startsWith(`${APP_BASE}/convite/`)

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
    if (signup) {
      const name = values.name?.trim()
      if (!name) return void toast.error('Informe o seu nome')
      if (!accepted) return void toast.error('Aceite os termos de uso e a política de privacidade para criar a conta')
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        // o e-mail de confirmação traz a pessoa de volta para cá (inclusive para o link de convite)
        options: { data: { full_name: name, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() }, emailRedirectTo: window.location.origin + window.location.pathname },
      })
      if (error) return void toast.error('Não foi possível criar a conta', { description: error.message })
      // e-mail já cadastrado: o Supabase não revela (devolve uma conta sem identidades)
      if (data.user && data.user.identities?.length === 0) return void toast.error('Este e-mail já tem conta', { description: 'Entre com a sua senha.' })
      if (!data.session) setSentTo(values.email)
      return
    }
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

  /** Entrar com Google/GitHub: vai ao provedor e volta para esta mesma página (inclusive um link de convite). */
  const social = async (provider: Social) => {
    if (!supabase) return
    markActive()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname },
    })
    if (error) toast.error('Não foi possível entrar', { description: error.message })
  }

  /** Esqueceu a senha: manda o link por e-mail; ele volta para esta página e abre a tela de nova senha. */
  const forgot = async () => {
    if (!supabase) return
    if (!(await trigger('email'))) return void toast.error('Digite o seu e-mail acima', { description: 'O link para criar uma nova senha vai para ele.' })
    const email = getValues('email')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl('/') })
    if (error) return void toast.error('Não foi possível enviar o link', { description: error.message })
    toast.success('Link enviado', { description: `Se ${email} tiver conta, você recebe um e-mail para criar uma nova senha.` })
  }

  const emailField = register('email')

  return (
    <div className="safe-top safe-bottom relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] p-4 text-slate-100 selection:bg-indigo-500 selection:text-white sm:p-6">
      {/* luzes e grade do fundo */}
      <div aria-hidden className="login-glow pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-indigo-600/15 blur-[140px]" />
      <div aria-hidden className="login-glow pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-violet-600/15 blur-[140px] [animation-delay:3.5s]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-slate-800/80 bg-[rgba(9,13,22,0.85)] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-2xl lg:grid-cols-12">
        {/* destaque */}
        <div className="relative flex flex-col justify-between overflow-hidden border-b border-slate-800/60 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-950 p-6 sm:p-12 lg:col-span-5 lg:border-b-0 lg:border-r">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="relative">
            <div className="mb-6 flex items-center gap-3.5 sm:mb-10">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-xl font-black tracking-wider text-white shadow-lg shadow-indigo-500/30">K</div>
              <div>
                <span className="block text-lg font-bold tracking-tight text-white">Krono</span>
                <span className="text-xs font-medium text-indigo-400">Gestão & Produtividade</span>
              </div>
            </div>
            <h2 className="mb-3 text-2xl font-extrabold leading-snug tracking-tight text-white sm:text-3xl">
              Organize seus projetos com{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-indigo-300 to-violet-400 bg-clip-text text-transparent">alta performance.</span>
            </h2>
            <p className="hidden text-sm font-light leading-relaxed text-slate-400 sm:block">
              Controle clientes, prazos, faturamentos e demandas em um só ecossistema desenhado para freelancers modernos.
            </p>
          </div>

        </div>

        {/* formulário */}
        <div className="flex flex-col justify-center bg-slate-950/20 p-6 sm:p-12 lg:col-span-7">
          <div className="mb-8">
            <h1 className="mb-1.5 text-2xl font-bold tracking-tight text-white">{signup ? 'Crie a sua conta' : 'Bem-vindo de volta!'}</h1>
            <p className="text-sm font-light text-slate-400">
              {signup ? 'Leva um minuto e você já pode usar.' : 'Insira suas credenciais ou escolha sua conta social favorita.'}
            </p>
          </div>

          {invited && (
            <p className="mb-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-200">
              Você recebeu um convite. {signup ? 'Crie a conta' : 'Entre'} com o e-mail que foi convidado e o convite abre em seguida.
            </p>
          )}

          {sentTo ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
              <Mail className="mx-auto mb-3 h-6 w-6 text-indigo-400" />
              <h2 className="mb-1 text-lg font-semibold text-white">Confirme o seu e-mail</h2>
              <p className="mb-4 text-sm text-slate-400">Enviamos um link para <strong className="text-slate-200">{sentTo}</strong>. Abra-o para ativar a conta e depois volte a entrar.</p>
              <button type="button" onClick={() => { setSentTo(null); setMode('login') }} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">Já confirmei, quero entrar</button>
            </div>
          ) : (
          <>

          <div className="mb-6 grid grid-cols-3 gap-3">
            <button type="button" onClick={() => void social('google')} className={socialButton} aria-label="Entrar com Google">
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span className="hidden text-xs font-medium text-slate-300 group-hover:text-white sm:inline">Google</span>
            </button>
            <button type="button" onClick={() => soon('Login com Apple')} className={socialButton} aria-label="Entrar com Apple">
              <svg className="h-4 w-4 text-slate-200 group-hover:text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z" />
              </svg>
              <span className="hidden text-xs font-medium text-slate-300 group-hover:text-white sm:inline">Apple</span>
            </button>
            <button type="button" onClick={() => void social('github')} className={socialButton} aria-label="Entrar com GitHub">
              <svg className="h-4 w-4 text-slate-200 group-hover:text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
              </svg>
              <span className="hidden text-xs font-medium text-slate-300 group-hover:text-white sm:inline">GitHub</span>
            </button>
          </div>

          {signup && <p className="mb-4 text-center text-[11px] text-slate-500">Ao entrar com Google ou GitHub você aceita os <a href={`${APP_BASE}/termos`} target="_blank" rel="noreferrer" className="underline">termos</a> e a <a href={`${APP_BASE}/privacidade`} target="_blank" rel="noreferrer" className="underline">política de privacidade</a>.</p>}

          <div className="mb-6 flex items-center py-1">
            <div className="flex-grow border-t border-slate-800" />
            <span className="mx-4 flex-shrink text-[11px] font-semibold uppercase tracking-wider text-slate-500">ou com e-mail</span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {signup && (
              <div>
                <label htmlFor="login-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Seu nome
                </label>
                <div className={field}>
                  <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input id="login-name" type="text" autoComplete="name" maxLength={120} {...register('name')} className={cn(input, 'pr-4')} />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                E-mail profissional
              </label>
              <div className={cn(field, errors.email && 'border-red-500/60')}>
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  {...emailField}
                  onFocus={onEmailFocus}
                  aria-invalid={Boolean(errors.email)}
                  className={cn(input, 'pr-4')}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Senha
                </label>
                <button type="button" onClick={forgot} className="text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300">
                  Esqueceu a senha?
                </button>
              </div>
              <div className={cn(field, errors.password && 'border-red-500/60')}>
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  {...register('password')}
                  aria-invalid={Boolean(errors.password)}
                  className={cn(input, 'pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 transition-colors hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>}
            </div>

            {signup && (
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-400">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 accent-indigo-500" />
                <span>
                  Li e aceito os{' '}
                  <a href={`${APP_BASE}/termos`} target="_blank" rel="noreferrer" className="font-semibold text-indigo-400 hover:text-indigo-300">termos de uso</a> e a{' '}
                  <a href={`${APP_BASE}/privacidade`} target="_blank" rel="noreferrer" className="font-semibold text-indigo-400 hover:text-indigo-300">política de privacidade</a>.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={isSubmitting || biometricBusy}
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-4 text-sm font-semibold text-white shadow-xl shadow-indigo-600/20 transition-all duration-200 hover:scale-[1.01] hover:from-indigo-500 hover:to-violet-500 active:scale-[0.99] active:from-indigo-700 active:to-violet-700 disabled:pointer-events-none disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {signup ? 'Criando…' : 'Autenticando…'}
                </>
              ) : (
                <>
                  {signup ? 'Criar conta' : 'Acessar Plataforma'} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>

            {device && !signup && (
              <button
                type="button"
                onClick={biometric}
                disabled={biometricBusy || isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/90 px-4 py-3.5 text-sm font-medium text-slate-200 transition-all duration-200 hover:border-indigo-500/50 hover:bg-slate-800 hover:text-white disabled:opacity-70"
              >
                {biometricBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4 text-indigo-400" />}
                Entrar com biometria
              </button>
            )}
          </form>

          <p className="mt-8 text-center text-xs font-light text-slate-500">
            {signup ? 'Já tem conta?' : 'Ainda não tem cadastro?'}{' '}
            <button type="button" onClick={() => setMode(signup ? 'login' : 'signup')} className="font-semibold text-indigo-400 transition-colors hover:text-indigo-300">
              {signup ? 'Entrar' : 'Criar conta grátis'}
            </button>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
