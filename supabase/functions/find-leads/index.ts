// =====================================================================
// find-leads: busca empresas no Google Maps pela Places API (New).
//
// Os dados vêm direto do Google Maps (nome, telefone, site, avaliações e o
// link do perfil): nada passa por IA, então não há empresa inventada nem
// resultado da busca comum do Google. O alvo (sem site, só rede social,
// poucas avaliações...) é filtrado aqui, pelos dados do próprio perfil.
//
// A chave fica só aqui, como segredo da função, e nunca vai para o navegador.
// A função só atende quem está logado no app.
//
// Segredos (Edge Functions → Secrets):
//   GOOGLE_PLACES_API_KEY  obrigatório, chave do Google Cloud com a
//                          "Places API (New)" ativada
// =====================================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SCOPES = ['city', 'region', 'other_region', 'country', 'international']
const TARGETS = ['no_website', 'no_presence', 'social_only', 'few_reviews', 'any']

/** Cada página da Places API traz até 20 empresas e é cobrada como uma chamada. */
const MAX_PAGES = 3

const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'nextPageToken',
].join(',')

interface Place {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
  primaryTypeDisplayName?: { text?: string }
  businessStatus?: string
}

const SOCIAL = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|whatsapp\.com|linktr\.ee|tiktok\.com|linkin\.bio|beacons\.ai|bio\.link|taplink\.cc|ifood\.com\.br)$/i

function isSocial(url: string) {
  try {
    return SOCIAL.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Diz se a empresa se encaixa no alvo e por quê, só com o que está no perfil do Maps. */
function match(target: string, p: Place): string | null {
  const site = p.websiteUri ?? null
  const social = site !== null && isSocial(site)
  const reviews = p.userRatingCount ?? 0
  switch (target) {
    case 'no_website':
      if (!site) return 'Sem site cadastrado no perfil do Google Maps.'
      return social ? 'No lugar de um site, o perfil aponta só para uma rede social.' : null
    case 'no_presence':
      return site ? null : 'Nenhum site nem rede social cadastrados no perfil do Google Maps.'
    case 'social_only':
      return social ? 'Usa só uma rede social como endereço na web, sem site próprio.' : null
    case 'few_reviews':
      if (reviews < 20) return reviews === 0 ? 'Ainda sem avaliações no Google.' : `Só ${reviews} ${reviews === 1 ? 'avaliação' : 'avaliações'} no Google.`
      return p.rating !== undefined && p.rating < 4 ? `Nota ${p.rating.toLocaleString('pt-BR')} no Google, abaixo de 4.` : null
    default:
      if (!site) return 'Sem site cadastrado no perfil do Google Maps.'
      return social ? 'O perfil aponta só para uma rede social.' : 'Já tem site cadastrado no perfil.'
  }
}

function query(scope: string, place: string, niche: string) {
  const what = niche || 'comércio e serviços'
  return scope === 'region' ? `${what} na região de ${place}` : `${what} em ${place}`
}

async function searchPage(key: string, body: Record<string, unknown>) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error?.message ?? `O Google Maps respondeu ${response.status}`)
  return { places: (data?.places ?? []) as Place[], next: (data?.nextPageToken as string | undefined) ?? null }
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

  const key = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!key) return json(500, { error: 'missing_key', message: 'A chave do Google Maps (GOOGLE_PLACES_API_KEY) não foi cadastrada nos segredos da função.' })

  const body = await req.json().catch(() => ({}))
  const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max)
  const scope = clean(body.scope, 20)
  const target = clean(body.target, 20)
  const place = clean(body.place, 120)
  const niche = clean(body.niche, 120)
  const count = Math.min(Math.max(Number(body.count) || 10, 1), 20)
  if (!SCOPES.includes(scope) || !TARGETS.includes(target) || place.length < 2) {
    return json(400, { error: 'invalid_request', message: 'Informe onde buscar e o perfil das empresas.' })
  }

  const international = scope === 'international'
  const request: Record<string, unknown> = { textQuery: query(scope, place, niche), languageCode: 'pt-BR', pageSize: 20 }
  if (!international) request.regionCode = 'BR'

  const leads = []
  let scanned = 0
  try {
    let token: string | null = null
    for (let page = 0; page < MAX_PAGES && leads.length < count; page++) {
      const { places, next } = await searchPage(key, token ? { ...request, pageToken: token } : request)
      scanned += places.length
      for (const p of places) {
        if (leads.length >= count) break
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue
        const reason = match(target, p)
        if (!reason) continue
        leads.push({
          name: p.displayName?.text ?? 'Sem nome',
          niche: p.primaryTypeDisplayName?.text ?? null,
          rating: p.rating ?? null,
          reviews: p.userRatingCount ?? null,
          phone: (international ? p.internationalPhoneNumber : p.nationalPhoneNumber) ?? p.internationalPhoneNumber ?? null,
          address: p.formattedAddress ?? null,
          website: p.websiteUri ?? null,
          reason,
          mapsUrl: p.googleMapsUri ?? null,
          placeId: p.id,
        })
      }
      if (!next) break
      token = next
    }
  } catch (error) {
    console.error('places falhou:', error)
    return json(502, { error: 'places_failed', message: `O Google Maps recusou a busca: ${error instanceof Error ? error.message : 'sem resposta'}` })
  }

  return json(200, { engine: 'maps', leads, scanned })
})
