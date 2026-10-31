import { useQuery } from '@tanstack/react-query'
import { Card, PageHeader } from '@/components/ui/primitives'
import { adminAudit } from '@/lib/admin'
import { formatDate } from '@/lib/utils'
import { Loaded } from '@/components/admin/parts'

const actionLabel: Record<string, string> = { grant_courtesy: 'Cortesia concedida', extend_trial: 'Teste prolongado', update_plan: 'Plano alterado', delete_error: 'Erro apagado' }

export default function Audit() {
  const q = useQuery({ queryKey: ['admin', 'audit'], queryFn: adminAudit, retry: false })
  return (
    <div>
      <PageHeader title="Registro de ações" description="Tudo o que um administrador alterou, com quem e quando." />
      <Loaded query={q}>
        {(rows) => rows.length === 0 ? <p className="text-sm text-slate-500">Nenhuma ação registrada ainda.</p> : (
          <div className="space-y-2">
            {rows.map((a, i) => (
              <Card key={i} className="p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{actionLabel[a.action] ?? a.action}{a.workspace ? ` · ${a.workspace}` : ''}</span><span className="text-xs text-slate-500">{formatDate(a.created_at, 'dd/MM/yyyy HH:mm')} · {a.admin}</span></div>
                {Object.keys(a.detail ?? {}).length > 0 && <p className="mt-1 break-words text-xs text-slate-500">{JSON.stringify(a.detail)}</p>}
              </Card>
            ))}
          </div>
        )}
      </Loaded>
    </div>
  )
}
