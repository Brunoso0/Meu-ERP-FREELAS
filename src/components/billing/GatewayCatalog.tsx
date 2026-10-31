import { Badge } from '@/components/ui/primitives'
import { gatewayCatalog } from '@/lib/billing'
import { cn } from '@/lib/utils'
import { useBillingConnection } from './GatewayConnection'

/** Os gateways de pagamento: o Asaas já funciona; os demais estão a caminho (só a vitrine, sem configuração). */
export function GatewayCatalog() {
  const connection = useBillingConnection()
  const connected = connection.data?.provider
  return (
    <ul className="col-span-2 grid gap-3 sm:grid-cols-2">
      {gatewayCatalog.map((g) => {
        const isConnected = connected === g.id
        return (
          <li key={g.id} className={cn('flex items-start gap-3 rounded-lg border p-3', !g.available && 'opacity-75')}>
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-600/20 dark:text-brand-400">
              {g.name.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{g.name}</p>
                {isConnected ? <Badge tone="green">Conectado</Badge> : g.available ? <Badge tone="indigo">Disponível</Badge> : <Badge tone="slate">Em breve</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{g.hint}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
