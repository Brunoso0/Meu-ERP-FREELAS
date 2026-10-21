import { listRows } from './db'
import { supabase } from './supabase'
import { isoDay } from './utils'

/**
 * Lembrete diário das demandas. O envio (e-mail e notificação) é feito pela
 * Edge Function `reminders`, de hora em hora pelo pg_cron, no horário do
 * perfil. Aqui fica a inscrição deste aparelho nas notificações (Web Push) e
 * o "Enviar um lembrete de teste agora".
 *
 * No modo demo não há servidor: o teste mostra uma notificação local com as
 * demandas do dia, para dar para ver como fica.
 */

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** No iPhone, notificação só existe com o app instalado na tela de início. */
export function pushSupport(): PushState | null {
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return null
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null
  // no dev (sem service worker registrado) não há inscrição possível
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** Situação das notificações neste aparelho. */
export async function pushState(): Promise<PushState> {
  const blocked = pushSupport()
  if (blocked) return blocked
  // modo demo: sem servidor de push, vale a permissão do navegador
  if (!supabase) return Notification.permission === 'granted' ? 'on' : 'off'
  const reg = await registration()
  if (!reg) return 'unsupported'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('reminders', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context?.status === 404) throw new Error('A função de lembretes (reminders) ainda não foi publicada no Supabase.')
    const detail = await context?.json?.().catch(() => null)
    throw new Error(detail?.message ?? error.message)
  }
  return data as T
}

const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** Pede a permissão e inscreve este aparelho. Devolve a situação final. */
export async function enablePush(): Promise<PushState> {
  const blocked = pushSupport()
  if (blocked) return blocked
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  if (!supabase) return 'on'

  const reg = (await registration()) ?? (await navigator.serviceWorker.ready)
  const { key } = await invoke<{ key: string }>({ action: 'vapid-public-key' })
  const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) }))
  const data = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: data.endpoint, p256dh: data.keys?.p256dh, auth: data.keys?.auth, user_agent: navigator.userAgent.slice(0, 400) },
    { onConflict: 'endpoint' },
  )
  if (error) {
    await subscription.unsubscribe().catch(() => null)
    throw new Error(error.message)
  }
  return 'on'
}

/** Tira este aparelho das notificações. */
export async function disablePush(): Promise<PushState> {
  const reg = await registration()
  const subscription = await reg?.pushManager.getSubscription()
  if (subscription) {
    if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe()
  }
  return 'off'
}

export interface TestResult {
  summary: string
  email: string
  emailTo: string | null
  push: { sent: number; removed: number } | null
}

/** Demandas de hoje e atrasadas (para o teste no modo demo). */
async function localDigest() {
  const day = isoDay(new Date())
  const tasks = (await listRows('tasks')).filter((t) => t.status !== 'done')
  const today = tasks.filter((t) => t.scheduled_date === day || t.due_date === day)
  const late = tasks.filter((t) => !today.includes(t) && t.due_date && t.due_date < day)
  const parts = [today.length && `${today.length} para hoje`, late.length && `${late.length} atrasada${late.length === 1 ? '' : 's'}`].filter(Boolean)
  return { summary: parts.length ? parts.join(' · ') : 'Nenhuma demanda para hoje', names: [...today, ...late].slice(0, 3).map((t) => t.title) }
}

/** Manda o lembrete de hoje agora, por e-mail e para os aparelhos inscritos. */
export async function sendTestReminder(): Promise<TestResult> {
  if (supabase) return invoke<TestResult>({ action: 'send-test' })
  const d = await localDigest()
  const reg = await registration()
  const options = { body: d.names.length ? `${d.summary}: ${d.names.join(', ')}` : d.summary, icon: '/icons/icon-192.png', tag: 'demandas-do-dia', data: { url: '/demandas' } }
  let sent = 0
  if ('Notification' in window && Notification.permission === 'granted') {
    if (reg) await reg.showNotification('Demandas de hoje', options)
    else new Notification('Demandas de hoje', options)
    sent = 1
  }
  return { summary: d.summary, email: 'não enviado no modo demo', emailTo: null, push: { sent, removed: 0 } }
}
