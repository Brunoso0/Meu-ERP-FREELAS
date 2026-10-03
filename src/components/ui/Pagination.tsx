import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './primitives'

/** Tamanho de página padrão de todas as listas do app. */
export const PAGE_SIZE = 10

export function usePagination<T>(items: T[] | undefined, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0)
  const total = items?.length ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))

  // filtros mudam o total: evita ficar numa página que deixou de existir
  useEffect(() => {
    if (page > pages - 1) setPage(0)
  }, [page, pages])

  const start = page * pageSize
  return {
    page,
    pages,
    total,
    setPage,
    visible: items?.slice(start, start + pageSize) ?? [],
    from: total === 0 ? 0 : start + 1,
    to: Math.min(total, start + pageSize),
  }
}

type PagerProps = Pick<ReturnType<typeof usePagination>, 'page' | 'pages' | 'total' | 'setPage' | 'from' | 'to'> & {
  className?: string
}

/** Rodapé de paginação. Some sozinho quando tudo cabe em uma página. */
export function Pager({ page, pages, total, setPage, from, to, className }: PagerProps) {
  if (pages <= 1) return null
  return (
    <div className={cn('flex items-center justify-between border-t px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400', className)}>
      <span className="tabular">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular px-1">
          {page + 1} / {pages}
        </span>
        <Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
