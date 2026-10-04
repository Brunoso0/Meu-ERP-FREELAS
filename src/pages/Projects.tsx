import { Briefcase, Plus } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { projectStatus } from '@/lib/labels'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Project } from '@/types/database.types'

export default function Projects() {
  const openModal = useUI((s) => s.openModal)
  const projects = useTable('projects')
  const clients = useTable('clients')
  const tasks = useTable('tasks')

  const clientName = (id: string | null) => {
    const c = clients.data?.find((x) => x.id === id)
    return c ? c.company_name ?? c.name : '—'
  }

  const progress = (id: string) => {
    const own = (tasks.data ?? []).filter((t) => t.project_id === id)
    return { done: own.filter((t) => t.status === 'done').length, total: own.length }
  }

  const columns: Column<Project>[] = [
    {
      header: 'Projeto',
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.title}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{clientName(p.client_id)}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (p) => <Badge tone={projectStatus[p.status].tone}>{projectStatus[p.status].label}</Badge> },
    {
      header: 'Demandas',
      cell: (p) => {
        const { done, total } = progress(p.id)
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <span className="tabular text-xs text-slate-500 dark:text-slate-400">
              {done}/{total}
            </span>
          </div>
        )
      },
    },
    { header: 'Prazo', cell: (p) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(p.deadline)}</span> },
    { header: 'Orçamento', className: 'text-right', cell: (p) => <span className="tabular font-medium">{formatCurrency(p.budget)}</span> },
  ]

  const action = (
    <Button onClick={() => openModal({ type: 'project' })}>
      <Plus className="h-4 w-4" /> Novo projeto
    </Button>
  )

  return (
    <>
      <PageHeader title="Projetos" description="Cada projeto é um trabalho para um cliente. Ao marcá-lo como concluído, o recebimento é lançado sozinho no financeiro." actions={action} />
      <Card>
        <DataTable
          columns={columns}
          rows={projects.data}
          loading={projects.isLoading}
          onRowClick={(p) => openModal({ type: 'project', record: p })}
          empty={
            <EmptyState
              icon={Briefcase}
              title="Nenhum projeto ainda"
              description="Crie um projeto para organizar demandas e acompanhar a lucratividade."
              action={action}
            />
          }
        />
      </Card>
    </>
  )
}
