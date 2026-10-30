import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { CheckCircle2, CreditCard, Receipt, Save, Undo2, type LucideIcon } from 'lucide-react'
import { companySchema, companySections, type CompanySectionId } from '@/components/forms/companyForm'
import { FormFields, initialValues, payloadOf } from '@/components/forms/EntityForm'
import { Avatar, Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { BusinessProfileCard } from '@/components/BusinessProfileCard'
import { PaymentMethods } from '@/components/PaymentMethods'
import { PlanCard } from '@/components/PlanCard'
import { planNames, trialDaysLeft, usePlan } from '@/lib/plan'
import type { Profile } from '@/types/database.types'
import type { FieldDef } from '@/components/forms/EntityForm'
import { cn } from '@/lib/utils'

const allFields = companySections.flatMap((s) => s.fields)
/** Seções que não são formulário (têm botões próprios): moram no mesmo menu das demais. */
const extraSections = [
  { id: 'planos', label: 'Planos e assinatura', icon: Receipt },
  { id: 'pagamento', label: 'Formas de pagamento', icon: CreditCard },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]
type ExtraId = (typeof extraSections)[number]['id']
const isExtra = (id: string | null): id is ExtraId => extraSections.some((e) => e.id === id)
const isSection = (id: string | null): id is CompanySectionId => companySections.some((s) => s.id === id)

/** O menu lateral em grupos: o que é da empresa, do recebimento, da pessoa e da assinatura. */
const navGroups: { title: string; ids: string[] }[] = [
  { title: 'Empresa', ids: ['dados'] },
  { title: 'Recebimento', ids: ['integracoes', 'fiscal'] },
  { title: 'Você', ids: ['lembretes', 'seguranca'] },
  { title: 'Assinatura', ids: ['planos', 'pagamento'] },
]

/** Agrupa os campos de uma seção em blocos (título e explicação de um lado, campos do outro). */
function groupFields(fields: FieldDef[]) {
  const groups: { title: string; hint?: string; fields: FieldDef[] }[] = []
  for (const f of fields) {
    const title = f.group ?? ''
    let g = groups.find((x) => x.title === title)
    if (!g) groups.push((g = { title, fields: [] }))
    if (f.groupHint && !g.hint) g.hint = f.groupHint
    g.fields.push(f)
  }
  return groups
}

/** O que falta para o cadastro ficar completo, e em qual seção resolver. */
function completeness(profile: Profile | undefined, businessType: string | null | undefined) {
  const items = [
    { label: 'nome da empresa', ok: !!profile?.company_name?.trim(), section: 'dados' },
    { label: 'CPF ou CNPJ', ok: !!profile?.document?.trim(), section: 'dados' },
    { label: 'contato', ok: !!(profile?.phone?.trim() || profile?.email?.trim()), section: 'dados' },
    { label: 'assinatura', ok: !!profile?.signature_image, section: 'dados' },
    { label: 'forma de receber', ok: !!(profile?.pix_key?.trim() || profile?.billing_provider === 'asaas'), section: 'integracoes' },
    { label: 'perfil do negócio', ok: !!businessType, section: 'dados' },
  ]
  return { items, done: items.filter((i) => i.ok).length, next: items.find((i) => !i.ok) }
}

/** Quem é a empresa, em que plano está e o quanto do cadastro já está pronto. */
function CompanyHeader({ profile, onGo }: { profile: Profile | undefined; onGo: (id: string) => void }) {
  const { workspace } = useActiveWorkspace()
  const { usage } = usePlan()
  if (!profile || !workspace) return <Skeleton className="mb-5 h-24 w-full" />
  const name = profile.company_name?.trim() || workspace.name
  const detail = [profile.document, profile.email].filter(Boolean).join('  ·  ')
  const progress = completeness(profile, workspace.business_type)
  const pct = Math.round((progress.done / progress.items.length) * 100)
  const days = trialDaysLeft(usage)
  const plan = usage
    ? days !== null
      ? { label: `Teste grátis · ${days <= 1 ? 'último dia' : `${days} dias`}`, tone: 'indigo' as const }
      : { label: planNames[usage.plan], tone: usage.plan === 'free' ? ('slate' as const) : ('green' as const) }
    : null
  return (
    <Card className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Avatar name={name} className="h-12 w-12 text-sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">{name}</h2>
            {plan && <Link to="/minha-empresa?secao=planos"><Badge tone={plan.tone}>{plan.label}</Badge></Link>}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{detail || 'Complete os dados para que apareçam nos seus documentos.'}</p>
        </div>
      </div>
      <div className="w-full sm:w-72">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Cadastro {pct}% completo</span>
          {progress.next ? (
            <button type="button" onClick={() => onGo(progress.next!.section)} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
              Falta: {progress.next.label}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Tudo pronto</span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cadastro completo">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Card>
  )
}

/**
 * Minha empresa: o perfil numa tela, dividido em seções (dados da empresa,
 * integrações, dados fiscais e lembretes). Um formulário só: trocar de seção
 * não perde o que foi digitado, e "Salvar" grava tudo junto.
 * A seção aberta fica na URL (?secao=integracoes) para outras telas
 * mandarem direto para ela.
 */
export default function Company() {
  const profiles = useTable('profiles')
  const profile = profiles.data?.[0]
  const update = useUpdate('profiles')
  const { can } = useActiveWorkspace()
  const [params, setParams] = useSearchParams()
  const extra = isExtra(params.get('secao')) ? (params.get('secao') as ExtraId) : null
  const current: CompanySectionId | ExtraId = extra ?? (isSection(params.get('secao')) ? (params.get('secao') as CompanySectionId) : 'dados')
  const section = companySections.find((s) => s.id === current) ?? companySections[0]
  const nav = useRef<HTMLElement>(null)

  // no celular o menu rola de lado: a seção aberta fica sempre à vista
  useEffect(() => {
    nav.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  const form = useForm<Record<string, any>>({ resolver: zodResolver(companySchema), defaultValues: initialValues(allFields, profile) })
  const {
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting, errors },
  } = form

  // carrega o perfil quando ele chega (e não sobrescreve o que está sendo editado)
  useEffect(() => {
    if (profile) reset(initialValues(allFields, profile))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // conectar ou desconectar o Asaas já grava a forma de cobrança: ela não conta como alteração pendente
  useEffect(() => {
    if (profile?.billing_provider) form.resetField('billing_provider', { defaultValue: profile.billing_provider })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.billing_provider])

  // sair da página com alteração não salva pede confirmação do navegador
  useEffect(() => {
    if (!isDirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const sectionsWithErrors = useMemo(
    () => new Set(companySections.filter((s) => s.fields.some((f) => errors[f.name])).map((s) => s.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [errors, Object.keys(errors).join()],
  )

  const go = (id: CompanySectionId | ExtraId) => setParams(id === 'dados' ? {} : { secao: id }, { replace: true })

  const save = handleSubmit(
    async (values) => {
      if (!profile) return
      try {
        const saved = await update.mutateAsync({ id: profile.id, patch: payloadOf(allFields, values) })
        reset(initialValues(allFields, saved))
        toast.success('Alterações salvas')
      } catch {
        // o hook já avisa e desfaz
      }
    },
    (invalid) => {
      const first = companySections.find((s) => s.fields.some((f) => invalid[f.name]))
      if (first && first.id !== current) go(first.id)
      toast.error('Confira os campos destacados', { description: first ? `Na seção ${first.label}.` : undefined })
    },
  )

  const sectionItems = [
    ...companySections.map((s) => ({ id: s.id as string, label: s.label, icon: s.icon as LucideIcon, error: sectionsWithErrors.has(s.id) })),
    ...extraSections.map((e) => ({ id: e.id as string, label: e.label, icon: e.icon as LucideIcon, error: false })),
  ]
  const values = form.watch()
  // blocos cujos campos estão todos escondidos (ex.: regras do Asaas com cobrança simples) não aparecem vazios
  const groups = groupFields(section.fields).filter((g) => g.fields.some((f) => !f.showWhen || f.showWhen(values)))

  return (
    <>
      <PageHeader title="Minha empresa" />
      {!can('admin') && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Os dados da empresa, a cobrança e a nota fiscal só o dono ou um administrador altera. Os seus lembretes você ajusta normalmente.
        </p>
      )}

      <CompanyHeader profile={profile} onGo={(id) => go(id as CompanySectionId)} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[220px_1fr]">
        <nav ref={nav} aria-label="Seções" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0">
          {navGroups.map((g) => {
            const items = g.ids.map((id) => sectionItems.find((x) => x.id === id)).filter((x): x is (typeof sectionItems)[number] => !!x)
            if (!items.length) return null
            return (
              <div key={g.title} className="flex gap-1 lg:flex-col">
                <p className="hidden px-3 pb-1 text-xs font-medium text-slate-400 lg:block">{g.title}</p>
                {items.map((item) => {
                  const Icon = item.icon
                  const active = item.id === current
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id as CompanySectionId)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                        active ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-400' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.error && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="com erro" />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div className="min-w-0">
          {extra === 'planos' && <PlanCard />}
          {extra === 'pagamento' && <PaymentMethods />}

          {/* o formulário continua montado para não perder o que foi digitado ao passar pelas seções de plano */}
          <form onSubmit={save} noValidate className={cn(extra && 'hidden')}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight">{section.label}</h2>
              <p className="mt-0.5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{section.description}</p>
            </div>
            <Card className="divide-y">
              {profiles.isLoading || !profile ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-2/3" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                groups.map((g) => (
                  <section key={g.title} className="grid gap-4 p-5 lg:grid-cols-[200px_1fr] lg:gap-8">
                    <div>
                      <h3 className="text-sm font-semibold">{g.title}</h3>
                      {g.hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{g.hint}</p>}
                    </div>
                    <div className="grid grid-cols-2 content-start gap-4">
                      <FormFields fields={g.fields} form={form} />
                    </div>
                  </section>
                ))
              )}
            </Card>

            {isDirty && (
              <div role="status" className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 shadow-lg dark:bg-slate-900">
                <span className="text-sm text-slate-600 dark:text-slate-300">Você tem alterações não salvas. Elas valem para todas as seções.</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => profile && reset(initialValues(allFields, profile))}>
                    <Undo2 className="h-4 w-4" /> Descartar
                  </Button>
                  <Button type="submit" loading={isSubmitting}>
                    <Save className="h-4 w-4" /> Salvar alterações
                  </Button>
                </div>
              </div>
            )}
          </form>

          {!extra && current === 'dados' && <div className="mt-6"><BusinessProfileCard /></div>}
        </div>
      </div>
    </>
  )
}
