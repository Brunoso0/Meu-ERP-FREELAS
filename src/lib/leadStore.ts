import { useSyncExternalStore } from 'react'
import { searchLeads, type LeadResult, type LeadSearch } from './leads'

/*
 * Última busca de leads. Fica fora do componente para não se perder ao trocar de tela:
 * uma busca em andamento termina mesmo que a pessoa saia e volte, e o resultado
 * continua aparecendo (inclusive depois de recarregar) até a próxima busca.
 * Sai do navegador quando a sessão é encerrada.
 */
export const LEAD_RESULT_KEY = 'meu-erp-freelas:lead-finder:last-result:v1'

export interface LeadState {
  result: LeadResult | null
  searchedAt: number | null
  loading: boolean
  error: string | null
}

function load(): Pick<LeadState, 'result' | 'searchedAt'> {
  try {
    const raw = JSON.parse(localStorage.getItem(LEAD_RESULT_KEY) || 'null') as { result?: LeadResult; searchedAt?: number } | null
    if (raw?.result && Array.isArray(raw.result.leads)) return { result: raw.result, searchedAt: raw.searchedAt ?? null }
  } catch {
    // sem localStorage ou conteúdo inválido: começa vazio
  }
  return { result: null, searchedAt: null }
}

function save(result: LeadResult | null, searchedAt: number | null) {
  try {
    if (result) localStorage.setItem(LEAD_RESULT_KEY, JSON.stringify({ result, searchedAt }))
    else localStorage.removeItem(LEAD_RESULT_KEY)
  } catch {
    // sem persistência: o resultado vale até fechar a aba
  }
}

let state: LeadState = { ...load(), loading: false, error: null }
const listeners = new Set<() => void>()

function update(next: Partial<LeadState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

/** Faz a busca. O resultado anterior fica na tela até o novo chegar; se a busca falhar, ele é descartado. */
export async function runLeadSearch(search: LeadSearch) {
  if (state.loading) return
  update({ loading: true, error: null })
  try {
    const found = await searchLeads(search)
    const at = Date.now()
    save(found, at)
    update({ result: found, searchedAt: at, loading: false })
  } catch (err) {
    save(null, null)
    update({ result: null, searchedAt: null, loading: false, error: err instanceof Error ? err.message : 'Não foi possível buscar.' })
  }
}

export function clearLeadSearch() {
  save(null, null)
  update({ result: null, searchedAt: null, error: null })
}

export function useLeadSearch(): LeadState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
