import { PIX_QR_PATH, type QuoteDoc } from '@/lib/pdf'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">{title}</h3>
      {children}
    </section>
  )
}

/** Folha do orçamento. Sempre clara, como a da proposta: é um documento para envio. */
export function QuoteDocument({ doc, className }: { doc: QuoteDoc; className?: string }) {
  return (
    <article className={cn('print-sheet overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 bg-brand-600 px-8 py-6 text-white">
        <div>
          <p className="text-lg font-semibold tracking-tight">{doc.issuer.name}</p>
          <p className="text-xs text-white/75">{[doc.issuer.document, doc.issuer.email, doc.issuer.phone].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/75">Orçamento</p>
          <p className="tabular text-base font-semibold">{doc.number}</p>
        </div>
      </header>

      <div className="px-8 py-7 text-sm leading-relaxed">
        <h2 className="text-2xl font-semibold tracking-tight">{doc.title}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Emitido em {formatDate(doc.date)} · válido até {formatDate(doc.validUntil)} ({doc.validityDays} dias)
        </p>

        <Section title="Cliente">
          {doc.customer.name ? (
            <>
              <p className="font-medium">{doc.customer.name}</p>
              <p className="text-xs text-slate-500">{[doc.customer.document, doc.customer.contact].filter(Boolean).join(' · ')}</p>
            </>
          ) : (
            <p className="text-slate-400">Selecione ou informe o cliente</p>
          )}
        </Section>

        <Section title="Itens">
          <table className="w-full">
            <tbody>
              {doc.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-700">
                    {item.description}
                    {item.quantity !== 1 && (
                      <span className="tabular ml-2 text-xs text-slate-400">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </span>
                    )}
                  </td>
                  <td className="tabular whitespace-nowrap py-2 text-right">{formatCurrency(item.quantity * item.unit_price)}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 text-base font-semibold">Total</td>
                <td className="tabular whitespace-nowrap pt-3 text-right text-base font-semibold text-brand-600">{formatCurrency(doc.total)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {doc.notes && (
          <Section title="Observações">
            <p className="whitespace-pre-line text-slate-700">{doc.notes}</p>
          </Section>
        )}

        <Section title="Pagamento via Pix">
          <div className="flex flex-wrap items-center gap-5 rounded-xl border border-slate-200 p-4">
            <img src={PIX_QR_PATH} alt="QR Code Pix para pagamento" className="h-36 w-36 shrink-0 rounded-md" />
            <div className="min-w-[200px] flex-1">
              <p className="tabular text-2xl font-semibold tracking-tight">{formatCurrency(doc.total)}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-600">
                <li>Abra o app do seu banco e escolha Pix &gt; Ler QR Code.</li>
                <li>Aponte a câmera para o código ao lado.</li>
                <li>Confira o favorecido, informe o valor de {formatCurrency(doc.total)} e confirme.</li>
                <li>Envie o comprovante para darmos início ao serviço.</li>
              </ol>
            </div>
          </div>
        </Section>
      </div>
    </article>
  )
}
