import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Save, Undo2 } from 'lucide-react'
import { companySchema, companySections, type CompanySectionId } from '@/components/forms/companyForm'
import { FormFields, initialValues, payloadOf } from '@/components/forms/EntityForm'
import { Button, Card, PageHeader, Skeleton } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { BusinessProfileCard } from '@/components/BusinessProfileCard'
import { cn } from '@/lib/utils'

const allFields = companySections.flatMap((s) => s.fields)
const isSection = (id: string | null): id is CompanySectionId => companySections.some((s) => s.id === id)

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
  const current = isSection(params.get('secao')) ? (params.get('secao') as CompanySectionId) : 'dados'
  const section = companySections.find((s) => s.id === current)!
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

  const go = (id: CompanySectionId) => setParams(id === 'dados' ? {} : { secao: id }, { replace: true })

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

  return (
    <>
      <PageHeader title="Minha empresa" description="Seus dados como emitente, a forma de cobrança, a nota fiscal, os lembretes e a segurança." />
      {!can('admin') && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Os dados da empresa, a cobrança e a nota fiscal só o dono ou um administrador altera. Os seus lembretes você ajusta normalmente.
        </p>
      )}

      <BusinessProfileCard />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[230px_1fr]">
        <nav ref={nav} aria-label="Seções" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {companySections.map((s) => {
            const Icon = s.icon
            const active = s.id === current
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                  active ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-400' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{s.label}</span>
                {sectionsWithErrors.has(s.id) && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="com erro" />}
              </button>
            )
          })}
        </nav>

        <form onSubmit={save} noValidate>
          <Card className="overflow-hidden">
            <div className="border-b px-5 py-4">
              <h2 className="text-base font-semibold">{section.label}</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{section.description}</p>
            </div>
            {profiles.isLoading || !profile ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-2 content-start gap-4 p-5">
                <FormFields fields={section.fields} form={form} />
              </div>
            )}
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-white/95 px-5 py-3 backdrop-blur dark:bg-slate-900/95">
              <span className="text-xs text-slate-500 dark:text-slate-400">{isDirty ? 'Alterações não salvas (valem para todas as seções)' : 'Tudo salvo'}</span>
              <div className="flex gap-2">
                {isDirty && (
                  <Button variant="secondary" onClick={() => profile && reset(initialValues(allFields, profile))}>
                    <Undo2 className="h-4 w-4" /> Descartar
                  </Button>
                )}
                <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                  <Save className="h-4 w-4" /> Salvar alterações
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  )
}
