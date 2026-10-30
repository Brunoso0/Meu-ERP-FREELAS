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
