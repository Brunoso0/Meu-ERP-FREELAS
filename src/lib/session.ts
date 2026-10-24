import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { supabase } from './supabase'

/*
 * Regras da sessão. O Supabase renova o acesso sozinho para sempre (o token de
 * renovação não vence no plano gratuito), então o limite é aplicado aqui:
 * 15 minutos sem usar o app (tocar, clicar, digitar, rolar) encerram a sessão,
 * com o app aberto ou fechado. Para voltar, a biometria (se ativada neste
 * aparelho) ou e-mail e senha.
 */
export const IDLE_LOGOUT_MS = 15 * 60 * 1000

const KEY = 'meu-erp-freelas:auth'
const LAST_ACTIVE = `${KEY}:last-active`
const EXPIRED = `${KEY}:expired`
const BIOMETRIC = `${KEY}:biometric`

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* armazenamento bloqueado: a sessão segue só com as regras do Supabase */
  }
}

export const markActive = () => write(LAST_ACTIVE, String(Date.now()))
export const clearSessionMarks = () => write(LAST_ACTIVE, null)

/**
 * Passou do limite sem uso? Sessão sem marca também conta como vencida: todo
 * login grava a marca antes de entrar, então faltar marca é sessão antiga ou
 * um encerramento interrompido no meio (app fechado durante a saída).
 */
export function sessionIdle() {
  const last = Number(read(LAST_ACTIVE))
  return !last || Date.now() - last > IDLE_LOGOUT_MS
}

/** A tela de login avisa uma vez que a sessão venceu (sobrevive ao recarregar). */
export function takeExpiredNotice() {
  try {
    const notice = sessionStorage.getItem(EXPIRED)
    sessionStorage.removeItem(EXPIRED)
    return Boolean(notice)
  } catch {
    return false
  }
}

/** Encerra a sessão deste aparelho (os outros continuam) e avisa na tela de login. */
export async function expireSession() {
  clearSessionMarks()
  try {
    sessionStorage.setItem(EXPIRED, '1')
  } catch {
    /* sem o aviso, a tela de login aparece do mesmo jeito */
  }
  const result = await supabase?.auth.signOut({ scope: 'local' })
  // sem internet o Supabase devolve erro e mantém a sessão guardada: apaga à mão e recomeça
  if (result?.error) {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
        .forEach((key) => localStorage.removeItem(key))
    } catch {
      /* sem acesso ao armazenamento não há sessão guardada para apagar */
    }
    location.reload()
  }
}

/* ---------------- biometria (WebAuthn: digital, rosto ou bloqueio de tela do aparelho) ---------------- */

/** O que fica neste aparelho: qual credencial pedir e de quem é. A chave privada fica no próprio aparelho. */
export interface BiometricDevice {
  credentialId: string
  userId: string
  email: string
}

export function biometricDevice(): BiometricDevice | null {
  try {
    const device = JSON.parse(read(BIOMETRIC) || 'null') as BiometricDevice | null
    return device?.credentialId ? device : null
  } catch {
    return null
  }
}

/** O aparelho tem digital, rosto ou bloqueio de tela que o navegador consegue usar. */
export async function biometricAvailable() {
  try {
    return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable())
  } catch {
    return false
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('A biometria só funciona com o Supabase configurado.')
  const { data, error } = await supabase.functions.invoke('webauthn', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = await context?.json?.().catch(() => null)
    if (detail?.error === 'credential_not_found') write(BIOMETRIC, null)
    if (!detail && context?.status === 404) throw new Error('A função de biometria (webauthn) ainda não foi publicada no Supabase.')
    throw new Error(detail?.message ?? error.message)
  }
  return data as T
}

/** Nome do aparelho para identificar a credencial (ex.: "Android · Chrome"). */
function deviceName() {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Aparelho'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'navegador'
  return `${os} · ${browser}`
}

/** Cadastra a biometria deste aparelho para quem está logado. Chamar a partir de um toque/clique. */
export async function enableBiometric(user: { id: string; email?: string }) {
  const { options, challengeId } = await invoke<{ options: any; challengeId: string }>({ action: 'register-options' })
  const response = await startRegistration({ optionsJSON: options })
  const { credentialId } = await invoke<{ credentialId: string }>({ action: 'register-verify', challengeId, response, device: deviceName() })
  write(BIOMETRIC, JSON.stringify({ credentialId, userId: user.id, email: user.email ?? '' } satisfies BiometricDevice))
}

/** Desliga neste aparelho: apaga a credencial no servidor (não serve mais para entrar) e aqui. */
export async function disableBiometric() {
  const device = biometricDevice()
  if (device && supabase) {
    const { error } = await supabase.from('webauthn_credentials').delete().eq('id', device.credentialId)
    if (error) throw new Error(error.message)
  }
  write(BIOMETRIC, null)
}

/** Entra com a biometria: o aparelho assina o desafio, o servidor confere e devolve um token de uso único. */
export async function signInWithBiometric() {
  if (!supabase) throw new Error('A biometria só funciona com o Supabase configurado.')
  const device = biometricDevice()
  if (!device) throw new Error('Biometria não ativada neste aparelho.')
  const { options, challengeId } = await invoke<{ options: any; challengeId: string }>({ action: 'login-options', credentialId: device.credentialId })
  const response = await startAuthentication({ optionsJSON: options })
  const { tokenHash } = await invoke<{ tokenHash: string }>({ action: 'login-verify', challengeId, response })
  markActive()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (error) throw new Error(error.message)
}

/** Cancelar o pedido do sistema (ou o tempo acabar) não é erro que precise de aviso. */
export const isBiometricCancel = (error: unknown) => error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')
