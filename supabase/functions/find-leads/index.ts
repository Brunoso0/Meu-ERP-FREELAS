// =====================================================================
// find-leads: busca empresas no Google Maps por meio do Gemini.
//
// Primeiro tenta a busca no Google Maps (ferramenta googleMaps). Quando a
// chave não tem acesso ou cota para ela, usa a busca do Google, mirando os
// perfis de empresa do Google (os mesmos dados do Maps) e conferindo o que
// voltou: cada empresa é checada contra as fontes que o Gemini citou, o
// telefone é validado, e o alvo (sem site, só rede social...) é reaplicado
// aqui, para não passar empresa que contradiz o que foi pedido.
//
// A chave do Gemini fica só aqui, como segredo da função (GEMINI_API_KEY),
// e nunca vai para o navegador. A função só atende quem está logado no app.
//
// Segredos (Edge Functions → Secrets):
//   GEMINI_API_KEY  obrigatório, criado em https://aistudio.google.com/apikey
//   GEMINI_MODEL    opcional, padrão "gemini-2.5-flash"
// =====================================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SCOPES: Record<string, (place: string) => string> = {
  city: (p) => `na cidade de ${p}`,
  region: (p) => `na região de ${p} (a cidade e os municípios em volta)`,
  other_region: (p) => `na região de ${p}`,
  country: (p) => `em todo o país: ${p}. Varie as cidades e os estados`,
  international: (p) => `fora do Brasil, em: ${p}`,
}

const TARGETS: Record<string, string> = {
  no_website: 'empresas que NÃO têm site próprio cadastrado no perfil do Google Maps',
  no_presence: 'empresas sem presença digital: sem site próprio e sem redes sociais divulgadas no perfil',
  social_only: 'empresas que usam apenas rede social (Instagram, Facebook) ou link de WhatsApp no lugar de um site próprio',
  few_reviews: 'empresas com poucas avaliações no Google (menos de 20) ou nota abaixo de 4',
  any: 'empresas do nicho, com ou sem site',
}

/** Quando o Maps recusa por cota ou acesso, não adianta tentar de novo a cada busca. */
const MAPS_PAUSE_MS = 6 * 60 * 60 * 1000
let mapsPausedUntil = 0
let mapsPauseReason = ''

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\r\n`]+/g, ' ').trim().slice(0, max)

const FIELDS = [
  'Responda SOMENTE com um array JSON, sem texto antes ou depois, em que cada item tem exatamente estes campos:',
  '{"name": string, "niche": string, "rating": number|null, "reviews": number|null, "phone": string|null, "address": string|null, "website": string|null, "reason": string}',
  '"niche" é a categoria da empresa em português. "phone" vem com DDD (e código do país, se for fora do Brasil). "website" é o site ou a rede social cadastrada, ou null. "reason" explica em uma frase curta por que ela se encaixa no perfil procurado.',
]

function mapsPrompt(scope: string, place: string, niche: string, target: string, count: number) {
  return [
    `Use o Google Maps para encontrar ${count} empresas reais ${SCOPES[scope](place)}.`,
    `Nicho: ${niche || 'qualquer tipo de comércio ou serviço local'}.`,
    `Perfil procurado: ${TARGETS[target]}.`,
    'Só inclua empresas que aparecem no Google Maps e que estão em funcionamento. Não invente empresas nem dados: quando não souber um campo, use null.',
    ...FIELDS,
  ].join('\n')
}

/**
 * Sem o Maps, a busca do Google ainda mostra os perfis de empresa (o mesmo
 * cadastro do Maps: telefone, endereço, nota). O texto pede esses perfis e
 * guias locais, e proíbe completar dados de memória.
 */
function searchPrompt(scope: string, place: string, niche: string, target: string, count: number) {
  const what = niche || 'comércio e serviços locais'
  return [
    `Pesquise no Google por ${what} ${SCOPES[scope](place)} e liste até ${count} empresas reais encontradas nos resultados.`,
    `Faça várias pesquisas, por exemplo: "${what} ${place} telefone", "${what} ${place} endereço", "${what} perto de ${place}", "${what} ${place} instagram".`,
    'Prefira os dados do perfil da empresa no Google (Perfil da Empresa / Google Maps) e, depois, guias locais e listas telefônicas. Ignore anúncios, diretórios nacionais genéricos e empresas de outras cidades.',
    `Perfil procurado: ${TARGETS[target]}.`,
    'Regras: só inclua uma empresa se ela apareceu nos resultados da pesquisa; nunca complete telefone, endereço, nota ou site de memória; quando um campo não apareceu nos resultados, use null. Prefira menos empresas com dados certos a mais empresas com dados inventados.',
    ...FIELDS,
  ].join('\n')
}

interface Source {
  title: string
  uri: string
}

interface Support {
  segment?: { text?: string }
  groundingChunkIndices?: number[]
}

async function askGemini(key: string, model: string, prompt: string, tool: Record<string, unknown>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [tool],
      generationConfig: { temperature: 0.1 },
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? `Gemini respondeu ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  const candidate = data?.candidates?.[0]
  const text = (candidate?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  const meta = candidate?.groundingMetadata ?? {}
  const sources: Source[] = (meta.groundingChunks ?? [])
    .map((c: { maps?: Partial<Source>; web?: Partial<Source> }) => c.maps ?? c.web)
    .filter((s: Partial<Source> | undefined) => s?.uri)
    .map((s: Partial<Source>) => ({ title: s.title ?? '', uri: s.uri as string }))
  // trechos da resposta que o Gemini apoiou em alguma fonte da pesquisa
  const supported = ((meta.groundingSupports ?? []) as Support[])
    .filter((s) => (s.groundingChunkIndices ?? []).length > 0)
    .map((s) => s.segment?.text ?? '')
    .join('\n')
  const searched = (meta.webSearchQueries ?? []).length > 0 || sources.length > 0
  return { text, sources, supported, searched }
}

