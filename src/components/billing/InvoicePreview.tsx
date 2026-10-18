import { invoiceTotals, nfseRegimes } from '@/lib/nfse'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { NfseRegime, NfseTaxes } from '@/types/database.types'

export interface InvoicePreviewData {
  number: string | null
  status: 'draft' | 'issued'
  issuer: { name: string; document: string; email: string; phone: string }
  customer: { name: string; document: string; email: string } | null
  service: { label: string; code: string; cnae: string; nbs?: string } | null
  /** Onde o serviço foi prestado (município), como o Asaas está configurado. */
  place?: string
  description: string
  value: number
  date: string
  observations: string
  regime: NfseRegime
  taxes: NfseTaxes
  deductions: number
}

/**
 * Prévia da NFS-e em folha A4, no layout das notas de serviço. É só a
 * conferência antes de emitir: a nota oficial é a que o Portal Nacional gera.
 */
export function InvoicePreview({ data }: { data: InvoicePreviewData }) {
  const row = 'grid grid-cols-[140px_1fr] gap-3 py-1'
  const label = 'text-[11px] uppercase tracking-wider text-slate-500'
  const totals = invoiceTotals(data.value, data.regime, data.taxes, data.deductions)
  const federal = data.regime === 'normal' ? (['ir', 'pis', 'cofins', 'csll', 'inss'] as const).filter((k) => Number(data.taxes[k]) > 0) : []
  return (
    <article className="mx-auto w-full max-w-[794px] bg-white px-[7%] py-[6%] text-[13px] leading-relaxed text-slate-900 shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">NFS-e</p>
          <h1 className="text-lg font-bold">Nota Fiscal de Serviço Eletrônica</h1>
        </div>
        <div className="text-right">
          <p className={label}>Número</p>
          <p className="tabular text-lg font-bold">{data.number ?? '—'}</p>
          <p className="text-xs text-slate-500">Competência {formatDate(data.date)}</p>
        </div>
      </header>

      {data.status === 'draft' && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-amber-800">Prévia · sem valor fiscal até ser autorizada</p>
      )}

      <section className="mt-5">
        <h2 className="mb-1 border-b pb-1 text-xs font-bold uppercase tracking-wider">Prestador do serviço</h2>
        <div className={row}>
          <span className={label}>Nome</span>
          <span className="font-medium">{data.issuer.name || '—'}</span>
        </div>
        <div className={row}>
          <span className={label}>CNPJ</span>
          <span className="tabular">{data.issuer.document || '—'}</span>
        </div>
        <div className={row}>
          <span className={label}>Contato</span>
          <span>{[data.issuer.email, data.issuer.phone].filter(Boolean).join(' · ') || '—'}</span>
        </div>
        <div className={row}>
          <span className={label}>Regime</span>
          <span>{nfseRegimes[data.regime].label}</span>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-1 border-b pb-1 text-xs font-bold uppercase tracking-wider">Tomador do serviço</h2>
        {data.customer ? (
          <>
            <div className={row}>
              <span className={label}>Nome</span>
              <span className="font-medium">{data.customer.name}</span>
            </div>
            <div className={row}>
              <span className={label}>CPF / CNPJ</span>
              <span className="tabular">{data.customer.document || <em className="text-red-600">sem documento cadastrado</em>}</span>
            </div>
            {data.customer.email && (
              <div className={row}>
                <span className={label}>E-mail</span>
                <span>{data.customer.email}</span>
              </div>
            )}
          </>
        ) : (
          <p className="py-1 text-slate-400">Escolha o recebimento pago para preencher o tomador.</p>
        )}
      </section>

      <section className="mt-5">
        <h2 className="mb-1 border-b pb-1 text-xs font-bold uppercase tracking-wider">Serviço</h2>
        <div className={row}>
          <span className={label}>Serviço</span>
          <span>{data.service?.label || '—'}</span>
        </div>
        <div className={row}>
          <span className={label}>Código</span>
          <span className="tabular">
            {data.service?.code || <em className="text-red-600">sem código</em>}
            {data.service?.cnae && <span className="text-slate-500"> · CNAE {data.service.cnae}</span>}
          </span>
        </div>
        {data.service?.nbs && (
          <div className={row}>
            <span className={label}>NBS</span>
            <span className="tabular">{data.service.nbs}</span>
          </div>
        )}
        {data.place && (
          <div className={row}>
            <span className={label}>Local da prestação</span>
            <span>{data.place}</span>
          </div>
        )}
        <div className="mt-2">
          <p className={label}>Discriminação dos serviços</p>
          <p className="mt-1 min-h-[72px] whitespace-pre-line rounded border border-slate-200 p-3">{data.description || '—'}</p>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-1 border-b pb-1 text-xs font-bold uppercase tracking-wider">Valores</h2>
        <div className="grid grid-cols-2 gap-x-6">
          <div className={row}>
            <span className={label}>Valor do serviço</span>
            <span className="tabular text-right">{formatCurrency(data.value)}</span>
          </div>
          <div className={row}>
            <span className={label}>Deduções</span>
            <span className="tabular text-right">{formatCurrency(data.regime === 'mei' ? 0 : data.deductions)}</span>
          </div>
          {data.regime === 'mei' ? (
            <div className={row}>
              <span className={label}>ISS</span>
              <span className="text-right">recolhido no DAS (MEI)</span>
            </div>
          ) : (
            <>
              <div className={row}>
                <span className={label}>Base do ISS</span>
                <span className="tabular text-right">{formatCurrency(totals.base)}</span>
              </div>
              <div className={row}>
                <span className={label}>
                  ISS{data.taxes.retainIss ? ' retido' : ''} ({Number(data.taxes.iss ?? 0).toLocaleString('pt-BR')}%)
                </span>
                <span className="tabular text-right">
                  {formatCurrency(totals.iss)}
                </span>
              </div>
            </>
          )}
          {federal.map((k) => (
            <div key={k} className={row}>
              <span className={label}>
                {k.toUpperCase()} retido ({Number(data.taxes[k]).toLocaleString('pt-BR')}%)
              </span>
              <span className="tabular text-right">{formatCurrency((data.value * Number(data.taxes[k])) / 100)}</span>
            </div>
          ))}
          <div className={row}>
            <span className={label}>Total de retenções</span>
            <span className="tabular text-right">{formatCurrency(totals.retentions)}</span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t-2 border-slate-900 pt-2">
          <span className="text-xs font-bold uppercase tracking-wider">Valor líquido</span>
          <span className="tabular text-lg font-bold">{formatCurrency(totals.net)}</span>
        </div>
      </section>

      {data.observations && (
        <section className="mt-5">
          <h2 className="mb-1 border-b pb-1 text-xs font-bold uppercase tracking-wider">Observações</h2>
          <p className="whitespace-pre-line">{data.observations}</p>
        </section>
      )}
    </article>
  )
}
