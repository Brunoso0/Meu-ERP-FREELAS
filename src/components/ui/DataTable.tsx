import * as React from 'react'
import { useNarrowScreen } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { PAGE_SIZE, Pager, usePagination } from './Pagination'
import { Skeleton } from './primitives'

export interface Column<T> {
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  /** No celular, a coluna que vira o título do cartão. Sem marcação, é a primeira. */
  primary?: boolean
  /**
   * Importância quando falta largura: 3 sai primeiro, depois 2; sem valor (1) a
   * coluna nunca sai. O valor da coluna escondida aparece embaixo do título da linha.
   */
  priority?: 2 | 3
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[] | undefined
  loading?: boolean
  pageSize?: number
  /** Mostrado quando não há linhas (use um EmptyState). */
  empty: React.ReactNode
  onRowClick?: (row: T) => void
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  pageSize = PAGE_SIZE,
  empty,
  onRowClick,
}: DataTableProps<T>) {
  const pagination = usePagination(rows, pageSize)
  const narrow = useNarrowScreen()
  // só o que muda a largura: quais linhas estão na página, quais colunas e se ainda carrega
  const fit = useFit(narrow, pagination.total > 0, `${pagination.visible.map((r) => r.id).join()}|${columns.map((c) => c.header).join()}|${loading}`)

  if (!loading && pagination.total === 0) return <>{empty}</>

  if (narrow || fit.cards) {
    // no celular cada linha vira um cartão: título, pares "rótulo: valor" e as ações no rodapé
    const primary = columns.find((c) => c.primary) ?? columns[0]
    const details = columns.filter((c) => c !== primary && c.header)
    const actions = columns.filter((c) => c !== primary && !c.header)
    return (
      <div ref={fit.box}>
        <ul>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="space-y-2 border-b px-4 py-4 last:border-0">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </li>
              ))
            : pagination.visible.map((row) => (
                <li
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('border-b px-4 py-3.5 text-sm last:border-0', onRowClick && 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50')}
                >
                  <div className="min-w-0">{primary.cell(row)}</div>
                  {details.length > 0 && (
                    <dl className="mt-3 space-y-2">
                      {details.map((c) => (
                        <div key={c.header} className="flex items-center justify-between gap-4">
                          <dt className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{c.header}</dt>
                          <dd className="min-w-0 text-right">{c.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      {actions.map((c, i) => (
                        <React.Fragment key={i}>{c.cell(row)}</React.Fragment>
                      ))}
                    </div>
                  )}
                </li>
              ))}
        </ul>
        {!loading && <Pager {...pagination} />}
      </div>
    )
  }

  // colunas que saíram por falta de largura: o valor vai para baixo do título da linha
  const primary = columns.find((c) => c.primary) ?? columns[0]
  const isHidden = (c: Column<T>) => c !== primary && (c.priority ?? 1) > 3 - fit.level
  const shown = columns.filter((c) => !isHidden(c))
  const tucked = columns.filter((c) => isHidden(c) && c.header)
  // a coluna principal fica com a sobra da largura (texto longo corta com reticências)
  const fill = 'w-full min-w-[13rem] max-w-0'

  return (
    <div ref={fit.box}>
      <div className="overflow-x-auto">
        <table ref={fit.table} className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {shown.map((c) => (
                <th key={c.header} className={cn('whitespace-nowrap px-4 py-3 font-medium', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {shown.map((c) => (
                      <td key={c.header} className="px-4 py-3.5">
                        <Skeleton className="h-4 w-full max-w-[160px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : pagination.visible.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    {shown.map((c) => (
                      <td key={c.header} className={cn('px-4 py-3', c === primary && fill, c.className)}>
                        {c.cell(row)}
                        {c === primary && tucked.length > 0 && (
                          <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            {tucked.map((t) => (
                              <div key={t.header} className="flex min-w-0 items-center gap-1.5">
                                <dt className="text-slate-400 dark:text-slate-500">{t.header}:</dt>
                                <dd className="min-w-0">{t.cell(row)}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && <Pager {...pagination} />}
    </div>
  )
}

/**
 * Ajusta a tabela à largura que ela tem (menu aberto, tablet, notebook): se não
 * cabe, esconde as colunas de prioridade 3, depois as de 2; se nem assim cabe,
 * vira cartões. Tudo antes de pintar a tela, então não pisca.
 */
function useFit(narrow: boolean, hasRows: boolean, content: string) {
  const box = React.useRef<HTMLDivElement>(null)
  const table = React.useRef<HTMLTableElement>(null)
  // 0 = todas as colunas, 1 = sem prioridade 3, 2 = sem 2 e 3, 3 = cartões
  const [level, setLevel] = React.useState(0)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    const el = box.current
    if (!el || narrow) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [narrow, hasRows])

  // largura ou conteúdo mudou: recomeça com todas as colunas e mede de novo
  React.useLayoutEffect(() => {
    setLevel(0)
  }, [width, content])

  React.useLayoutEffect(() => {
    if (narrow || level >= 3) return
    const el = box.current
    const t = table.current
    if (el && t && t.scrollWidth > el.clientWidth + 1) setLevel(level + 1)
  })

  return { box, table, level: Math.min(level, 2), cards: level >= 3 }
}