/** Erros que indicam que a chave não tem cota ou acesso ao Maps (e não um erro passageiro). */
const isAccessError = (error: unknown) => {
  const status = (error as { status?: number })?.status
  const message = error instanceof Error ? error.message : ''
  return status === 429 || status === 403 || /quota|exhausted|not supported|permission|billing/i.test(message)
}

// ---------- conferência do resultado ----------

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const SOCIAL = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|whatsapp\.com|api\.whatsapp\.com|linktr\.ee|tiktok\.com|linkin\.bio|beacons\.ai|bio\.link|taplink\.cc|ifood\.com\.br)$/i

function siteKind(url: string | null): 'none' | 'social' | 'own' {
  if (!url) return 'none'
  try {
    return SOCIAL.test(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname) ? 'social' : 'own'
  } catch {
    return 'none'
  }
}

/** Telefone brasileiro precisa de DDD + 8 ou 9 dígitos; no exterior, de 8 a 15 dígitos. */
function validPhone(phone: unknown, international: boolean): string | null {
  if (typeof phone !== 'string' || !phone.trim() || /^(null|n\/a|-)$/i.test(phone.trim())) return null
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '')
  if (international || phone.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? phone.trim() : null
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  if (local.length !== 10 && local.length !== 11) return null
  if (/^(\d)\1+$/.test(local.slice(2))) return null
  return phone.trim()
}

/** Reaplica o alvo com o que veio: uma empresa com site próprio não entra em "sem site". */
function fitsTarget(target: string, website: string | null, rating: number | null, reviews: number | null) {
  const kind = siteKind(website)
  switch (target) {
    case 'no_website':
      return kind !== 'own'
    case 'no_presence':
      return kind === 'none'
    case 'social_only':
      return kind === 'social'
    case 'few_reviews':
      return reviews === null || reviews < 20 || (rating !== null && rating < 4)
    default:
      return true
  }
}

