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

  if (!loading && pagination.total === 0) return <>{empty}</>

  if (narrow) {
    // no celular cada linha vira um cartão: título, pares "rótulo: valor" e as ações no rodapé
    const primary = columns.find((c) => c.primary) ?? columns[0]
    const details = columns.filter((c) => c !== primary && c.header)
    const actions = columns.filter((c) => c !== primary && !c.header)
    return (
      <div>
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

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {columns.map((c) => (
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
                    {columns.map((c) => (
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
                    {columns.map((c) => (
                      <td key={c.header} className={cn('px-4 py-3', c.className)}>
                        {c.cell(row)}
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
