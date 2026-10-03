import * as React from 'react'
import { cn } from '@/lib/utils'
import { PAGE_SIZE, Pager, usePagination } from './Pagination'
import { Skeleton } from './primitives'

export interface Column<T> {
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
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

  if (!loading && pagination.total === 0) return <>{empty}</>

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