interface RawLead {
  name?: unknown
  niche?: unknown
  rating?: unknown
  reviews?: unknown
  phone?: unknown
  address?: unknown
  website?: unknown
  reason?: unknown
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|-)$/i.test(v.trim()) ? v.trim() : null)
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function parseArray(answer: string): RawLead[] {
  const start = answer.indexOf('[')
  const end = answer.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const raw = JSON.parse(answer.slice(start, end + 1))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/**
 * Transforma a resposta em leads conferidos. `verified` diz se o nome da
 * empresa aparece numa fonte citada ou num trecho que o Gemini apoiou na
 * pesquisa; na busca do Google, empresa sem telefone, endereço nem site ou rede social é
 * descartada (não há como contatar nem conferir).
 */
function review(answer: string, sources: Source[], supported: string, target: string, international: boolean, engine: 'maps' | 'search') {
  const seen = new Set<string>()
  const support = normalize(supported)
  const leads = []
  let dropped = 0
  for (const item of parseArray(answer)) {
    const name = text(item.name)
    if (!name) continue
    const key = normalize(name)
    if (!key || seen.has(key)) continue
    seen.add(key)

    const phone = validPhone(item.phone, international)
    const address = text(item.address)
    const website = text(item.website)
    const ratingRaw = num(item.rating)
    const rating = ratingRaw !== null && ratingRaw >= 0 && ratingRaw <= 5 ? ratingRaw : null
    const reviewsRaw = num(item.reviews)
    const reviews = reviewsRaw !== null && reviewsRaw >= 0 ? Math.round(reviewsRaw) : null

    if (!fitsTarget(target, website, rating, reviews) || (engine === 'search' && !phone && !address && !website)) {
      dropped++
      continue
    }

    const source = sources.find((s) => {
      const title = normalize(s.title)
      return title.length > 2 && (title === key || title.includes(key) || key.includes(title))
    })
    leads.push({
      name,
      niche: text(item.niche),
      rating,
      reviews,
      phone,
      address,
      website,
      reason: text(item.reason),
      mapsUrl: source && /^https:\/\//i.test(source.uri) && engine === 'maps' ? source.uri : null,
      verified: Boolean(source) || (key.length > 3 && support.includes(key)),
    })
  }
  return { leads, dropped }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  // a chave pública do projeto também passa pela verificação de JWT da
  // plataforma; aqui se exige um usuário de verdade, logado
  const authorization = req.headers.get('Authorization') ?? ''
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, { headers: { Authorization: authorization, apikey } })
  if (!who.ok) return json(401, { error: 'unauthorized', message: 'Entre no sistema para buscar leads.' })

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return json(500, { error: 'missing_key', message: 'A chave do Gemini (GEMINI_API_KEY) não foi cadastrada nos segredos da função.' })

  const body = await req.json().catch(() => ({}))
  const scope = clean(body.scope, 20)
  const target = clean(body.target, 20)
  const place = clean(body.place, 120)
  const niche = clean(body.niche, 120)
  const count = Math.min(Math.max(Number(body.count) || 10, 1), 20)
  if (!SCOPES[scope] || !TARGETS[target] || place.length < 2) {
    return json(400, { error: 'invalid_request', message: 'Informe onde buscar e o perfil das empresas.' })
  }

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
  const international = scope === 'international'

  let mapsError: string | undefined
  if (Date.now() >= mapsPausedUntil) {
    try {
      const maps = await askGemini(key, model, mapsPrompt(scope, place, niche, target, count), { googleMaps: {} })
      const { leads, dropped } = review(maps.text, maps.sources, maps.supported, target, international, 'maps')
      if (leads.length > 0) return json(200, { engine: 'maps', leads: leads.slice(0, count), dropped })
      mapsError = 'O Google Maps não trouxe empresas para esta busca.'
    } catch (error) {
      mapsError = error instanceof Error ? error.message : String(error)
      console.error('googleMaps falhou:', mapsError)
      if (isAccessError(error)) {
        mapsPausedUntil = Date.now() + MAPS_PAUSE_MS
        mapsPauseReason = mapsError
      }
    }
  } else {
    mapsError = mapsPauseReason
  }

  try {
    // pede uma folga: parte das empresas cai na conferência
    const search = await askGemini(key, model, searchPrompt(scope, place, niche, target, Math.min(count + 5, 25)), { googleSearch: {} })
    const { leads, dropped } = review(search.text, search.sources, search.supported, target, international, 'search')
    // as conferidas primeiro
    leads.sort((a, b) => Number(b.verified) - Number(a.verified))
    return json(200, { engine: 'search', mapsError: mapsError?.slice(0, 300), searched: search.searched, leads: leads.slice(0, count), dropped })
  } catch (error) {
    return json(502, { error: 'gemini_failed', message: error instanceof Error ? error.message : 'O Gemini não respondeu.' })
  }
})
