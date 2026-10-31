import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Card, PageHeader } from '@/components/ui/primitives'
import { adminErrors, type AdminError } from '@/lib/admin'
import { formatDate } from '@/lib/utils'
import { Loaded } from '@/components/admin/parts'

function Row({ e }: { e: AdminError }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-3">
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{e.message}</p>
          <p className="truncate text-xs text-slate-500">{e.kind ?? '—'} · {e.path || '—'} · v{e.app_version ?? '?'} · última {formatDate(e.last_seen, 'dd/MM HH:mm')}</p>
        </div>
        <div className="flex shrink-0 gap-1.5"><Badge tone="red">{e.count}x</Badge><Badge>{e.people} pessoa(s)</Badge></div>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs">
          {e.context && <pre className="overflow-x-auto rounded bg-slate-50 p-2 dark:bg-slate-900">{JSON.stringify(e.context, null, 2)}</pre>}
          {e.breadcrumbs && <div><p className="mb-1 font-medium">Rastro (mais antigo primeiro)</p><pre className="overflow-x-auto rounded bg-slate-50 p-2 dark:bg-slate-900">{e.breadcrumbs.map((b) => JSON.stringify(b)).join('\n')}</pre></div>}
          {e.stack && <div><p className="mb-1 font-medium">Pilha</p><pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 dark:bg-slate-900">{e.stack}</pre></div>}
          <p className="text-slate-500">{e.user_agent}</p>
        </div>
      )}
    </Card>
  )
}

export default function Errors() {
  const q = useQuery({ queryKey: ['admin', 'errors'], queryFn: adminErrors, retry: false })
  return (
    <div>
      <PageHeader title="Erros do app" description="O que quebrou no navegador de alguém, do mais recente para o mais antigo." />
      <Loaded query={q}>
        {(rows) => rows.length === 0 ? <p className="text-sm text-slate-500">Nenhum erro registrado. Bom sinal.</p> : <div className="space-y-2">{rows.map((e) => <Row key={e.id} e={e} />)}</div>}
      </Loaded>
    </div>
  )
}
