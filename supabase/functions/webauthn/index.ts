// =====================================================================
// webauthn: login com biometria (digital, rosto ou bloqueio de tela do
// aparelho), no padrão WebAuthn/passkey.
//
// Ações (POST, corpo JSON com `action`):
//   register-options / register-verify  → usuário logado (JWT) cadastra
//                                         a biometria deste aparelho.
//   login-options / login-verify        → sem login: o aparelho assina o
//                                         desafio; conferida a assinatura,
//                                         devolve um token de uso único que
//                                         o app troca por uma sessão
//                                         (supabase.auth.verifyOtp).
//
// Tabelas na migração 018. Publicar com "Verify JWT" DESLIGADO: o login
// acontece justamente sem sessão; o cadastro valida o JWT aqui dentro.
// =====================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@14.0.3'
import { isoBase64URL } from 'npm:@simplewebauthn/server@14.0.3/helpers'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const RP_NAME = 'Meu ERP Freelas'
/** Onde o app roda. A credencial fica presa ao domínio em que foi criada. */
const ORIGINS = ['https://meus-freelas.pages.dev', 'http://localhost:5173', 'http://localhost:5199']
const CHALLENGE_TTL_MS = 5 * 60 * 1000

class Problem extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'webauthn_failed') {
    super(message)
  }
}

function originOf(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  if (!ORIGINS.includes(origin)) throw new Problem('Origem não permitida.', 403)
  return { origin, rpID: new URL(origin).hostname }
}

async function userOf(req: Request) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data } = await admin.auth.getUser(jwt)
  if (!data?.user) throw new Problem('Entre no sistema para ativar a biometria.', 401, 'unauthorized')
  return data.user
}

async function saveChallenge(challenge: string, kind: 'register' | 'login', userId: string | null) {
  // aproveita para limpar os vencidos
  await admin.from('webauthn_challenges').delete().lt('created_at', new Date(Date.now() - CHALLENGE_TTL_MS).toISOString())
  const { data, error } = await admin.from('webauthn_challenges').insert({ challenge, kind, user_id: userId }).select('id').single()
  if (error) throw error
  return data.id as string
}

/** Desafio de uso único: some na primeira leitura, vencido ou não. */
async function takeChallenge(id: unknown, kind: 'register' | 'login') {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Problem('Pedido inválido.')
  const { data } = await admin.from('webauthn_challenges').delete().eq('id', id).eq('kind', kind).select('challenge, user_id, created_at').maybeSingle()
  if (!data || Date.now() - new Date(data.created_at).getTime() > CHALLENGE_TTL_MS) throw new Problem('O pedido venceu. Tente de novo.', 400, 'challenge_expired')
  return data as { challenge: string; user_id: string | null }
}

async function registerOptions(req: Request) {
  const { rpID } = originOf(req)
  const user = await userOf(req)
  const { data: existing } = await admin.from('webauthn_credentials').select('id, transports').eq('user_id', user.id)
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email ?? user.id,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
  })
  return { options, challengeId: await saveChallenge(options.challenge, 'register', user.id) }
}

async function registerVerify(req: Request, body: Record<string, any>) {
  const { origin, rpID } = originOf(req)
  const user = await userOf(req)
  const challenge = await takeChallenge(body.challengeId, 'register')
  if (challenge.user_id !== user.id) throw new Problem('Pedido inválido.')
  const result = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch((e) => {
    throw new Problem(`Não foi possível conferir a biometria: ${e instanceof Error ? e.message : e}`)
  })
  if (!result.verified) throw new Problem('O aparelho não confirmou a biometria.')
  const { credential } = result.registrationInfo
  const { error } = await admin.from('webauthn_credentials').upsert({
    id: credential.id,
    user_id: user.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device: typeof body.device === 'string' ? body.device.slice(0, 120) : null,
  })
  if (error) throw error
  return { credentialId: credential.id }
}

async function loginOptions(req: Request, body: Record<string, any>) {
  const { rpID } = originOf(req)
  // com o id guardado no aparelho, o sistema já sabe qual credencial pedir
  const id = typeof body.credentialId === 'string' && body.credentialId.length <= 1024 ? body.credentialId : null
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: id ? [{ id, transports: ['internal', 'hybrid'] }] : [],
  })
  return { options, challengeId: await saveChallenge(options.challenge, 'login', null) }
}

async function loginVerify(req: Request, body: Record<string, any>) {
  const { origin, rpID } = originOf(req)
  const challenge = await takeChallenge(body.challengeId, 'login')
  const id = body.response?.id
  if (typeof id !== 'string') throw new Problem('Pedido inválido.')
  const { data: stored } = await admin.from('webauthn_credentials').select('id, user_id, public_key, counter, transports').eq('id', id).maybeSingle()
  if (!stored) throw new Problem('Esta biometria não está mais cadastrada. Entre com e-mail e senha e ative de novo.', 404, 'credential_not_found')

  const result = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: stored.id, publicKey: isoBase64URL.toBuffer(stored.public_key), counter: Number(stored.counter), transports: stored.transports },
  }).catch((e) => {
    throw new Problem(`Não foi possível conferir a biometria: ${e instanceof Error ? e.message : e}`, 401)
  })
  if (!result.verified) throw new Problem('A biometria não confere.', 401)

  await admin
    .from('webauthn_credentials')
    .update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('id', stored.id)

  // token de uso único (o mesmo de um link mágico, sem enviar e-mail); o app troca por sessão
  const { data: found } = await admin.auth.admin.getUserById(stored.user_id)
  const email = found?.user?.email
  if (!email) throw new Problem('Usuário não encontrado.', 404)
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !link?.properties?.hashed_token) throw new Problem('Não foi possível abrir a sessão.', 500)
  return { tokenHash: link.properties.hashed_token, email }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'register-options') return json(200, await registerOptions(req))
    if (body.action === 'register-verify') return json(200, await registerVerify(req, body))
    if (body.action === 'login-options') return json(200, await loginOptions(req, body))
    if (body.action === 'login-verify') return json(200, await loginVerify(req, body))
    return json(400, { error: 'invalid_action', message: 'Ação desconhecida.' })
  } catch (error) {
    if (error instanceof Problem) return json(error.status, { error: error.code, message: error.message })
    console.error(error)
    return json(500, { error: 'webauthn_failed', message: error instanceof Error ? error.message : 'Erro inesperado.' })
  }
})
