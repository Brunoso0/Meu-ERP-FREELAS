import { useMemo, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { clientStatus, toOptions } from '@/lib/labels'
import { formatCurrency, sum } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Client } from '@/types/database.types'

export default function Clients() {
  const openModal = useUI((s) => s.openModal)
  const clients = useTable('clients')
  const transactions = useTable('financial_transactions')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  // LTV = tudo que o cliente já pagou
  const ltv = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions.data ?? []) {
      if (t.type === 'income' && t.status === 'paid' && t.client_id) {
        map.set(t.client_id, (map.get(t.client_id) ?? 0) + Number(t.amount))
      }
    }
    return map
  }, [transactions.data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.data?.filter(
      (c) =>
        (!status || c.status === status) &&
        (!q || [c.name, c.company_name, c.email, c.document].some((v) => v?.toLowerCase().includes(q))),
    )
  }, [clients.data, search, status])

  const columns: Column<Client>[] = [
    {
      header: 'Cliente',
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{c.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.company_name ?? 'Pessoa física'}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Contato',
      cell: (c) => (
        <div className="text-slate-600 dark:text-slate-300">
          <p className="truncate">{c.email ?? '—'}</p>
          <p className="tabular text-xs text-slate-500 dark:text-slate-400">{c.phone ?? ''}</p>
        </div>
      ),
    },
    { header: 'CPF / CNPJ', cell: (c) => <span className="tabular text-slate-600 dark:text-slate-300">{c.document ?? '—'}</span> },
    { header: 'Status', cell: (c) => <Badge tone={clientStatus[c.status].tone}>{clientStatus[c.status].label}</Badge> },
    { header: 'Valor/hora', className: 'text-right', cell: (c) => <span className="tabular">{formatCurrency(c.hourly_rate)}</span> },
    { header: 'LTV', className: 'text-right', cell: (c) => <span className="tabular font-medium">{formatCurrency(ltv.get(c.id) ?? 0)}</span> },
  ]

  const filtering = Boolean(search || status)

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${clients.data?.length ?? 0} cadastrados · LTV total ${formatCurrency(sum([...ltv.values()]))}`}
        actions={
          <Button onClick={() => openModal({ type: 'client' })}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, empresa, e-mail ou documento" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            {toOptions(clientStatus).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={clients.isLoading}
          onRowClick={(c) => openModal({ type: 'client', record: c })}
          empty={
            filtering ? (
              <EmptyState icon={Search} title="Nenhum cliente encontrado" description="Ajuste a busca ou o filtro de status." />
            ) : (
              <EmptyState
                icon={Users}
                title="Nenhum cliente ainda"
                description="Cadastre o primeiro cliente para começar a enviar propostas e registrar recebimentos."
                action={
                  <Button onClick={() => openModal({ type: 'client' })}>
                    <Plus className="h-4 w-4" /> Novo cliente
                  </Button>
                }
              />
            )
          }
        />
      </Card>
    </>
  )
}
