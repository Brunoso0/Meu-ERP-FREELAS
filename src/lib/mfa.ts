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

/** Erro da função `mfa`, com o código que ela devolveu (ex.: device_unknown). */
export class MfaError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke('mfa', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = await context?.json?.().catch(() => null)
    if (!detail && context?.status === 404) throw new MfaError('A função de recuperação (mfa) ainda não foi publicada no Supabase.')
    throw new MfaError(detail?.message || 'Não foi possível concluir. Tente de novo.', detail?.error)
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

/* ---------------- aparelho confiável: o código só é pedido no primeiro login de cada aparelho ---------------- */

export const TRUST_DAYS = 30
const deviceKey = (userId: string) => `krono:mfa-device:${userId}`

interface StoredDevice {
  token: string
  deviceId: string
}

function readDevice(userId: string): StoredDevice | null {
  try {
    const stored = JSON.parse(localStorage.getItem(deviceKey(userId)) || 'null') as StoredDevice | null
    return stored?.token ? stored : null
  } catch {
    return null
  }
}

function writeDevice(userId: string, value: StoredDevice | null) {
  try {
    if (value) localStorage.setItem(deviceKey(userId), JSON.stringify(value))
    else localStorage.removeItem(deviceKey(userId))
  } catch {
    /* armazenamento bloqueado: o código volta a ser pedido em todo login */
  }
}

export const currentDeviceId = (userId: string) => readDevice(userId)?.deviceId ?? null

/** "Chrome no Windows": só para a pessoa reconhecer o aparelho na lista. */
export function deviceLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return system ? `${browser} no ${system}` : browser
}

/** Chamar logo depois de confirmar o código: este aparelho passa a ser reconhecido por 30 dias. */
export async function trustThisDevice(userId: string) {
  const { token, deviceId } = await invoke<{ token: string; deviceId: string }>({ action: 'trust', label: deviceLabel() })
  writeDevice(userId, { token, deviceId })
}

/** O id do login (sessão) que o Supabase põe no JWT. */
export function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}

/** Login em aparelho já confiável: a função marca esta sessão como confiável e o código não é pedido. */
export async function trustSession(userId: string): Promise<boolean> {
  const device = readDevice(userId)
  if (!device) return false
  try {
    await invoke({ action: 'trust-session', token: device.token })
    return true
  } catch (error) {
    // aparelho esquecido ou vencido: o segredo guardado não serve mais
    if (error instanceof MfaError && error.code === 'device_unknown') writeDevice(userId, null)
    return false
  }
}

export interface TrustedDevice {
  id: string
  label: string | null
  created_at: string
  last_used_at: string | null
  expires_at: string
}

export const trustedDevices = () => invoke<{ devices: TrustedDevice[] }>({ action: 'devices' }).then((r) => r.devices)

/** Esquece um aparelho (ou todos, sem id): nele o código volta a ser pedido no próximo login. */
export async function forgetDevice(userId: string, id?: string) {
  await invoke({ action: 'forget', id })
  const mine = readDevice(userId)
  if (!id || mine?.deviceId === id) writeDevice(userId, null)
}
