import { useId } from 'react'
import type { ProposalDoc } from '@/lib/proposal'
import { cn, formatCurrency, formatDate, maskCpfCnpj } from '@/lib/utils'
import { useA4Fit } from './useA4Fit'
import './proposal-document.css'

const MAX_ITEM_CARDS = 4

/** "2 semanas", "10 dias", "1 mês" -> dias. Texto livre que não dá para ler vira null. */
function durationInDays(text: string): number | null {
  const match = text.trim().toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(dias?|semanas?|m[eê]s(?:es)?)/)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  const unit = match[2]
  return amount * (unit.startsWith('dia') ? 1 : unit.startsWith('semana') ? 7 : 30)
}

const daysLabel = (days: number) => {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return days % 7 === 0 ? plural(days / 7, 'semana', 'semanas') : plural(Math.round(days), 'dia', 'dias')
}

const two = (n: number) => String(n).padStart(2, '0')

function Footer({ doc, page }: { doc: ProposalDoc; page: number }) {
  return (
    <div className="pd-footer-bar">
      <span>
        {doc.issuer.name} · Proposta {doc.number}
      </span>
      <span className="pd-page-pill">{two(page)}</span>
    </div>
  )
}

function CoverWaves({ uid }: { uid: string }) {
  return (
    <>
      <div className="pd-wave-header" aria-hidden="true">
        <svg viewBox="0 0 794 360" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id={`pdWave1${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF007A" />
              <stop offset="45%" stopColor="#9C27B0" />
              <stop offset="100%" stopColor="#4A0E4E" />
            </linearGradient>
            <linearGradient id={`pdWave2${uid}`} x1="10%" y1="0%" x2="90%" y2="100%">
              <stop offset="0%" stopColor="#E91E63" />
              <stop offset="60%" stopColor="#7B1FA2" />
              <stop offset="100%" stopColor="#311B92" />
            </linearGradient>
          </defs>
          <path d="M0 0H794V160C710 240 610 260 520 220C400 166 310 80 180 140C90 181 30 250 0 280V0Z" fill={`url(#pdWave1${uid})`} />
          <path d="M0 0H794V90C670 190 540 260 410 210C270 156 180 80 80 140C30 170 0 210 0 210V0Z" fill={`url(#pdWave2${uid})`} opacity="0.9" />
          <path d="M260 0C360 80 470 170 600 130C690 102 750 60 794 30V0H260Z" fill="#FFFFFF" opacity="0.12" />
        </svg>
      </div>
      <div className="pd-wave-footer" aria-hidden="true">
        <svg viewBox="0 0 794 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id={`pdWaveBottom${uid}`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#E91E63" />
              <stop offset="50%" stopColor="#8E24AA" />
              <stop offset="100%" stopColor="#311B92" />
            </linearGradient>
          </defs>
          <path d="M794 260H0V160C140 100 280 200 420 180C560 160 670 60 794 110V260Z" fill={`url(#pdWaveBottom${uid})`} />
          <path d="M794 260H220C380 230 480 140 600 150C700 158 760 210 794 230V260Z" fill="#EC008C" opacity="0.6" />
        </svg>
      </div>
    </>
  )
}

/**
 * Proposta comercial em páginas A4: capa, escopo, cronograma (se houver),
 * investimento e contracapa. Usada no preview do gerador, na página da
 * proposta e, dentro de um PrintPortal, no "Salvar em PDF / Imprimir".
 *
 * O documento tem 210mm de largura e encolhe (zoom) para caber no espaço
 * disponível na tela. Na impressão volta ao tamanho real.
 */
export function ProposalDocument({ doc, className }: { doc: ProposalDoc; className?: string }) {
  const { frame, zoom } = useA4Fit()
  // a tela e a cópia de impressão convivem na mesma página: ids de gradiente não podem colidir
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  const clientName = [doc.client.name, doc.client.company].filter(Boolean).join(' — ')
  const clientShort = doc.client.company || doc.client.name || 'Cliente'
  const hasSchedule = doc.schedule.length > 0

  // cronograma: só vira gráfico quando todas as durações são legíveis ("2 semanas", "10 dias")
  const days = doc.schedule.map((s) => durationInDays(s.duration))
  const totalDays = days.every((d): d is number => d !== null) ? days.reduce((a, b) => a + b, 0) : null
  const longest = Math.max(1, ...days.map((d) => d ?? 0))

  const titleSize = doc.title.length > 60 ? 'pd-xlong' : doc.title.length > 30 ? 'pd-long' : ''
  const showCards = doc.items.length > 0 && doc.items.length <= MAX_ITEM_CARDS

  // numeração de páginas e de seções acompanha as páginas que existem
  const schedulePage = hasSchedule ? 3 : null
  const investmentPage = hasSchedule ? 4 : 3
  const investmentSection = hasSchedule ? 3 : 2

  return (
    <div ref={frame} className={cn('w-full', className)}>
      <div className="pdoc" style={{ zoom }}>
        {/* ---------- capa ---------- */}
        <section className="pd-page pd-cover">
          <CoverWaves uid={uid} />
          <div className="pd-cover-tag">
            <h4>{doc.issuer.name}</h4>
            {(doc.issuer.email || doc.issuer.phone) && <p>{[doc.issuer.email, doc.issuer.phone].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="pd-cover-body">
            <span className="pd-cover-badge">Proposta comercial</span>
            <h1 className={cn('pd-cover-title', titleSize)}>{doc.title}</h1>
            <p className="pd-cover-number">{doc.number}</p>
            <div className="pd-cover-meta">
              <div className="pd-meta-item">
                <h6>Cliente / Contratante</h6>
                <p>{clientShort}</p>
              </div>
              <div className="pd-meta-item">
                <h6>Data de emissão</h6>
                <p>{formatDate(doc.date, "dd 'de' MMMM 'de' yyyy")}</p>
              </div>
              <div className="pd-meta-item">
                <h6>Validade da proposta</h6>
                <p>
                  {doc.validityDays} dias corridos (até {formatDate(doc.validUntil)})
                </p>
              </div>
              <div className="pd-meta-item">
                <h6>Investimento</h6>
                <p>{formatCurrency(doc.total)}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- escopo ---------- */}
        <section className="pd-page">
          <div className="pd-content">
            <h2 className="pd-section-title">01. Escopo</h2>
            {doc.scope && <p className="pd-lead">{doc.scope}</p>}
            <div className="pd-dual">
              <div className="pd-hero-card">
                <h3 className="pd-hero-title">Entregáveis</h3>
                {doc.deliverables.length > 0 ? (
                  <ul className="pd-bullets">
                    {doc.deliverables.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="pd-bullets">Conforme descrito no escopo.</p>
                )}
              </div>
              <div className="pd-hero-card">
                <h3 className="pd-hero-title">Contratante</h3>
                <dl className="pd-facts">
                  <div>
                    <dt>Nome</dt>
                    <dd>{clientName || 'A definir'}</dd>
                  </div>
                  {doc.client.document && (
                    <div>
                      <dt>CPF / CNPJ</dt>
                      <dd>{doc.client.document}</dd>
                    </div>
                  )}
                  {doc.client.email && (
                    <div>
                      <dt>E-mail</dt>
                      <dd>{doc.client.email}</dd>
                    </div>
                  )}
                  {doc.client.phone && (
                    <div>
                      <dt>WhatsApp</dt>
                      <dd>{doc.client.phone}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
            <div className="pd-strip">
              <strong>Validade</strong>
              Esta proposta é válida por {doc.validityDays} dias corridos, até {formatDate(doc.validUntil)}. Após essa data, valores e prazos podem ser revistos.
            </div>
          </div>
          <Footer doc={doc} page={2} />
        </section>

        {/* ---------- cronograma ---------- */}
        {schedulePage && (
          <section className="pd-page">
            <div className="pd-content">
              <h2 className="pd-section-title">02. Etapas &amp; Cronograma</h2>

              {totalDays !== null && (
                <div className="pd-chart-box">
                  <div className="pd-chart-title">
                    <span>Duração por etapa</span>
                    <small>Prazo total: {daysLabel(totalDays)}</small>
                  </div>
                  <div className="pd-bars">
                    {doc.schedule.map((s, i) => (
                      <div key={i} className="pd-bar-col">
                        <span className="pd-bar-value">{s.duration}</span>
                        <div className="pd-bar-fill" style={{ height: `${Math.max(8, ((days[i] ?? 0) / Math.max(longest, totalDays)) * 100)}px` }} />
                        <span className="pd-bar-label">Etapa {i + 1}</span>
                      </div>
                    ))}
                    <div className="pd-bar-col">
                      <span className="pd-bar-value">{daysLabel(totalDays)}</span>
                      <div className="pd-bar-fill pd-total" style={{ height: '100px' }} />
                      <span className="pd-bar-label">Total</span>
                    </div>
                  </div>
                </div>
              )}

              <div className={cn('pd-steps-grid', totalDays === null && 'pd-single')}>
                <div className="pd-steps">
                  {doc.schedule.map((s, i) => (
                    <div key={i} className="pd-step">
                      <div className="pd-step-circle">{two(i + 1)}</div>
                      <div>
                        <h5>{s.label}</h5>
                        {s.duration && <p>Duração: {s.duration}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {totalDays !== null && (
                  <div className="pd-side-card">
                    <h4>Prazo total</h4>
                    <p className="pd-side-big">{daysLabel(totalDays)}</p>
                    <p>
                      Soma das {doc.schedule.length} etapas, contada a partir da aprovação da proposta e do recebimento dos materiais necessários.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <Footer doc={doc} page={schedulePage} />
          </section>
        )}

        {/* ---------- investimento ---------- */}
        <section className="pd-page">
          <div className="pd-content">
            <h2 className="pd-section-title">{two(investmentSection)}. Investimento &amp; Contratação</h2>

            {showCards && (
              <div className="pd-pricing-grid">
                {doc.items.map((item, i) => (
                  <div key={i} className="pd-pricing-card">
                    <div>
                      <small>{two(i + 1)}</small>
                      <h4>{item.description}</h4>
                      {Number(item.quantity) !== 1 && (
                        <p>
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </p>
                      )}
                    </div>
                    <span className="pd-price-tag">{formatCurrency(Number(item.quantity) * Number(item.unit_price))}</span>
                  </div>
                ))}
              </div>
            )}

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
                        {formatCurrency(Number(item.quantity) * Number(item.unit_price))}
                      </td>
                    </tr>
                  ))}
                  <tr className="pd-total-row">
                    <td colSpan={3}>Investimento total do projeto</td>
                    <td className="pd-num">{formatCurrency(doc.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {doc.paymentTerms && (
              <div className="pd-strip" style={{ marginTop: 0 }}>
                <strong>Condições de pagamento</strong>
                {doc.paymentTerms}
              </div>
            )}

            <div className="pd-signatures">
              <div className="pd-sign-line">
                <strong>{doc.issuer.name}</strong>
                {doc.issuer.document ? `CPF/CNPJ: ${doc.issuer.document}` : 'Contratada'}
              </div>
              {doc.signature ? (
                <div className="pd-sign-line pd-signed">
                  {doc.signature.image && <img src={doc.signature.image} alt="Assinatura do cliente" className="pd-sign-image" />}
                  <strong>De acordo: {doc.signature.name || clientShort}</strong>
                  {doc.signature.document && <>CPF/CNPJ: {maskCpfCnpj(doc.signature.document)} · </>}
                  {doc.signature.method === 'link' ? 'Assinado eletronicamente em ' : 'Cópia assinada recebida em '}
                  {formatDate(doc.signature.signedAt, doc.signature.method === 'link' ? "dd/MM/yyyy 'às' HH:mm" : 'dd/MM/yyyy')}
                  {(doc.signature.ip || doc.signature.hash) && (
                    <span className="pd-sign-evidence">
                      {doc.signature.ip && <>IP {doc.signature.ip}</>}
                      {doc.signature.ip && doc.signature.hash && ' · '}
                      {doc.signature.hash && <>Registro {doc.signature.hash.slice(0, 16)}</>}
                    </span>
                  )}
                </div>
              ) : (
                <div className="pd-sign-line">
                  <strong>De acordo: {clientShort}</strong>
                  Assinatura / Data: ____/____/______
                </div>
              )}
            </div>
          </div>
          <Footer doc={doc} page={investmentPage} />
        </section>

        {/* ---------- contracapa ---------- */}
        <section className="pd-page pd-back">
          <div className="pd-back-top">
            <div className="pd-back-box">
              <p className="pd-back-kicker">Proposta {doc.number}</p>
              <p className="pd-back-title">{doc.title}</p>
              <p className="pd-back-text">
                Para aprovar, devolva esta proposta assinada ou responda pelos canais abaixo até {formatDate(doc.validUntil)}. Qualquer dúvida sobre escopo, prazos ou valores, é só chamar.
              </p>
            </div>
          </div>

          <div className="pd-wave-footer" style={{ bottom: 80 }} aria-hidden="true">
            <svg viewBox="0 0 794 380" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id={`pdBackGrad${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF007A" />
                  <stop offset="60%" stopColor="#7B1FA2" />
                  <stop offset="100%" stopColor="#311B92" />
                </linearGradient>
              </defs>
              <path d="M0 160C140 280 320 310 460 220C580 140 680 150 794 210V380H0V160Z" fill={`url(#pdBackGrad${uid})`} />
              <path d="M0 240C120 180 240 280 400 240C520 210 650 290 794 320V380H0V240Z" fill="#FFFFFF" opacity="0.1" />
            </svg>
          </div>

          <div className="pd-contact">
            <div className="pd-contact-inner">
              <div className="pd-contact-col">
                <h6>Contratada</h6>
                <p>{doc.issuer.name}</p>
              </div>
              <div className="pd-contact-col">
                <h6>Canais diretos</h6>
                <p>{doc.issuer.email || '—'}</p>
                {doc.issuer.phone && <p style={{ fontWeight: 500, fontSize: 11, color: '#64748B' }}>{doc.issuer.phone}</p>}
              </div>
              <div className="pd-contact-col">
                <h6>CPF / CNPJ</h6>
                <p>{doc.issuer.document || '—'}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
