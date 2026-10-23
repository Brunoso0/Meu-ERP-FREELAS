import { useEffect, useState } from 'react'

/**
 * Estado dos filtros de uma lista, lembrado enquanto a aba do navegador
 * estiver aberta: sair do módulo e voltar não perde a busca nem a ordenação.
 * Sem sessionStorage (aba anônima, bloqueio), funciona só em memória.
 */
export function useListState<T extends Record<string, string>>(key: string, initial: T) {
  const storageKey = `meu-erp-freelas:list:${key}`
  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) return { ...initial, ...(JSON.parse(raw) as Partial<T>) }
    } catch {
      // sem armazenamento: começa do padrão
    }
    return initial
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }, [storageKey, state])

  const set = <K extends keyof T>(field: K, value: T[K]) => setState((s) => ({ ...s, [field]: value }))
  const reset = () => setState((s) => ({ ...initial, sort: s.sort ?? initial.sort }))
  /** Algum filtro (ou a busca) está diferente do padrão. A ordenação não conta. */
  const filtering = Object.keys(initial).some((k) => k !== 'sort' && state[k] !== initial[k])
  return { state, set, reset, filtering }
}
