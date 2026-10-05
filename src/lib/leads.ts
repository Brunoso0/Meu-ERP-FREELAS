import { z } from 'zod'
import { supabase } from './supabase'

export type LeadScope = 'city' | 'region' | 'other_region' | 'country' | 'international'
export type LeadTarget = 'no_website' | 'no_presence' | 'social_only' | 'few_reviews' | 'any'

export const leadScopes: Array<{ value: LeadScope; label: string; placeLabel: string; placeholder: string }> = [
  { value: 'city', label: 'Minha cidade', placeLabel: 'Cidade', placeholder: 'Ex.: Feira de Santana/BA' },
  { value: 'region', label: 'Minha região', placeLabel: 'Região', placeholder: 'Ex.: Recôncavo Baiano' },
  { value: 'other_region', label: 'Outra região', placeLabel: 'Qual região', placeholder: 'Ex.: Grande Curitiba, Vale do Paraíba' },
  { value: 'country', label: 'País inteiro', placeLabel: 'País', placeholder: 'Brasil' },
  { value: 'international', label: 'Internacional', placeLabel: 'País ou cidade no exterior', placeholder: 'Ex.: Portugal, Lisboa' },
]

export const leadTargets: Array<{ value: LeadTarget; label: string }> = [
  { value: 'no_website', label: 'Empresas sem site' },
  { value: 'no_presence', label: 'Empresas sem presença digital' },
  { value: 'social_only', label: 'Só rede social, sem site próprio' },
  { value: 'few_reviews', label: 'Poucas avaliações ou nota baixa' },
  { value: 'any', label: 'Qualquer empresa do nicho' },
]

export const nicheSuggestions = [
  'Restaurantes', 'Clínicas e consultórios', 'Salões de beleza', 'Oficinas mecânicas', 'Lojas de roupas',
  'Academias', 'Pet shops', 'Escritórios de contabilidade', 'Advogados', 'Imobiliárias',
]

export interface LeadSearch {
  scope: LeadScope
  place: string
  niche: string
  target: LeadTarget
  count: number
}

export interface Lead {
  id: string
  name: string
  niche: string | null
  rating: number | null
  reviews: number | null
  phone: string | null
  address: string | null
  website: string | null
  reason: string | null
  /** Link da empresa no Google Maps, quando a busca devolveu a fonte. */
  mapsUrl: string | null
}

export interface LeadResult {
  leads: Lead[]
  /** `maps` = Google Maps; `search` = busca do Google (menos preciso); `demo` = dados de exemplo. */
  engine: 'maps' | 'search' | 'demo'
  /** Por que a busca no Maps não foi usada, quando caiu para a busca do Google. */
  mapsError?: string
}

const optionalText = z.preprocess((v) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|-)$/i.test(v.trim()) ? v.trim() : null), z.string().nullable())
const optionalNumber = z.preprocess((v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}, z.number().nullable())

const leadSchema = z.object({
  name: z.string().trim().min(1),
  niche: optionalText,
  rating: optionalNumber,
  reviews: optionalNumber,
  phone: optionalText,
  address: optionalText,
  website: optionalText,
  reason: optionalText,
})

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Extrai os leads do texto devolvido pelo Gemini. O modelo é instruído a
 * responder com um array JSON, mas às vezes o embrulha em ``` ou em uma frase;
 * itens malformados são descartados em vez de derrubar a busca toda.
 */
export function parseLeads(text: string, sources: Array<{ title: string; uri: string }> = []): Lead[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const leads: Lead[] = []
  for (const item of raw) {
    const parsed = leadSchema.safeParse(item)
    if (!parsed.success) continue
    const key = normalize(parsed.data.name)
    if (seen.has(key)) continue
    seen.add(key)
    const source = sources.find((s) => s.title && (normalize(s.title) === key || normalize(s.title).includes(key) || key.includes(normalize(s.title))))
    leads.push({
      ...parsed.data,
      rating: parsed.data.rating !== null && parsed.data.rating >= 0 && parsed.data.rating <= 5 ? parsed.data.rating : null,
      id: crypto.randomUUID(),
      mapsUrl: source && /^https:\/\//i.test(source.uri) ? source.uri : null,
    })
  }
  return leads
}

/** Link de busca no Google Maps para quando a fonte da empresa não veio na resposta. */
export const mapsSearchUrl = (lead: Lead) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.name, lead.address].filter(Boolean).join(', '))}`

