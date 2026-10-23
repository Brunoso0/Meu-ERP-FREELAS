import { useState } from 'react'
import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useNarrowScreen } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { Button, Input, Select } from './primitives'

export interface ToolbarFilter {
  /** Nome do filtro para leitores de tela (ex.: "Filtrar por status"). */
  label: string
  value: string
  onChange: (value: string) => void
  /** Texto da opção "sem filtro" (valor ''). */
  allLabel: string
  options: Array<{ value: string; label: string }>
}

interface ListToolbarProps {
  search?: { value: string; onChange: (value: string) => void; placeholder: string }
  filters?: ToolbarFilter[]
  sort?: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }
  /** Quantos itens sobraram e quantos existem, mostrado quando há filtro. */
  count?: { shown: number; total: number; noun: [singular: string, plural: string] }
  filtering?: boolean
  onClear?: () => void
  className?: string
}

/**
 * Barra de busca, filtros e ordenação no topo de uma lista. Fica no cabeçalho
 * do Card, acima da tabela; no celular os campos quebram em linhas.
 */
export function ListToolbar({ search, filters = [], sort, count, filtering, onClear, className }: ListToolbarProps) {
  // no celular os filtros ficam atrás de um botão, cada um numa linha inteira, para o texto não cortar
  const narrow = useNarrowScreen()
  const [open, setOpen] = useState(false)
  const active = filters.filter((f) => f.value).length
  const showFilters = !narrow || open || filters.length <= 1

  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-b p-3', className)}>
      {search && (
        <div className="relative min-w-0 flex-[2_1_260px] sm:min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={narrow ? 'Buscar' : search.placeholder}
            aria-label={search.placeholder}
            className="pl-9"
          />
        </div>
      )}
      {narrow && filters.length > 1 && (
        <Button variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open} className="shrink-0">
          <SlidersHorizontal className="h-4 w-4" /> Filtros
          {active > 0 && <span className="tabular rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{active}</span>}
        </Button>
      )}
      {showFilters && filters.map((f) => (
        <Select
          key={f.label}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          aria-label={f.label}
          className={cn(narrow ? 'w-full' : 'min-w-[150px] flex-[1_1_150px] sm:w-auto sm:flex-none', f.value && 'border-brand-500 text-brand-700 dark:border-brand-500 dark:text-brand-300')}
        >
          <option value="">{f.allLabel}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {sort && (
        <div className="relative min-w-[190px] flex-[1_1_190px] sm:flex-none">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Select value={sort.value} onChange={(e) => sort.onChange(e.target.value)} aria-label="Ordenar" className="w-full pl-8 sm:w-auto">
            {sort.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      {filtering && (
        <div className="flex items-center gap-2">
          {count && (
            <span className="tabular whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
              {count.shown} de {count.total} {count.total === 1 ? count.noun[0] : count.noun[1]}
            </span>
          )}
          {onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
