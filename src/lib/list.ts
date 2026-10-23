/**
 * Busca, filtros e ordenação das listas dos módulos. Tudo roda no navegador,
 * sobre os dados que a tela já carregou.
 */

/** Texto sem acento e em minúsculas, para a busca achar "joao" em "João". */
export const plain = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Todas as palavras da busca aparecem em algum dos campos (ordem livre). */
export function matchesSearch(query: string, fields: Array<string | number | null | undefined>) {
  const words = plain(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fields.map((f) => plain(f == null ? '' : String(f))).join(' ')
  return words.every((w) => haystack.includes(w))
}

export interface SortOption<T> {
  value: string
  label: string
  compare: (a: T, b: T) => number
}

/**
 * Cria o par "maior / menor" (ou "mais recente / mais antigo") de um mesmo
 * critério: toda ordenação vem com a inversa. Valores vazios ficam sempre no fim.
 */
export function sortPair<T>(
  key: string,
  labels: [desc: string, asc: string],
  pick: (row: T) => number | string | null | undefined,
): [SortOption<T>, SortOption<T>] {
  const compare = (dir: 1 | -1) => (a: T, b: T) => {
    const x = pick(a)
    const y = pick(b)
    const xEmpty = x == null || x === ''
    const yEmpty = y == null || y === ''
    if (xEmpty || yEmpty) return xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x).localeCompare(String(y), 'pt-BR', { sensitivity: 'base' }) * dir
  }
  return [
    { value: `${key}-desc`, label: labels[0], compare: compare(-1) },
    { value: `${key}-asc`, label: labels[1], compare: compare(1) },
  ]
}

/** Ordena uma cópia da lista pela opção escolhida (desempate pela ordem original). */
export function sortRows<T>(rows: T[], options: SortOption<T>[], value: string) {
  const option = options.find((o) => o.value === value) ?? options[0]
  if (!option) return rows
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => option.compare(a.row, b.row) || a.index - b.index)
    .map((x) => x.row)
}

/**
 * Opções de filtro por registro ligado (cliente, projeto): só os que aparecem
 * na lista, em ordem alfabética, e "sem …" no fim quando há itens sem vínculo.
 */
export function linkOptions(ids: Array<string | null | undefined>, labelOf: (id: string) => string, noneLabel?: string) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  const options = unique.map((id) => ({ value: id, label: labelOf(id) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  if (noneLabel && ids.some((id) => !id)) options.push({ value: 'none', label: noneLabel })
  return options
}

/** Opções de filtro a partir dos valores que existem nos dados, em ordem alfabética. */
export function distinctOptions(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((v): v is string => !!v && v.trim() !== ''))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((v) => ({ value: v, label: v }))
}
