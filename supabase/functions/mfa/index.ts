// =====================================================================
// mfa: códigos de recuperação da verificação em duas etapas.
//
// O código do app autenticador (TOTP) é do próprio Supabase Auth. Esta função
// cuida do que ele não tem: o que fazer quando a pessoa perde o celular.
//
// Ações (POST, corpo JSON com `action`, sempre com o JWT de quem está logado):
//   status    → quantos códigos de recuperação ainda valem.
//   generate  → cria 8 códigos novos (os antigos deixam de valer). Só com a
//               sessão já confirmada pelo código (aal2) e o fator ativo.
//               Os códigos aparecem uma única vez: aqui fica só o hash.
//   trust     → só com a sessão confirmada (aal2): cria um segredo para ESTE aparelho
//               (fica 30 dias; guardamos só o hash) e o devolve uma única vez.
//   trust-session → { token }: no login seguinte, com a senha correta e o segredo do
//               aparelho, marca a sessão atual como confiável: o banco a aceita sem
//               pedir o código de novo. Segredo desconhecido ou vencido: o código volta.
//   devices   → lista os aparelhos confiáveis. forget → { id? } esquece um (ou todos).
//   recover   → { code }: com senha (aal1) e um código de recuperação válido,
//               remove a verificação em duas etapas para a pessoa entrar e
//               configurar de novo. O código usado e os demais deixam de valer.
//               Erros seguidos travam por 15 minutos.
//
// Tabelas na migração 030 (sem política para o app: só esta função mexe).
// Publicar com "Verify JWT" LIGADO.
// =====================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const CODE_COUNT = 8
const CODE_LENGTH = 10
// sem 0, O, 1, I: nada que se confunda ao copiar do papel
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TRUST_DAYS = 30
const TRUST_MS = TRUST_DAYS * 24 * 60 * 60 * 1000
const MAX_DEVICES = 10
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

class Problem extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'mfa_failed') {
    super(message)
  }
}

function tokenOf(req: Request) {
  return (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
}

/** O gateway já conferiu a assinatura do JWT; aqui só se lê o nível da sessão (aal1 ou aal2). */
function aalOf(jwt: string): 'aal1' | 'aal2' {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.aal === 'aal2' ? 'aal2' : 'aal1'
  } catch {
    return 'aal1'
  }
}

/** O id do login (sessão) vem no JWT: é a ele que a confiança do aparelho fica presa. */
function sessionIdOf(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(payload.session_id) ? payload.session_id : null
  } catch {
    return null
  }
}

async function userOf(jwt: string) {
  const { data } = await admin.auth.getUser(jwt)
  if (!data?.user) throw new Problem('Entre no sistema para continuar.', 401, 'unauthorized')
  return data.user
}

