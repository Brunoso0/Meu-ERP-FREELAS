// =====================================================================
// find-leads: busca empresas no Google Maps por meio do Gemini.
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

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\r\n`]+/g, ' ').trim().slice(0, max)

function buildPrompt(scope: string, place: string, niche: string, target: string, count: number) {
  return [
    `Use o Google Maps para encontrar ${count} empresas reais ${SCOPES[scope](place)}.`,
    `Nicho: ${niche || 'qualquer tipo de comércio ou serviço local'}.`,
    `Perfil procurado: ${TARGETS[target]}.`,
    'Só inclua empresas que aparecem no Google Maps e que estão em funcionamento. Não invente empresas nem dados: quando não souber um campo, use null.',
    'Responda SOMENTE com um array JSON, sem texto antes ou depois, em que cada item tem exatamente estes campos:',
    '{"name": string, "niche": string, "rating": number|null, "reviews": number|null, "phone": string|null, "address": string|null, "website": string|null, "reason": string}',
    '"niche" é a categoria da empresa em português. "phone" vem com DDD (e código do país, se for fora do Brasil). "website" é o site ou a rede social cadastrada, ou null. "reason" explica em uma frase curta por que ela se encaixa no perfil procurado.',
  ].join('\n')
}

async function askGemini(key: string, model: string, prompt: string, tool: Record<string, unknown>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [tool],
      generationConfig: { temperature: 0.2 },
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error?.message ?? `Gemini respondeu ${response.status}`)
  const candidate = data?.candidates?.[0]
  const text = (candidate?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((c: { maps?: { title?: string; uri?: string }; web?: { title?: string; uri?: string } }) => c.maps ?? c.web)
    .filter((s: { uri?: string } | undefined) => s?.uri)
    .map((s: { title?: string; uri: string }) => ({ title: s.title ?? '', uri: s.uri }))
  return { text, sources }
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
  const prompt = buildPrompt(scope, place, niche, target, count)
  try {
    try {
      return json(200, { engine: 'maps', ...(await askGemini(key, model, prompt, { googleMaps: {} })) })
    } catch (mapsError) {
      // chave sem acesso à busca no Maps: tenta pela busca do Google
      console.error('googleMaps falhou:', mapsError)
      return json(200, { engine: 'search', mapsError: mapsError instanceof Error ? mapsError.message : String(mapsError), ...(await askGemini(key, model, prompt, { googleSearch: {} })) })
    }
  } catch (error) {
    return json(502, { error: 'gemini_failed', message: error instanceof Error ? error.message : 'O Gemini não respondeu.' })
  }
})
