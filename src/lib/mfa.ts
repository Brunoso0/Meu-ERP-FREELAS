import { supabase } from './supabase'

/*
 * Verificação em duas etapas: o código de 6 dígitos do app autenticador (TOTP) é do
 * próprio Supabase Auth. Os códigos de recuperação (para quem perder o celular) ficam
 * na função de borda `mfa`, que guarda só o hash deles.
 */

function client() {
  if (!supabase) throw new Error('A verificação em duas etapas só funciona com o Supabase configurado.')
  return supabase
}

/** O fator de app autenticador já confirmado, se houver. */
export async function activeFactor() {
  const { data, error } = await client().auth.mfa.listFactors()
  if (error) throw error
  return data.totp.find((f) => f.status === 'verified') ?? null
}

export interface Enrollment {
  factorId: string
  qrCode: string
  secret: string
}

/** Começa a ativação: devolve o QR Code e a chave para digitar. Só vale depois de confirmar com um código. */
export async function startEnrollment(): Promise<Enrollment> {
  const auth = client().auth.mfa
  // sobras de uma ativação que ficou pela metade atrapalhariam a nova
  const { data: list } = await auth.listFactors()
  for (const f of list?.all ?? []) if (f.status === 'unverified') await auth.unenroll({ factorId: f.id })
  const { data, error } = await auth.enroll({ factorType: 'totp', friendlyName: 'Aplicativo autenticador', issuer: 'Krono' })
  if (error) throw error
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

/** Confere o código de 6 dígitos (na ativação e no login): a sessão passa a valer como confirmada. */
export async function verifyCode(factorId: string, code: string) {
  const { error } = await client().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
  if (error) throw error
}

export async function disableTwoFactor(factorId: string) {
  const { error } = await client().auth.mfa.unenroll({ factorId })
  if (error) throw error
}

export function cancelEnrollment(factorId: string) {
  return client().auth.mfa.unenroll({ factorId })
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke('mfa', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = await context?.json?.().catch(() => null)
    if (!detail && context?.status === 404) throw new Error('A função de recuperação (mfa) ainda não foi publicada no Supabase.')
    throw new Error(detail?.message || 'Não foi possível concluir. Tente de novo.')
  }
  return data as T
}

/** Gera 8 códigos novos (os anteriores deixam de valer). Aparecem uma única vez. */
export const generateRecoveryCodes = () => invoke<{ codes: string[] }>({ action: 'generate' }).then((r) => r.codes)

/** Quantos códigos de recuperação ainda valem. */
export const recoveryCodesLeft = () => invoke<{ remaining: number }>({ action: 'status' }).then((r) => r.remaining)

/** Perdeu o celular: com a senha e um código de recuperação, a verificação é desligada para entrar e ativar de novo. */
export async function recoverWithCode(code: string) {
  await invoke({ action: 'recover', code })
  // a sessão guardada ainda lembra do fator removido: renova para o app liberar a entrada
  const { error } = await client().auth.refreshSession()
  if (error) throw error
}
