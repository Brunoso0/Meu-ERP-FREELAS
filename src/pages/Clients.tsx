import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Eye, MessageCircle, Plus, Search, Users } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ListToolbar } from '@/components/ui/ListToolbar'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { useListState } from '@/hooks/useListState'
import { clientStatus, effectiveStatus, toOptions } from '@/lib/labels'
import { whatsappUrl } from '@/lib/leads'
import { matchesSearch, sortPair, sortRows, type SortOption } from '@/lib/list'
import { formatCurrency, sum } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Client } from '@/types/database.types'

interface Money {
  /** LTV: tudo que o cliente já pagou. */
  ltv: number
  /** Em aberto (pendente ou atrasado). */
  open: number
  /** Em aberto e já vencido. */
  late: number
}

const noMoney: Money = { ltv: 0, open: 0, late: 0 }

export default function Clients() {
  const openModal = useUI((s) => s.openModal)
  const clients = useTable('clients')
  const transactions = useTable('financial_transactions')
  const list = useListState('clientes', { search: '', status: '', kind: '', contact: '', money: '', sort: 'created-desc' })
  const { search, status, kind, contact, money, sort } = list.state

  const totals = useMemo(() => {
    const map = new Map<string, Money>()
    for (const t of transactions.data ?? []) {
      if (t.type !== 'income' || !t.client_id) continue
      const row = map.get(t.client_id) ?? { ...noMoney }
      if (t.status === 'paid') row.ltv += Number(t.amount)
      else {
        row.open += Number(t.amount)
        if (effectiveStatus(t) === 'overdue') row.late += Number(t.amount)
      }
      map.set(t.client_id, row)
    }
    return map
  }, [transactions.data])
  const moneyOf = (c: Client) => totals.get(c.id) ?? noMoney

  const sortOptions: SortOption<Client>[] = [
    ...sortPair<Client>('created', ['Cadastro mais recente', 'Cadastro mais antigo'], (c) => c.created_at),
    ...sortPair<Client>('name', ['Nome Z–A', 'Nome A–Z'], (c) => c.name).reverse(),
    ...sortPair<Client>('ltv', ['Maior LTV', 'Menor LTV'], (c) => moneyOf(c).ltv),
    ...sortPair<Client>('open', ['Maior valor a receber', 'Menor valor a receber'], (c) => moneyOf(c).open),
  ]

  const rows = useMemo(() => {
    const filtered = (clients.data ?? []).filter((c) => {
      const m = moneyOf(c)
      const wa = whatsappUrl(c.phone)
      return (
        (!status || c.status === status) &&
        (!kind || (kind === 'company' ? !!c.company_name : !c.company_name)) &&
        (!contact || (contact === 'whatsapp' ? !!wa : contact === 'no-whatsapp' ? !wa : !c.email)) &&
        (!money || (money === 'open' ? m.open > 0 : money === 'late' ? m.late > 0 : m.ltv === 0)) &&
        matchesSearch(search, [c.name, c.company_name, c.email, c.document, c.document?.replace(/\D/g, ''), c.phone, c.phone?.replace(/\D/g, '')])
      )
    })
    return sortRows(filtered, sortOptions, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.data, totals, search, status, kind, contact, money, sort])

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
      priority: 2,
      cell: (c) => (
        <div className="text-slate-600 dark:text-slate-300">
          <p className="truncate">{c.email ?? '—'}</p>
          <p className="tabular text-xs text-slate-500 dark:text-slate-400">{c.phone ?? ''}</p>
        </div>
      ),
    },
    { header: 'CPF / CNPJ', priority: 3, cell: (c) => <span className="tabular whitespace-nowrap text-slate-600 dark:text-slate-300">{c.document ?? '—'}</span> },
    { header: 'Status', cell: (c) => <Badge tone={clientStatus[c.status].tone}>{clientStatus[c.status].label}</Badge> },
    {
      header: 'LTV',
      className: 'text-right',
      cell: (c) => {
        const m = moneyOf(c)
        return (
          <div className="tabular whitespace-nowrap">
            <p className="font-medium">{formatCurrency(m.ltv)}</p>
            {m.open > 0 && <p className={m.late > 0 ? 'text-xs text-red-600 dark:text-red-400' : 'text-xs text-slate-500 dark:text-slate-400'}>{formatCurrency(m.open)} a receber</p>}
          </div>
        )
      },
    },
    {
      header: '',
      className: 'text-right',
      cell: (c) => {
        const wa = whatsappUrl(c.phone)
        const contactLink = wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            // a linha inteira abre a edição; o clique no botão não deve abrir junto
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Entrar em contato
          </a>
        ) : (
          <span className="whitespace-nowrap text-xs text-slate-400" title="Cadastre o WhatsApp do cliente para entrar em contato">
            Sem WhatsApp
          </span>
        )
        return (
          <div className="inline-flex items-center gap-2">
            {contactLink}
            <Link
              to={`/clientes/${c.id}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Abrir a tela de ${c.name}`}
              title="Ver tudo sobre o cliente"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Eye className="h-4 w-4" />
            </Link>
          </div>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${clients.data?.length ?? 0} cadastrados · LTV total ${formatCurrency(sum([...totals.values()].map((m) => m.ltv)))}`}
        actions={
          <Button onClick={() => openModal({ type: 'client' })}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        }
      />
      <Card>
        <ListToolbar
          search={{ value: search, onChange: (v) => list.set('search', v), placeholder: 'Buscar por nome, empresa, e-mail, telefone ou documento' }}
          filters={[
            { label: 'Filtrar por status', value: status, onChange: (v) => list.set('status', v), allLabel: 'Todos os status', options: toOptions(clientStatus) },
            { label: 'Filtrar por tipo', value: kind, onChange: (v) => list.set('kind', v), allLabel: 'Empresas e pessoas', options: [{ value: 'company', label: 'Empresas' }, { value: 'person', label: 'Pessoas físicas' }] },
            {
              label: 'Filtrar por contato',
              value: contact,
              onChange: (v) => list.set('contact', v),
              allLabel: 'Qualquer contato',
              options: [
                { value: 'whatsapp', label: 'Com WhatsApp' },
                { value: 'no-whatsapp', label: 'Sem WhatsApp' },
                { value: 'no-email', label: 'Sem e-mail' },
              ],
            },
            {
              label: 'Filtrar por pagamentos',
              value: money,
              onChange: (v) => list.set('money', v),
              allLabel: 'Qualquer situação financeira',
              options: [
                { value: 'open', label: 'Com valor a receber' },
                { value: 'late', label: 'Com pagamento atrasado' },
                { value: 'never', label: 'Ainda não pagou nada' },
              ],
            },
          ]}
          sort={{ value: sort, onChange: (v) => list.set('sort', v), options: sortOptions }}
          count={{ shown: rows.length, total: clients.data?.length ?? 0, noun: ['cliente', 'clientes'] }}
          filtering={list.filtering}
          onClear={list.reset}
        />
        <DataTable
          columns={columns}
          rows={rows}
          loading={clients.isLoading}
          onRowClick={(c) => openModal({ type: 'client', record: c })}
          empty={
            list.filtering ? (
              <EmptyState
                icon={Search}
                title="Nenhum cliente encontrado"
                description="Ajuste a busca ou os filtros."
                action={
                  <Button variant="secondary" onClick={list.reset}>
                    Limpar filtros
                  </Button>
                }
              />
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
