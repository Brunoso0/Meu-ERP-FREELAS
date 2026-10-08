import { useId } from 'react'
import { useA4Fit } from '@/components/proposals/useA4Fit'
import type { QuoteDoc } from '@/lib/quote'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import '@/components/proposals/proposal-document.css'

/**
 * Orçamento em folha A4, no mesmo visual da proposta comercial (ondas,
 * degradê magenta/roxo), com o bloco de pagamento via Pix. Usado no preview
 * do gerador e, dentro de um PrintPortal, no "Salvar em PDF / Imprimir".
 */
export function QuoteDocument({ doc, className }: { doc: QuoteDoc; className?: string }) {
  const { frame, zoom } = useA4Fit()
  // preview e cópia de impressão convivem na mesma tela: ids de gradiente não podem colidir
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const wave1 = `qWave1${uid}`
  const wave2 = `qWave2${uid}`
  const titleSize = doc.title.length > 70 ? 'pd-xlong' : doc.title.length > 38 ? 'pd-long' : ''

  return (
    <div ref={frame} className={cn('w-full', className)}>
      <div className="pdoc" style={{ zoom }}>
        <section className="pd-page pd-quote">
          <div className="pd-wave-header pd-quote-wave" aria-hidden="true">
            <svg viewBox="0 0 794 360" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id={wave1} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF007A" />
                  <stop offset="45%" stopColor="#9C27B0" />
                  <stop offset="100%" stopColor="#4A0E4E" />
                </linearGradient>
                <linearGradient id={wave2} x1="10%" y1="0%" x2="90%" y2="100%">
                  <stop offset="0%" stopColor="#E91E63" />
                  <stop offset="60%" stopColor="#7B1FA2" />
                  <stop offset="100%" stopColor="#311B92" />
                </linearGradient>
              </defs>
              <path d="M0 0H794V160C710 240 610 260 520 220C400 166 310 80 180 140C90 181 30 250 0 280V0Z" fill={`url(#${wave1})`} />
              <path d="M0 0H794V90C670 190 540 260 410 210C270 156 180 80 80 140C30 170 0 210 0 210V0Z" fill={`url(#${wave2})`} opacity="0.9" />
              <path d="M260 0C360 80 470 170 600 130C690 102 750 60 794 30V0H260Z" fill="#FFFFFF" opacity="0.12" />
            </svg>
          </div>

          <div className="pd-cover-tag pd-quote-tag">
            <div>
              <h4>{doc.issuer.name}</h4>
              {(doc.issuer.email || doc.issuer.phone) && <p>{[doc.issuer.email, doc.issuer.phone].filter(Boolean).join(' · ')}</p>}
            </div>
            <div className="pd-quote-number">
              <p>Orçamento</p>
              <h4>{doc.number}</h4>
            </div>
          </div>

          <div className="pd-content pd-quote-content">
            <span className="pd-cover-badge">Orçamento</span>
            <h1 className={cn('pd-cover-title pd-quote-title', titleSize)}>{doc.title}</h1>

            <div className="pd-cover-meta pd-quote-meta">
              <div className="pd-meta-item">
                <h6>Cliente</h6>
                <p>{doc.customer.name || 'A definir'}</p>
                {(doc.customer.document || doc.customer.contact) && (
                  <span>{[doc.customer.document, doc.customer.contact].filter(Boolean).join(' · ')}</span>
                )}
              </div>
              <div className="pd-meta-item">
                <h6>Data de emissão</h6>
                <p>{formatDate(doc.date)}</p>
              </div>
              <div className="pd-meta-item">
                <h6>Validade</h6>
                <p>
                  {doc.validityDays} dias (até {formatDate(doc.validUntil)})
                </p>
              </div>
            </div>

            <div className="pd-table-box">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="pd-num">Qtd.</th>
                    <th className="pd-num">Unitário</th>
                    <th className="pd-num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td className="pd-num">{item.quantity}</td>
                      <td className="pd-num">{formatCurrency(item.unit_price)}</td>
                      <td className="pd-num" style={{ fontWeight: 600 }}>
                        {formatCurrency(item.quantity * item.unit_price)}
                      </td>
                    </tr>
                  ))}
                  <tr className="pd-total-row">
                    <td colSpan={3}>Total do orçamento</td>
                    <td className="pd-num">{formatCurrency(doc.total)}</td>
                  </tr>
                  {doc.split.map((part) => (
                    <tr key={part.label}>
                      <td colSpan={3} style={{ fontWeight: 600 }}>
                        {part.label}
                        {part.paid && ' · pago'}
                      </td>
                      <td className="pd-num" style={{ fontWeight: 600 }}>
                        {formatCurrency(part.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {doc.notes && (
              <div className="pd-strip" style={{ marginTop: 0, marginBottom: 20 }}>
                <strong>Observações</strong>
                {doc.notes}
              </div>
            )}

            {/* Pix vem do perfil (Minha empresa): com QR, com chave, ou os dois */}
            {(doc.pix.qr || doc.pix.key) && (
              <div className="pd-pix-card">
                {doc.pix.qr && (
                  // QR sempre sobre branco, com margem: é o que garante a leitura pela câmera
                  <div className="pd-pix-qr">
                    <img src={doc.pix.qr} alt="QR Code Pix para pagamento" />
                  </div>
                )}
                <div className="pd-pix-info">
                  <h3>Pagamento via Pix</h3>
                  {doc.split.length > 0 && <p className="pd-pix-due">{doc.due.label}</p>}
                  <p className="pd-pix-total">{formatCurrency(doc.due.amount)}</p>
                  {doc.pix.key && (
                    <p className="pd-pix-key">
                      Chave Pix: <strong>{doc.pix.key}</strong>
                    </p>
                  )}
                  <ol>
                    {doc.pix.qr ? (
                      <>
                        <li>Abra o app do seu banco e escolha Pix &gt; Ler QR Code.</li>
                        <li>Aponte a câmera para o código ao lado{doc.pix.key && ' ou use a chave acima'}.</li>
                      </>
                    ) : (
                      <>
                        <li>Abra o app do seu banco e escolha Pix &gt; Pagar com chave.</li>
                        <li>Informe a chave acima.</li>
                      </>
                    )}
                    <li>Confira o favorecido, informe o valor de {formatCurrency(doc.due.amount)} e confirme.</li>
                    <li>Envie o comprovante para darmos início ao serviço.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          <div className="pd-footer-bar">
            <span>
              {doc.issuer.name}
              {doc.issuer.document && ` · ${doc.issuer.document}`}
            </span>
            <span className="pd-page-pill">{doc.number}</span>
          </div>
        </section>
      </div>
    </div>
  )
}
