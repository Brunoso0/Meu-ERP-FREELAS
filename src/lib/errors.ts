import { supabase } from './supabase'
import { activeWorkspaceId } from '@/store/workspace'

/*
 * Avisa o banco (função report_client_error) quando algo quebra no navegador, com o contexto que
 * ajuda a reproduzir: tipo do erro, tela, workspace, versão, aparelho e o rastro curto do que
 * aconteceu antes (telas visitadas, chamadas de rede e toques em botões identificados por id).
 *
 * Privacidade: nada digitado, nenhum corpo de requisição ou resposta, nenhum texto de tela.
 * Endereços de rede entram sem parâmetros e com ids trocados por :id. Nada vai a serviço de fora
 * e nenhuma falha daqui pode piorar o problema: tudo é engolido.
 */

declare const __APP_VERSION__: string

export type ErrorKind = 'janela' | 'promessa' | 'tela' | 'rede' | 'consulta' | 'acao' | 'manual'

const MAX_PER_PAGE = 10
const MAX_CRUMBS = 20
const seen = new Set<string>()
const crumbs: { t: number; type: string; [k: string]: unknown }[] = []

/** Ruídos que não são defeito do app. */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /AbortError/i, /Failed to fetch$/i, /Load failed$/i, /NetworkError/i, /signal is aborted/i]

const startedAt = Date.now()
const rel = () => Math.round((Date.now() - startedAt) / 100) / 10 // segundos desde que a página abriu

function addCrumb(type: string, data: Record<string, unknown> = {}) {
  crumbs.push({ t: rel(), type, ...data })
  if (crumbs.length > MAX_CRUMBS) crumbs.shift()
}

/** Tira parâmetros e troca ids por :id, para o rastro não carregar dados de ninguém. */
function cleanPath(raw: string): string {
  try {
    const path = new URL(raw, location.origin).pathname
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d{3,}/g, '/:id')
      .replace(/\/[A-Za-z0-9_-]{24,}/g, '/:token')
      .slice(0, 120)
  } catch {
    return '?'
  }
}

function describe(error: unknown): { message: string; stack?: string; status?: number; code?: string } {
  if (error instanceof Error) {
    const extra = error as Error & { status?: number; code?: string }
    return { message: `${error.name}: ${error.message}`, stack: error.stack, status: extra.status, code: extra.code }
  }
  if (typeof error === 'string') return { message: error }
  if (error && typeof error === 'object') {
    const o = error as { message?: unknown; status?: unknown; code?: unknown }
    if (typeof o.message === 'string') return { message: o.message, status: typeof o.status === 'number' ? o.status : undefined, code: typeof o.code === 'string' ? o.code : undefined }
  }
  try {
    return { message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { message: String(error) }
  }
}

function environment() {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string }; standalone?: boolean }
  return {
    viewport: `${innerWidth}x${innerHeight}@${window.devicePixelRatio || 1}`,
    lang: navigator.language,
    online: navigator.onLine,
    pwa: window.matchMedia?.('(display-mode: standalone)').matches || Boolean(nav.standalone),
    net: nav.connection?.effectiveType,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visible: document.visibilityState,
    aberta_ha_s: Math.round((Date.now() - startedAt) / 1000),
    modo: import.meta.env.MODE,
  }
}

interface ReportOptions {
  kind?: ErrorKind
  /** Prefixo que diz de onde veio (ex.: "tela quebrou em Clients"). */
  where?: string
  /** Dados extras já limpos (arquivo/linha, pilha de componentes, chave da consulta, status HTTP). */
  extra?: Record<string, unknown>
}

