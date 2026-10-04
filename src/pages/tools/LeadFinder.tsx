import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, MapPin, MessageCircle, Phone, Radar, Search, Star, UserPlus } from 'lucide-react'
import { Pager, usePagination } from '@/components/ui/Pagination'
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui/primitives'
import { useInsert, useTable } from '@/hooks/useData'
import {
  defaultLeadMessage,
  fillLeadMessage,
  isSavedLead,
  leadScopes,
  leadTargets,
  mapsSearchUrl,
  nicheSuggestions,
  searchLeads,
  whatsappUrl,
  type Lead,
  type LeadResult,
  type LeadScope,
  type LeadTarget,
} from '@/lib/leads'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'meu-erp-freelas:lead-finder:v1'

interface Prefs {
  scope: LeadScope
  /** Um lugar por abrangência: trocar de "cidade" para "país" não apaga o que já foi digitado. */
  places: Partial<Record<LeadScope, string>>
  niche: string
  target: LeadTarget
  count: number
  message: string
}

const defaults: Prefs = { scope: 'city', places: { country: 'Brasil' }, niche: '', target: 'no_website', count: 10, message: defaultLeadMessage }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch {
    // sem localStorage ou conteúdo inválido: usa os padrões
  }
  return defaults
}

const engineNote: Record<LeadResult['engine'], string> = {
  maps: 'Dados do Google Maps, coletados pelo Gemini. Confira o perfil da empresa antes de entrar em contato: a IA pode errar um telefone ou deixar passar um site.',
  search: 'A busca no Google Maps não estava disponível para a sua chave; estes resultados vieram da busca do Google e são menos precisos. Confira cada empresa antes de entrar em contato.',
  demo: 'Modo demo: estas empresas são fictícias. Com o Supabase e a chave do Gemini configurados, a busca traz empresas reais do Google Maps.',
}

