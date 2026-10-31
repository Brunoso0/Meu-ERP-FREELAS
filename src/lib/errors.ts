import { supabase } from './supabase'

/*
 * Avisa o banco (função report_client_error) quando algo quebra no navegador, para o erro não
 * depender de alguém contar. Nada vai a serviço de fora e nada daqui pode piorar o problema:
 * qualquer falha ao avisar é engolida.
 */

const MAX_PER_PAGE = 10
const seen = new Set<string>()

/** Ruídos que não são defeito do app. */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /AbortError/i, /Failed to fetch$/i, /Load failed$/i, /NetworkError/i]

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack }
  if (typeof error === 'string') return { message: error }
  try {
    return { message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { message: String(error) }
  }
}

export function reportError(error: unknown, extra?: string) {
  try {
    const { message, stack } = describe(error)
    if (IGNORED.some((re) => re.test(message))) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const key = `${message}|${(stack ?? '').slice(0, 200)}`
    if (seen.has(key) || seen.size >= MAX_PER_PAGE) return
    seen.add(key)
    console.error(extra ? `[${extra}]` : '[erro]', error)
    if (!supabase) return // modo demo: só no console
    void supabase
      .rpc('report_client_error', {
        p_message: extra ? `${extra}: ${message}` : message,
        p_stack: stack ?? null,
        p_path: location.pathname,
        p_user_agent: navigator.userAgent,
        p_app_version: import.meta.env.MODE,
      })
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    /* avisar nunca pode quebrar o app */
  }
}

/** Erros que escapam de qualquer tratamento: viram aviso ao banco. */
export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'window.onerror'))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'promessa rejeitada'))
}