export function reportError(error: unknown, options: ReportOptions = {}) {
  try {
    const { message, stack, status, code } = describe(error)
    if (IGNORED.some((re) => re.test(message))) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const full = options.where ? `${options.where}: ${message}` : message
    const key = `${full}|${(stack ?? '').slice(0, 200)}`
    if (seen.has(key) || seen.size >= MAX_PER_PAGE) return
    seen.add(key)
    console.error(options.where ? `[${options.where}]` : '[erro]', error)
    if (!supabase) return // modo demo: só no console
    const context = { ...environment(), ...(status ? { status } : {}), ...(code ? { code } : {}), ...options.extra }
    void supabase
      .rpc('report_client_error', {
        p_message: full,
        p_stack: stack ?? null,
        p_path: location.pathname,
        p_user_agent: navigator.userAgent,
        p_app_version: __APP_VERSION__,
        p_kind: options.kind ?? 'manual',
        p_workspace: activeWorkspaceId(),
        p_context: context,
        p_breadcrumbs: crumbs.slice(),
      })
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    /* avisar nunca pode quebrar o app */
  }
}

/** Erros de consulta e de ação que parecem defeito (não erro de preenchimento ou sessão vencida). */
export function reportQueryError(error: unknown, kind: 'consulta' | 'acao', key?: unknown) {
  const { status, code } = describe(error)
  if (status === 401 || status === 403 || /^PGRST30[1-3]$/.test(code ?? '') || /JWT/i.test(describe(error).message)) return
  if (kind === 'acao' && !(error instanceof TypeError) && !((status ?? 0) >= 500) && !/^(XX|42|PGRST)/.test(code ?? '')) return
  const first = Array.isArray(key) ? String(key[0] ?? '') : undefined
  reportError(error, { kind, where: kind === 'consulta' ? 'consulta falhou' : 'ação falhou', extra: first ? { consulta: first.slice(0, 60) } : undefined })
}

function trackNavigation() {
  addCrumb('nav', { to: cleanPath(location.href) })
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args)
      addCrumb('nav', { to: cleanPath(location.href) })
      return result
    }
  }
  window.addEventListener('popstate', () => addCrumb('nav', { to: cleanPath(location.href) }))
}

/** Toques em botões e links, só por id, aria-label ou data-testid: nunca pelo texto, que pode ter nomes. */
function trackClicks() {
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, a, [role="button"], [role="tab"], input[type="checkbox"]')
      if (!el) return
      const id = el.id || el.getAttribute('aria-label') || el.getAttribute('data-testid')
      addCrumb('clique', { el: el.tagName.toLowerCase(), ...(id ? { id: id.slice(0, 40) } : {}) })
    },
    { capture: true, passive: true },
  )
}

/** Marca cada chamada de rede (só método, endereço limpo, status e tempo) e avisa quando o servidor falha. */
function trackFetch() {
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = cleanPath(url)
    const started = performance.now()
    const self = path.includes('report_client_error')
    try {
      const response = await original(input, init)
      if (!self) {
        const ms = Math.round(performance.now() - started)
        addCrumb('rede', { m: method, p: path, s: response.status, ms })
        if (response.status >= 500) reportError(new Error(`${method} ${path} respondeu ${response.status}`), { kind: 'rede', where: 'servidor falhou', extra: { status: response.status, ms } })
      }
      return response
    } catch (error) {
      if (!self) addCrumb('rede', { m: method, p: path, s: 'falhou', ms: Math.round(performance.now() - started) })
      throw error
    }
  }
}

/** Erros que escapam de qualquer tratamento viram aviso ao banco, e o rastro começa a ser guardado. */
export function installErrorReporting() {
  try {
    trackNavigation()
    trackClicks()
    trackFetch()
  } catch {
    /* o rastro é um extra */
  }
  window.addEventListener('error', (e) => {
    const where = e.filename ? `${cleanPath(e.filename).split('/').pop()}:${e.lineno}:${e.colno}` : undefined
    reportError(e.error ?? e.message, { kind: 'janela', where: 'window.onerror', extra: where ? { origem: where } : undefined })
  })
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { kind: 'promessa', where: 'promessa rejeitada' }))
}
