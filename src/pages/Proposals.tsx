import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Eye, FileText, MoreHorizontal, Plus, ScrollText, Send, Trash2, X } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays'
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { confirm } from '@/components/ui/confirm'
import { useRemove, useTable, useUpdate } from '@/hooks/useData'
import { proposalStatus } from '@/lib/labels'
import { formatCurrency, formatDate, formatProposalNumber, sum } from '@/lib/utils'
import type { Proposal, ProposalStatus } from '@/types/database.types'

export default function Proposals() {
  const navigate = useNavigate()
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const update = useUpdate('proposals')
  const remove = useRemove('proposals')

  const clientName = (id: string | null) => {
    const c = clients.data?.find((x) => x.id === id)
    return c ? c.company_name ?? c.name : '—'
  }

  const setStatus = (p: Proposal, status: ProposalStatus) =>
    update.mutate({ id: p.id, patch: { status } }, { onSuccess: () => toast.success(`Proposta marcada como ${proposalStatus[status].label.toLowerCase()}`) })

  const handleDelete = async (p: Proposal) => {
    if (!(await confirm({ title: `Excluir a proposta ${formatProposalNumber(p.proposal_number)}?`, description: `"${p.title}" será apagada. Esta ação não pode ser desfeita.` }))) return
    remove.mutate(p.id, { onSuccess: () => toast.success('Proposta excluída') })
  }

  const columns: Column<Proposal>[] = [
    { header: 'Nº', cell: (p) => <span className="tabular font-medium text-slate-500 dark:text-slate-400">{formatProposalNumber(p.proposal_number)}</span> },
    {
      header: 'Proposta',
      cell: (p) => (
        <div className="min-w-0">
          <Link to={`/propostas/${p.id}`} className="truncate font-medium hover:text-brand-600 dark:hover:text-brand-400">
            {p.title}
          </Link>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{clientName(p.client_id)}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (p) => <Badge tone={proposalStatus[p.status].tone}>{proposalStatus[p.status].label}</Badge> },
    { header: 'Criada em', cell: (p) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(p.created_at)}</span> },
    { header: 'Valor', className: 'text-right', cell: (p) => <span className="tabular font-medium">{formatCurrency(p.total_amount)}</span> },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (p) => (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ações" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={Eye} onSelect={() => navigate(`/propostas/${p.id}`)}>Ver e exportar PDF</DropdownItem>
            <DropdownSeparator />
            {p.status !== 'sent' && <DropdownItem icon={Send} onSelect={() => setStatus(p, 'sent')}>Marcar como enviada</DropdownItem>}
            {p.status !== 'approved' && <DropdownItem icon={Check} onSelect={() => setStatus(p, 'approved')}>Marcar como aprovada</DropdownItem>}
            {p.status !== 'rejected' && <DropdownItem icon={X} onSelect={() => setStatus(p, 'rejected')}>Marcar como recusada</DropdownItem>}
            {p.status === 'approved' && (
              <DropdownItem icon={ScrollText} onSelect={() => navigate('/ferramentas/contrato', { state: { proposalId: p.id } })}>
                Gerar contrato
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem icon={Trash2} danger onSelect={() => handleDelete(p)}>Excluir</DropdownItem>
          </DropdownContent>
        </Dropdown>
      ),
    },
  ]

  const action = (
    <Button onClick={() => navigate('/ferramentas/proposta')}>
      <Plus className="h-4 w-4" /> Nova proposta
    </Button>
  )

  const open = (proposals.data ?? []).filter((p) => p.status === 'sent' || p.status === 'draft')

  return (
    <>
      <PageHeader
        title="Propostas comerciais"
        description={`${open.length} em aberto somando ${formatCurrency(sum(open.map((p) => p.total_amount)))}`}
        actions={action}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={proposals.data}
          loading={proposals.isLoading}
          empty={
            <EmptyState
              icon={FileText}
              title="Nenhuma proposta ainda"
              description="Monte a primeira proposta no gerador: escopo, entregáveis, cronograma e preços em um PDF pronto para enviar."
              action={action}
            />
          }
        />
      </Card>
    </>
  )
}