export default function LeadFinder() {
  const clients = useTable('clients')
  const profile = useTable('profiles').data?.[0]
  const insert = useInsert('clients')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [result, setResult] = useState<LeadResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [placeError, setPlaceError] = useState<string | undefined>()
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // sem persistência: as preferências valem só nesta visita
    }
  }, [prefs])

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }))
  const scope = leadScopes.find((s) => s.value === prefs.scope)!
  const place = prefs.places[prefs.scope] ?? ''
  const myName = profile?.full_name || profile?.company_name || ''

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (place.trim().length < 2) {
      setPlaceError('Informe onde buscar')
      return
    }
    setPlaceError(undefined)
    setError(null)
    setLoading(true)
    try {
      const found = await searchLeads({ scope: prefs.scope, place: place.trim(), niche: prefs.niche.trim(), target: prefs.target, count: prefs.count })
      setResult(found)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Não foi possível buscar.')
    } finally {
      setLoading(false)
    }
  }

  const save = async (lead: Lead) => {
    setSaving(lead.id)
    const notes = [
      lead.niche && `Nicho: ${lead.niche}`,
      lead.rating !== null && `Avaliação no Google: ${lead.rating.toLocaleString('pt-BR')}${lead.reviews !== null ? ` (${lead.reviews} avaliações)` : ''}`,
      lead.address && `Endereço: ${lead.address}`,
      lead.website && `Site/rede: ${lead.website}`,
      lead.reason && `Por que é um lead: ${lead.reason}`,
      'Origem: busca de leads',
    ]
    try {
      await insert.mutateAsync({ name: lead.name, company_name: lead.name, phone: lead.phone, status: 'lead', notes: notes.filter(Boolean).join('\n') })
      toast.success('Lead salvo em Clientes', { description: lead.name })
    } catch {
      // toast de erro já exibido pelo hook
    } finally {
      setSaving(null)
    }
  }

  const pagination = usePagination(result?.leads)

  const leadRow = (l: Lead) => {
    const saved = isSavedLead(l, clients.data ?? [])
    const wa = whatsappUrl(l.phone, fillLeadMessage(prefs.message, l, myName))
    // o país no fim do endereço só ocupa espaço em busca nacional
    const address = l.address?.replace(/,\s*(brazil|brasil)\s*$/i, '')
    return (
      <li key={l.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b px-5 py-4 last:border-0">
        <Avatar name={l.name} className="mt-0.5 hidden sm:flex" />
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 break-words text-sm font-semibold">{l.name}</p>
            {l.niche && <Badge>{l.niche}</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            {l.rating !== null ? (
              <span className="tabular inline-flex items-center gap-1 whitespace-nowrap" title="Avaliação no Google">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                <span className="font-medium text-slate-900 dark:text-slate-100">{l.rating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                {l.reviews !== null && <span className="text-xs text-slate-500 dark:text-slate-400">({l.reviews} {l.reviews === 1 ? 'avaliação' : 'avaliações'})</span>}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Sem avaliação</span>
            )}
            <span className="tabular inline-flex items-center gap-1.5 whitespace-nowrap">
              <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              {l.phone ?? <span className="text-slate-400">Sem telefone</span>}
            </span>
          </div>
          <a
            href={l.mapsUrl ?? mapsSearchUrl(l)}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver no Google Maps"
            className="mt-1 inline-flex max-w-full items-start gap-1.5 text-sm text-slate-600 hover:text-brand-600 hover:underline dark:text-slate-300 dark:hover:text-brand-400"
          >
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 break-words">{address || 'Ver no Google Maps'}</span>
          </a>
          {l.reason && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{l.reason}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Enviar mensagem
            </a>
          ) : (
            <span className="inline-flex h-8 items-center whitespace-nowrap px-2.5 text-xs text-slate-400" title="Sem telefone válido para WhatsApp">
              Sem WhatsApp
            </span>
          )}
          {saved ? (
            <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Salvo
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => save(l)} loading={saving === l.id}>
              <UserPlus className="h-3.5 w-3.5" /> Salvar lead
            </Button>
          )}
        </div>
      </li>
    )
  }

  return (
    <>
      <PageHeader title="Busca de leads" description="Encontre no Google Maps empresas que podem precisar do seu serviço, salve como lead ou mande uma mensagem." />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <form onSubmit={search} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Onde buscar">
                <Select value={prefs.scope} onChange={(e) => set('scope', e.target.value as LeadScope)}>
                  {leadScopes.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={scope.placeLabel} error={placeError}>
                <Input value={place} placeholder={scope.placeholder} maxLength={120} onChange={(e) => set('places', { ...prefs.places, [prefs.scope]: e.target.value })} />
              </Field>
              <Field label="Nicho das empresas">
                <Input value={prefs.niche} placeholder="Ex.: restaurantes, clínicas, oficinas (vazio = qualquer)" maxLength={120} onChange={(e) => set('niche', e.target.value)} />
              </Field>
              <Field label="Alvo">
                <Select value={prefs.target} onChange={(e) => set('target', e.target.value as LeadTarget)}>
                  {leadTargets.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Sugestões de nicho">
              {nicheSuggestions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set('niche', n)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800',
                    prefs.niche === n ? 'border-brand-600 text-brand-700 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Quantidade" className="w-40">
                <Select value={prefs.count} onChange={(e) => set('count', Number(e.target.value))}>
                  {[5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n} empresas
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" loading={loading}>
                <Search className="h-4 w-4" /> Buscar leads
              </Button>
            </div>
          </form>
        </Card>

        <Card className="space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Mensagem predefinida</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Vai pronta no WhatsApp ao clicar em "Enviar mensagem"; você revisa e envia por lá. Use {'{empresa}'}, {'{nicho}'} e {'{meu_nome}'}.
            </p>
          </div>
          <Textarea aria-label="Mensagem predefinida" rows={7} maxLength={1000} value={prefs.message} onChange={(e) => set('message', e.target.value)} />
          <Button variant="ghost" size="sm" onClick={() => set('message', defaultLeadMessage)} disabled={prefs.message === defaultLeadMessage}>
            Restaurar texto padrão
          </Button>
        </Card>
      </div>

      <Card className="mt-4">
        {error ? (
          <EmptyState icon={Radar} title="A busca não funcionou" description={error} />
        ) : !result && !loading ? (
          <EmptyState icon={Radar} title="Nenhuma busca ainda" description="Escolha onde buscar, o nicho e o alvo. As empresas encontradas aparecem aqui." />
        ) : (
          <>
            {result && (
              <div className="flex flex-wrap items-start gap-2 border-b px-5 py-3.5">
                <Badge tone={result.engine === 'maps' ? 'green' : 'amber'}>{result.leads.length} {result.leads.length === 1 ? 'empresa' : 'empresas'}</Badge>
                <p className="min-w-0 flex-1 basis-64 text-xs text-slate-500 dark:text-slate-400">{engineNote[result.engine]}
                  {result.mapsError && <span className="mt-1 block">Resposta do Google: {result.mapsError}</span>}
                </p>
              </div>
            )}
            {loading ? (
              <ul aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="flex items-start gap-4 border-b px-5 py-4 last:border-0">
                    <Skeleton className="hidden h-9 w-9 rounded-full sm:block" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-56 max-w-full" />
                      <Skeleton className="h-3.5 w-80 max-w-full" />
                      <Skeleton className="h-3.5 w-64 max-w-full" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : pagination.total === 0 ? (
              <EmptyState icon={Radar} title="Nenhuma empresa encontrada" description="Tente outro nicho, um alvo mais amplo ou uma região maior." />
            ) : (
              <>
                <ul>{pagination.visible.map(leadRow)}</ul>
                <Pager {...pagination} />
              </>
            )}
          </>
        )}
      </Card>
    </>
  )
}
