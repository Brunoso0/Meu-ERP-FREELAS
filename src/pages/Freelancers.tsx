import { Plus, Star, UserCog } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { freelancerStatus } from '@/lib/labels'
import { formatCurrency } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Freelancer } from '@/types/database.types'

export default function Freelancers() {
  const openModal = useUI((s) => s.openModal)
  const freelancers = useTable('freelancers')
  const tasks = useTable('tasks')

  const activeCount = (id: string) => (tasks.data ?? []).filter((t) => t.freelancer_id === id && t.status !== 'done').length

  const columns: Column<Freelancer>[] = [
    {
      header: 'Freelancer',
      cell: (f) => (
        <div className="flex items-center gap-3">
          <Avatar name={f.name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{f.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{f.specialty ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Contato',
      cell: (f) => (
        <div className="text-slate-600 dark:text-slate-300">
          <p className="truncate">{f.email ?? '—'}</p>
          <p className="tabular text-xs text-slate-500 dark:text-slate-400">{f.phone ?? ''}</p>
        </div>
      ),
    },
    { header: 'Chave PIX', cell: (f) => <span className="text-slate-600 dark:text-slate-300">{f.pix_key ?? '—'}</span> },
    {
      header: 'Avaliação',
      cell: (f) => (
        <span className="tabular inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {Number(f.rating ?? 0).toFixed(1)}
        </span>
      ),
    },
    { header: 'Demandas ativas', className: 'text-right', cell: (f) => <span className="tabular">{activeCount(f.id)}</span> },
    { header: 'Custo/hora', className: 'text-right', cell: (f) => <span className="tabular">{formatCurrency(f.cost_per_hour)}</span> },
    { header: 'Status', cell: (f) => <Badge tone={freelancerStatus[f.status].tone}>{freelancerStatus[f.status].label}</Badge> },
  ]

  const action = (
    <Button onClick={() => openModal({ type: 'freelancer' })}>
      <Plus className="h-4 w-4" /> Novo freelancer
    </Button>
  )

  return (
    <>
      <PageHeader title="Freelancers" description="Sua rede de parceiros, custos e chaves PIX para repasse." actions={action} />
      <Card>
        <DataTable
          columns={columns}
          rows={freelancers.data}
          loading={freelancers.isLoading}
          onRowClick={(f) => openModal({ type: 'freelancer', record: f })}
          empty={
            <EmptyState
              icon={UserCog}
              title="Nenhum freelancer cadastrado"
              description="Cadastre quem trabalha com você para alocar demandas e controlar repasses."
              action={action}
            />
          }
        />
      </Card>
    </>
  )
}