async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')
const hashOf = (userId: string, code: string) => sha256(`${userId}:${normalize(code)}`)

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]) // 256 é múltiplo de 32: sem viés
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`
}

async function verifiedFactors(userId: string) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId })
  if (error) throw error
  return (data?.factors ?? []).filter((f) => f.status === 'verified')
}

async function status(userId: string) {
  const { count } = await admin.from('mfa_recovery_codes').select('code_hash', { count: 'exact', head: true }).eq('user_id', userId).is('used_at', null)
  return { remaining: count ?? 0 }
}

async function generate(userId: string, aal: string) {
  if (aal !== 'aal2') throw new Problem('Confirme com o código do aplicativo para gerar os códigos de recuperação.', 403, 'aal2_required')
  if (!(await verifiedFactors(userId)).length) throw new Problem('Ative a verificação em duas etapas antes de gerar os códigos.', 400, 'no_factor')
  const codes = Array.from({ length: CODE_COUNT }, newCode)
  const rows = await Promise.all(codes.map(async (code) => ({ user_id: userId, code_hash: await hashOf(userId, code) })))
  const del = await admin.from('mfa_recovery_codes').delete().eq('user_id', userId)
  if (del.error) throw del.error
  const ins = await admin.from('mfa_recovery_codes').insert(rows)
  if (ins.error) throw ins.error
  return { codes }
}

function newDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const deviceHash = (userId: string, token: string) => sha256(`device:${userId}:${token}`)

async function trust(userId: string, aal: string, label: unknown) {
  if (aal !== 'aal2') throw new Problem('Confirme com o código do aplicativo antes de confiar neste aparelho.', 403, 'aal2_required')
  if (!(await verifiedFactors(userId)).length) throw new Problem('Ative a verificação em duas etapas antes.', 400, 'no_factor')
  const now = new Date()
  // limpa os vencidos e mantém no máximo MAX_DEVICES (os mais antigos saem primeiro)
  await admin.from('mfa_trusted_devices').delete().eq('user_id', userId).lt('expires_at', now.toISOString())
  const { data: current } = await admin.from('mfa_trusted_devices').select('id').eq('user_id', userId).order('created_at', { ascending: false })
  const extra = (current ?? []).slice(MAX_DEVICES - 1).map((d) => d.id as string)
  if (extra.length) await admin.from('mfa_trusted_devices').delete().in('id', extra)

  const token = newDeviceToken()
  const expiresAt = new Date(now.getTime() + TRUST_MS).toISOString()
  const { data, error } = await admin
    .from('mfa_trusted_devices')
    .insert({ user_id: userId, token_hash: await deviceHash(userId, token), label: typeof label === 'string' ? label.slice(0, 80) : null, expires_at: expiresAt })
    .select('id')
    .single()
  if (error) throw error
  return { token, deviceId: data.id as string, expiresAt }
}

async function trustSession(userId: string, jwt: string, token: unknown) {
  const sessionId = sessionIdOf(jwt)
  if (!sessionId) throw new Problem('Sessão inválida.', 401, 'unauthorized')
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new Problem('Aparelho não reconhecido.', 403, 'device_unknown')
  const { data: device } = await admin.from('mfa_trusted_devices').select('id, expires_at').eq('user_id', userId).eq('token_hash', await deviceHash(userId, token)).maybeSingle()
  if (!device || new Date(device.expires_at).getTime() <= Date.now()) throw new Problem('Aparelho não reconhecido.', 403, 'device_unknown')
  // limpa as sessões confiáveis vencidas
  await admin.from('mfa_trusted_sessions').delete().eq('user_id', userId).lt('expires_at', new Date().toISOString())
  const { error } = await admin.from('mfa_trusted_sessions').upsert({ session_id: sessionId, user_id: userId, device_id: device.id, expires_at: device.expires_at })
  if (error) throw error
  await admin.from('mfa_trusted_devices').update({ last_used_at: new Date().toISOString() }).eq('id', device.id)
  return { ok: true }
}

async function devices(userId: string) {
  const { data, error } = await admin
    .from('mfa_trusted_devices')
    .select('id, label, created_at, last_used_at, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return { devices: data ?? [] }
}

async function forget(userId: string, id: unknown) {
  let query = admin.from('mfa_trusted_devices').delete().eq('user_id', userId)
  if (typeof id === 'string') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Problem('Pedido inválido.')
    query = query.eq('id', id)
  }
  const { error } = await query
  if (error) throw error
  return { ok: true }
}

async function recover(userId: string, code: unknown) {
  if (typeof code !== 'string' || normalize(code).length !== CODE_LENGTH) throw new Problem('Digite o código de recuperação completo (10 letras e números).', 400, 'invalid_code')

  const since = new Date(Date.now() - LOCK_MS).toISOString()
  const { count: fails } = await admin.from('mfa_recovery_attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since)
  if ((fails ?? 0) >= MAX_FAILS) throw new Problem('Muitas tentativas erradas. Tente de novo em 15 minutos.', 429, 'locked')

  const hash = await hashOf(userId, code)
  // o `used_at is null` na própria exclusão garante uso único mesmo com duas chamadas ao mesmo tempo
  const { data: used, error } = await admin.from('mfa_recovery_codes').delete().eq('user_id', userId).eq('code_hash', hash).is('used_at', null).select('code_hash')
  if (error) throw error
  if (!used?.length) {
    await admin.from('mfa_recovery_attempts').insert({ user_id: userId })
    throw new Problem('Código de recuperação inválido ou já usado.', 400, 'invalid_code')
  }

  for (const factor of (await admin.auth.admin.mfa.listFactors({ userId })).data?.factors ?? []) {
    const { error: removeError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId })
    if (removeError) throw removeError
  }
  await admin.from('mfa_recovery_codes').delete().eq('user_id', userId)
  await admin.from('mfa_recovery_attempts').delete().eq('user_id', userId)
  await admin.from('mfa_trusted_devices').delete().eq('user_id', userId)
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  try {
    const jwt = tokenOf(req)
    const user = await userOf(jwt)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    switch (body.action) {
      case 'status':
        return json(200, await status(user.id))
      case 'generate':
        return json(200, await generate(user.id, aalOf(jwt)))
      case 'trust':
        return json(200, await trust(user.id, aalOf(jwt), body.label))
      case 'trust-session':
        return json(200, await trustSession(user.id, jwt, body.token))
      case 'devices':
        return json(200, await devices(user.id))
      case 'forget':
        return json(200, await forget(user.id, body.id))
      case 'recover':
        return json(200, await recover(user.id, body.code))
      default:
        throw new Problem('Ação desconhecida.')
    }
  } catch (e) {
    if (e instanceof Problem) return json(e.status, { error: e.code, message: e.message })
    console.error('mfa', e)
    return json(500, { error: 'internal', message: 'Não foi possível concluir. Tente de novo.' })
  }
})
