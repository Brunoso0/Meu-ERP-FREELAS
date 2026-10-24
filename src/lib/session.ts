import { create } from 'zustand'
import { supabase } from './supabase'

/*
 * Regras da sessão. O Supabase renova o acesso sozinho para sempre (o token de
 * renovação não vence no plano gratuito), então o limite é aplicado aqui:
 *
 * - 30 dias depois de entrar com a senha, pede a senha de novo;
 * - sem biometria, 12 horas sem usar o app encerram a sessão;
 * - com biometria, o app bloqueia ao abrir, depois de 5 minutos fora dele ou
 *   15 minutos parado na tela, e a digital/rosto do aparelho desbloqueia.
 */
export const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000
export const IDLE_LOGOUT_MS = 12 * 60 * 60 * 1000
export const LOCK_AWAY_MS = 5 * 60 * 1000
export const LOCK_IDLE_MS = 15 * 60 * 1000

const KEY = 'meu-erp-freelas:auth'
const LOGIN_AT = `${KEY}:login-at`
const LAST_ACTIVE = `${KEY}:last-active`
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
const readTime = (key: string) => Number(read(key)) || 0

export const markLogin = () => {
  write(LOGIN_AT, String(Date.now()))
  write(LAST_ACTIVE, String(Date.now()))
}
export const markActive = () => write(LAST_ACTIVE, String(Date.now()))
export const lastActive = () => readTime(LAST_ACTIVE)

/** Sessões abertas antes desta regra não têm data de entrada: contam a partir de agora. */
export function loginAt() {
  const at = readTime(LOGIN_AT)
  if (at) return at
  markLogin()
  return Date.now()
}

export type SessionVerdict = 'ok' | 'lock' | 'expired'

/** O que fazer com a sessão agora: seguir, bloquear (biometria) ou encerrar. */
export function judgeSession(userId: string, { away }: { away: boolean }): SessionVerdict {
  const now = Date.now()
  if (now - loginAt() > SESSION_MAX_MS) return 'expired'
  const idle = now - (lastActive() || now)
  if (biometricFor(userId)) return idle > (away ? LOCK_AWAY_MS : LOCK_IDLE_MS) ? 'lock' : 'ok'
  return idle > IDLE_LOGOUT_MS ? 'expired' : 'ok'
}

const EXPIRED = `${KEY}:expired`

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

/** Encerra só neste aparelho; os outros continuam logados. `notice` avisa na tela de login. */
export async function expireSession({ notice = false } = {}) {
  write(LOGIN_AT, null)
  write(LAST_ACTIVE, null)
  if (notice) {
    try {
      sessionStorage.setItem(EXPIRED, '1')
    } catch {
      /* sem o aviso, a tela de login aparece do mesmo jeito */
    }
  }
  useSessionLock.getState().setLocked(false)
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

export function clearSessionMarks() {
  write(LOGIN_AT, null)
  write(LAST_ACTIVE, null)
}

interface LockState {
  locked: boolean
  /** Bloqueado pelo botão: a biometria só é pedida quando a pessoa tocar em Desbloquear. */
  manual: boolean
  setLocked: (locked: boolean, manual?: boolean) => void
  /** Muda quando a biometria é ligada/desligada, para quem depende dela redesenhar. */
  biometricVersion: number
}
export const useSessionLock = create<LockState>((set) => ({
  locked: false,
  manual: false,
  setLocked: (locked, manual = false) => set({ locked, manual }),
  biometricVersion: 0,
}))
const biometricChanged = () => useSessionLock.setState((s) => ({ biometricVersion: s.biometricVersion + 1 }))

/* ---------------- biometria (WebAuthn, autenticador do próprio aparelho) ---------------- */

interface BiometricConfig {
  userId: string
  credentialId: string
}

const toBase64Url = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0))
}
const challenge = () => crypto.getRandomValues(new Uint8Array(32))

/** Credencial cadastrada neste aparelho para este usuário (outro login ignora a do anterior). */
export function biometricFor(userId: string): BiometricConfig | null {
  try {
    const config = JSON.parse(read(BIOMETRIC) || 'null') as BiometricConfig | null
    return config && config.userId === userId && config.credentialId ? config : null
  } catch {
    return null
  }
}

/** O aparelho tem digital, rosto ou PIN do sistema que o navegador consegue usar. */
export async function biometricAvailable() {
  try {
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()))
  } catch {
    return false
  }
}

/** Cadastra a digital/rosto deste aparelho. Precisa ser chamado a partir de um toque/clique. */
export async function enableBiometric(user: { id: string; email?: string; name?: string }) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'Meu ERP Freelas', id: location.hostname },
      user: { id: new TextEncoder().encode(user.id), name: user.email || user.id, displayName: user.name || user.email || 'Meu ERP Freelas' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('O cadastro foi cancelado.')
  write(BIOMETRIC, JSON.stringify({ userId: user.id, credentialId: toBase64Url(credential.rawId) } satisfies BiometricConfig))
  markActive()
  biometricChanged()
}

export function disableBiometric() {
  write(BIOMETRIC, null)
  biometricChanged()
}

/**
 * Pede a digital/rosto. Só libera se o aparelho confirmou que verificou a pessoa
 * (bit "UV" dos dados do autenticador), não apenas que o aparelho está presente.
 */
export async function verifyBiometric(userId: string) {
  const config = biometricFor(userId)
  if (!config) throw new Error('Biometria não cadastrada neste aparelho.')
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromBase64Url(config.credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  const data = assertion && new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData)
  if (!data || !(data[32] & 0x04)) throw new Error('O aparelho não confirmou a biometria.')
  markActive()
}
