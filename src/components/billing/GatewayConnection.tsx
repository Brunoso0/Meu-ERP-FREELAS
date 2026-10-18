import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, ExternalLink, KeyRound, Loader2, PlugZap, TriangleAlert, Unplug } from 'lucide-react'
import { confirm } from '@/components/ui/confirm'
import { Badge, Button, Field, Input, Select } from '@/components/ui/primitives'
import { connectGateway, disconnectGateway, getBillingConnection, type GatewayEnv } from '@/lib/billing'
import { formatDate } from '@/lib/utils'

export const billingConnectionKey = ['billing-connection']

export function useBillingConnection() {
  return useQuery({ queryKey: billingConnectionKey, queryFn: getBillingConnection, staleTime: 60_000 })
}

/**
 * Conexão com a conta do Asaas. A chave de API é enviada uma vez para a
 * função `billing`, que a guarda cifrada; ela não volta mais para a tela.
 */
export function GatewayConnection({ onProviderChange }: { onProviderChange: (provider: 'simple' | 'asaas') => void }) {
  const qc = useQueryClient()
  const connection = useBillingConnection()
  const [editing, setEditing] = useState(false)
  const [environment, setEnvironment] = useState<GatewayEnv>('production')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: billingConnectionKey })
    await qc.invalidateQueries({ queryKey: ['profiles'] })
  }

  const connect = async () => {
    setError(null)
    if (!apiKey.trim()) return setError('Cole a chave de API do Asaas.')
    setBusy(true)
    try {
      const result = await connectGateway(environment, apiKey.trim())
      setApiKey('')
      setEditing(false)
      onProviderChange('asaas')
      await refresh()
      if (result.webhookError) {
        toast.warning('Asaas conectado, mas sem baixa automática', { description: `O aviso de pagamento não foi criado: ${result.webhookError}` })
      } else {
        toast.success('Asaas conectado', { description: result.account_name ? `Conta ${result.account_name}` : undefined })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível conectar.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar o Asaas?',
      description: 'A chave é apagada daqui e o aviso de pagamento é removido do Asaas. As cobranças já criadas continuam valendo no Asaas, mas deixam de dar baixa sozinhas aqui. A forma de cobrança volta para a simples (Pix fixo).',
      confirmLabel: 'Desconectar',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await disconnectGateway()
      onProviderChange('simple')
      await refresh()
      toast.success('Asaas desconectado')
    } catch (err) {
      toast.error('Não foi possível desconectar', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  if (connection.isLoading) {
    return (
      <div className="col-span-2 flex items-center gap-2 rounded-lg border p-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Verificando a conexão com o Asaas…
      </div>
    )
  }

  const current = connection.data
  if (current && !editing) {
    return (
      <div className="col-span-2 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">Conectado ao Asaas{current.account_name ? ` · ${current.account_name}` : ''}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Desde {formatDate(current.connected_at)}</p>
            </div>
          </div>
          <Badge tone={current.environment === 'production' ? 'green' : 'amber'}>{current.environment === 'production' ? 'Produção' : 'Sandbox (testes)'}</Badge>
        </div>
        {current.webhook ? (
          <p className="text-xs text-slate-600 dark:text-slate-300">Baixa automática ativa: quando o cliente paga, o lançamento vira "pago" sozinho.</p>
        ) : (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Sem baixa automática: o aviso de pagamento não foi criado no Asaas. Conecte de novo para tentar outra vez, ou use "Atualizar situação" em cada cobrança.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={busy}>
            <KeyRound className="h-3.5 w-3.5" /> Trocar chave
          </Button>
          <Button variant="danger" size="sm" onClick={disconnect} loading={busy}>
            <Unplug className="h-3.5 w-3.5" /> Desconectar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="col-span-2 space-y-3 rounded-lg border p-3">
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <p>
          No Asaas, vá em <strong>Integrações → Chaves de API</strong>, gere uma chave e cole aqui. Ela é guardada cifrada no banco e não aparece de novo nesta tela.
        </p>
        <a href="https://www.asaas.com/customerConfigIntegrations/index" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400">
          Abrir Integrações no Asaas <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Ambiente">
          <Select value={environment} onChange={(e) => setEnvironment(e.target.value as GatewayEnv)}>
            <option value="production">Produção</option>
            <option value="sandbox">Sandbox (testes)</option>
          </Select>
        </Field>
        <Field label="Chave de API">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setError(null)
            }}
            placeholder="$aact_..."
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={connect} loading={busy}>
          <PlugZap className="h-3.5 w-3.5" /> Conectar
        </Button>
        {current && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={busy}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
