import type { ProposalDoc } from '@/lib/proposal'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Folha da proposta. Sempre clara (é um documento para impressão), mesmo com
 * o app em tema escuro. Usada no preview do gerador e na página da proposta.
 */
export function ProposalDocument({ doc, className }: { doc: ProposalDoc; className?: string }) {
  return (
    <article className={cn('print-sheet overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 bg-brand-600 px-8 py-6 text-white">
        <div>
          <p className="text-lg font-semibold tracking-tight">{doc.issuer.name}</p>
          <p className="text-xs text-white/75">{[doc.issuer.document, doc.issuer.email, doc.issuer.phone].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/75">Proposta comercial</p>
          <p className="tabular text-base font-semibold">{doc.number}</p>
        </div>
      </header>

      <div className="px-8 py-7 text-sm leading-relaxed">
        <h2 className="text-2xl font-semibold tracking-tight">{doc.title}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Emitida em {formatDate(doc.date)} · válida até {formatDate(doc.validUntil)} ({doc.validityDays} dias)
        </p>

        <Section title="Cliente">
          {doc.client.name ? (
            <>
              <p className="font-medium">{[doc.client.name, doc.client.company].filter(Boolean).join(' — ')}</p>
              <p className="text-xs text-slate-500">{[doc.client.document, doc.client.email, doc.client.phone].filter(Boolean).join(' · ')}</p>
            </>
          ) : (
            <p className="text-slate-400">Selecione um cliente</p>
          )}
        </Section>

        {doc.scope && (
          <Section title="Escopo">
            <p className="whitespace-pre-line text-slate-700">{doc.scope}</p>
          </Section>
        )}

        {doc.deliverables.length > 0 && (
          <Section title="Entregáveis">
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              {doc.deliverables.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </Section>
        )}

        {doc.schedule.length > 0 && (
          <Section title="Cronograma">
            <ol className="space-y-1.5">
              {doc.schedule.map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-1.5 last:border-0">
                  <span className="text-slate-700">
                    {i + 1}. {s.label}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{s.duration}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        <Section title="Investimento">
          <table className="w-full">
            <tbody>
              {doc.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-700">
                    {item.description}
                    {Number(item.quantity) !== 1 && (
                      <span className="tabular ml-2 text-xs text-slate-400">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </span>
                    )}
                  </td>
                  <td className="tabular whitespace-nowrap py-2 text-right">{formatCurrency(Number(item.quantity) * Number(item.unit_price))}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 text-base font-semibold">Total</td>
                <td className="tabular whitespace-nowrap pt-3 text-right text-base font-semibold text-brand-600">{formatCurrency(doc.total)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {doc.paymentTerms && (
          <Section title="Condições de pagamento">
            <p className="whitespace-pre-line text-slate-700">{doc.paymentTerms}</p>
          </Section>
        )}

        <div className="mt-16 grid grid-cols-2 gap-10 text-xs text-slate-500">
          <div className="border-t border-slate-300 pt-2">{doc.issuer.name}</div>
          <div className="border-t border-slate-300 pt-2">{doc.client.company || doc.client.name || 'Cliente'}</div>
        </div>
      </div>
    </article>
  )
}