const demoLeads = (search: LeadSearch): Lead[] =>
  [
    { name: 'Padaria Pão da Vila', niche: 'Padaria', rating: 4.6, reviews: 212, phone: '(11) 98888-4141', address: 'Rua das Acácias, 120 — Centro', website: null, reason: 'Sem site cadastrado no perfil.' },
    { name: 'Oficina do Juca', niche: 'Oficina mecânica', rating: 4.8, reviews: 87, phone: '(11) 3333-2020', address: 'Av. Brasil, 1450 — Jardim América', website: null, reason: 'Só telefone no perfil, sem site nem redes.' },
    { name: 'Studio Bela Unha', niche: 'Salão de beleza', rating: 4.9, reviews: 143, phone: '(11) 97777-3030', address: 'Rua Sete de Setembro, 88 — Centro', website: 'https://instagram.com/', reason: 'Usa só o Instagram como endereço na web.' },
    { name: 'Clínica Sorriso Certo', niche: 'Clínica odontológica', rating: 4.3, reviews: 31, phone: '(11) 3222-4040', address: 'Rua Marechal Deodoro, 300 — Sala 4', website: null, reason: 'Sem site e com poucas avaliações.' },
    { name: 'Pet Shop Amigo Fiel', niche: 'Pet shop', rating: 4.7, reviews: 58, phone: null, address: 'Av. das Palmeiras, 910 — Vila Nova', website: null, reason: 'Sem site cadastrado no perfil.' },
  ]
    .slice(0, search.count)
    .map((lead) => ({ ...lead, niche: search.niche.trim() || lead.niche, id: crypto.randomUUID(), mapsUrl: null }))

/** Busca leads. No modo demo devolve empresas fictícias, para a tela poder ser experimentada. */
export async function searchLeads(search: LeadSearch): Promise<LeadResult> {
  if (!supabase) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return { leads: demoLeads(search), engine: 'demo' }
  }

  const { data, error } = await supabase.functions.invoke('find-leads', { body: search })
  if (error) {
    // a função devolve { message } nos erros que o usuário consegue resolver
    const context = (error as { context?: Response }).context
    const detail = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null
    if (detail?.message) throw new Error(detail.message)
    if (context?.status === 404) throw new Error('A função de busca (find-leads) ainda não foi publicada no Supabase.')
    throw new Error('Não foi possível falar com a busca de leads. Tente de novo em instantes.')
  }
  return { leads: parseLeads(String(data?.text ?? ''), data?.sources ?? []), engine: data?.engine === 'search' ? 'search' : 'maps', mapsError: data?.mapsError ? String(data.mapsError).slice(0, 300) : undefined }
}

export const defaultLeadMessage =
  'Olá! me chamo {meu_nome}. Encontrei a {empresa} no Google e notei que vocês ainda podem aparecer melhor para quem procura por {nicho} na internet. Trabalho ajudando negócios como o de vocês com isso. Posso te mandar um protótipo visual de como ficaria um site para a {empresa}, sem compromisso?'

/** Preenche {empresa}, {nicho} e {meu_nome} na mensagem predefinida. */
export function fillLeadMessage(template: string, lead: Lead, myName: string) {
  const values: Record<string, string> = {
    empresa: lead.name,
    nicho: (lead.niche ?? 'seu segmento').toLowerCase(),
    meu_nome: myName || 'um prestador de serviços',
  }
  return template.replace(/\{(empresa|nicho|meu_nome)\}/g, (_, key: string) => values[key])
}

/**
 * Link do WhatsApp, com a mensagem pronta quando há uma. Número sem código de país é tratado
 * como brasileiro. Devolve null quando o telefone não serve para WhatsApp.
 */
export function whatsappUrl(phone: string | null, message = '') {
  if (!phone) return null
  const international = phone.trim().startsWith('+')
  let digits = phone.replace(/\D/g, '').replace(/^0+/, '')
  if (!international && !(digits.startsWith('55') && digits.length >= 12)) digits = `55${digits}`
  if (digits.length < 10 || digits.length > 15) return null
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

/** Empresa já cadastrada como cliente ou lead (mesmo nome ou mesmo telefone). */
export function isSavedLead(lead: Lead, clients: Array<{ name: string; company_name: string | null; phone: string | null }>) {
  const name = normalize(lead.name)
  const phone = lead.phone?.replace(/\D/g, '') ?? ''
  return clients.some(
    (c) => normalize(c.company_name ?? '') === name || normalize(c.name) === name || (phone.length >= 8 && c.phone?.replace(/\D/g, '') === phone),
  )
}
