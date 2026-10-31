// =====================================================================
// subscription: cobrança do plano do Krono (o freelancer paga o Krono).
//
// Fica separada da função `billing` de propósito: lá o dinheiro é do
// freelancer (cada um com a sua chave Asaas no Vault); aqui o dinheiro é da
// plataforma, com UMA chave só, e um erro de um lado não derruba o outro.
//
// Duas portas de entrada:
//   1. O app (dono do workspace logado): assinar, trocar de plano, cancelar,
//      ver as faturas.
//   2. O webhook do Asaas, identificado pelo token no cabeçalho
//      `asaas-access-token`.
//
// Segredos (Edge Functions → Secrets). Para sair do teste e ir para a
// empresa de verdade, troque só estes três:
//   SUBSCRIPTION_ASAAS_KEY       chave de API da conta que recebe as assinaturas
//   SUBSCRIPTION_ASAAS_ENV       "sandbox" (padrão) ou "production"
//   SUBSCRIPTION_WEBHOOK_TOKEN   texto aleatório de 32+ caracteres, o mesmo
//                                cadastrado no webhook do Asaas
//
// Eventos que o webhook do Asaas deve enviar (marque só estes):
//   PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED,
//   PAYMENT_REFUND_IN_PROGRESS, PAYMENT_CHARGEBACK_REQUESTED,
//   SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED
//
// Publicar com "Verify JWT" DESLIGADO (o Asaas não manda JWT; a função valida
// o usuário por conta própria).
// =====================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const ASAAS_URL = { production: 'https://api.asaas.com/v3', sandbox: 'https://api-sandbox.asaas.com/v3' } as const
const ENV = Deno.env.get('SUBSCRIPTION_ASAAS_ENV') === 'production' ? 'production' : 'sandbox'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BILLING_TYPES = new Set(['PIX', 'BOLETO', 'CREDIT_CARD'])

class Problem extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '')
const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) // Brasília

async function asaas(method: string, path: string, body?: unknown) {
  const key = Deno.env.get('SUBSCRIPTION_ASAAS_KEY')
  if (!key) throw new Problem('A cobrança de planos ainda não está configurada. Tente de novo mais tarde.', 503)
  const response = await fetch(`${ASAAS_URL[ENV]}${path}`, {
    method,
    headers: { access_token: key, 'Content-Type': 'application/json', 'User-Agent': 'Krono/1.0' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const description = data?.errors?.map((e: { description?: string }) => e.description).filter(Boolean).join(' ')
    console.error('asaas', method, path, response.status, JSON.stringify(data)?.slice(0, 300))
    throw new Problem(description || `O Asaas respondeu ${response.status}.`, response.status >= 500 || response.status === 401 ? 502 : 400)
  }
  return data
}

interface WorkspaceRow {
  id: string
  name: string
  company_name: string | null
  plan_id: string
  subscription_status: string
  asaas_customer_id: string | null
  asaas_subscription_id: string | null
  extra_members: number
  cancel_at_period_end: boolean
}

async function loadWorkspace(id: string) {
  const { data } = await admin
    .from('workspaces')
    .select('id, name, company_name, plan_id, subscription_status, asaas_customer_id, asaas_subscription_id, extra_members, cancel_at_period_end')
    .eq('id', id)
    .maybeSingle()
  if (!data) throw new Problem('Workspace não encontrado.', 404)
  return data as WorkspaceRow
}

/** Valor mensal: preço do plano mais as pessoas extras (só o Profissional tem). */
async function monthlyValue(planId: string, extraMembers: number) {
  const { data: plan } = await admin.from('plans').select('price_cents, extra_member_cents').eq('id', planId).maybeSingle()
  if (!plan || plan.price_cents <= 0) throw new Problem('Plano inválido.')
  return (plan.price_cents + (planId === 'pro' ? extraMembers * plan.extra_member_cents : 0)) / 100
}

// ---------- ações do app (só o dono) ----------

/** Cria a assinatura (ou troca o plano da que já existe) e devolve o link da fatura. */
async function checkout(ws: WorkspaceRow, ownerEmail: string, body: Record<string, unknown>) {
  const planId = String(body.plan ?? '')
  if (planId !== 'essential' && planId !== 'pro') throw new Problem('Escolha o plano Essencial ou o Profissional.')
  const billingType = String(body.billingType ?? 'PIX')
  if (!BILLING_TYPES.has(billingType)) throw new Problem('Forma de pagamento inválida.')
  const extra = planId === 'pro' ? Math.min(Math.max(Math.trunc(Number(body.extraMembers) || 0), 0), 20) : 0
  const value = await monthlyValue(planId, extra)

  // já existe assinatura ativa: só muda valor e forma de pagamento
  if (ws.asaas_subscription_id && ws.subscription_status === 'active' && !ws.cancel_at_period_end) {
    await asaas('PUT', `/subscriptions/${ws.asaas_subscription_id}`, { value, billingType, updatePendingPayments: true, description: `Krono — plano ${planId === 'pro' ? 'Profissional' : 'Essencial'}` })
    await admin.from('workspaces').update({ plan_id: planId, extra_members: extra, pending_plan_id: null, billing_method: billingType }).eq('id', ws.id)
    return { changed: true }
  }

  // assinatura anterior que nunca foi paga: cancela antes de criar outra, para não cobrar duas vezes
  if (ws.asaas_subscription_id) {
    await asaas('DELETE', `/subscriptions/${ws.asaas_subscription_id}`).catch(() => null)
    await admin.from('workspaces').update({ asaas_subscription_id: null, pending_plan_id: null }).eq('id', ws.id)
  }

  const document = onlyDigits(body.document)
  if (![11, 14].includes(document.length)) throw new Problem('Informe um CPF ou CNPJ válido para emitir a cobrança.')

  let customerId = ws.asaas_customer_id
  if (!customerId) {
    const customer = await asaas('POST', '/customers', {
      name: String(body.name ?? '').trim().slice(0, 120) || ws.company_name || ws.name,
      email: ownerEmail,
      cpfCnpj: document,
      externalReference: ws.id,
    })
    customerId = customer.id
    await admin.from('workspaces').update({ asaas_customer_id: customerId }).eq('id', ws.id)
  } else {
    await asaas('PUT', `/customers/${customerId}`, { cpfCnpj: document })
  }

  const subscription = await asaas('POST', '/subscriptions', {
    customer: customerId,
    billingType,
    value,
    nextDueDate: today(),
    cycle: 'MONTHLY',
    description: `Krono — plano ${planId === 'pro' ? 'Profissional' : 'Essencial'}`,
    externalReference: `${ws.id}:${planId}`,
  })
  await admin
    .from('workspaces')
    .update({ asaas_subscription_id: subscription.id, pending_plan_id: planId, extra_members: extra, cancel_at_period_end: false, billing_method: billingType })
    .eq('id', ws.id)

  return { url: await firstInvoiceUrl(subscription.id) }
}

async function firstInvoiceUrl(subscriptionId: string) {
  // o Asaas gera a primeira fatura em instantes
  for (let attempt = 0; attempt < 4; attempt++) {
    const list = await asaas('GET', `/subscriptions/${subscriptionId}/payments?limit=1`)
    const url = list?.data?.[0]?.invoiceUrl
    if (url) return url as string
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  return null
}

/** Link da fatura em aberto: é nela, na página do Asaas, que a pessoa digita ou troca o cartão. */
async function openInvoiceUrl(subscriptionId: string) {
  for (const status of ['OVERDUE', 'PENDING']) {
    const list = await asaas('GET', `/subscriptions/${subscriptionId}/payments?status=${status}&limit=1`)
    const url = list?.data?.[0]?.invoiceUrl
    if (url) return url as string
  }
  return null
}

/**
 * Forma de pagamento do plano. Sem assinatura, só guarda a escolha (o checkout parte dela).
 * Com assinatura, troca no Asaas e devolve o link da fatura em aberto. O cartão em si
 * nunca passa por aqui: quem o recebe e guarda é o Asaas.
 */
async function setMethod(ws: WorkspaceRow, body: Record<string, unknown>) {
  const billingType = String(body.billingType ?? '')
  if (!BILLING_TYPES.has(billingType)) throw new Problem('Forma de pagamento inválida.')
  if (ws.asaas_subscription_id) {
    await asaas('PUT', `/subscriptions/${ws.asaas_subscription_id}`, { billingType, updatePendingPayments: true })
  }
  await admin.from('workspaces').update({ billing_method: billingType }).eq('id', ws.id)
  const url = ws.asaas_subscription_id && billingType === 'CREDIT_CARD' ? await openInvoiceUrl(ws.asaas_subscription_id) : null
  return { saved: true, url }
}

/** Link para cadastrar ou trocar o cartão (a fatura em aberto, na página do Asaas). */
async function cardLink(ws: WorkspaceRow) {
  if (!ws.asaas_subscription_id) throw new Problem('Contrate um plano para cadastrar o cartão.')
  return { url: await openInvoiceUrl(ws.asaas_subscription_id) }
}

async function cancel(ws: WorkspaceRow) {
  if (!ws.asaas_subscription_id) throw new Problem('Este workspace não tem assinatura.')
  // assinatura que o Asaas já removeu (cancelada lá, sem avisar o app): o Asaas recusa o pedido e o workspace
  // ficaria preso ao id antigo. Só falha de verdade (fora do ar, chave inválida) interrompe.
  await asaas('DELETE', `/subscriptions/${ws.asaas_subscription_id}`).catch((e) => {
    if (!(e instanceof Problem) || e.status !== 400) throw e
  })
  // o plano vale até o fim do período já pago; sem pagamento, volta ao Grátis na hora
  await admin
    .from('workspaces')
    .update({
      ...(ws.subscription_status === 'active' ? { subscription_status: 'canceled', cancel_at_period_end: true } : {}),
      pending_plan_id: null,
      asaas_subscription_id: null,
    })
    .eq('id', ws.id)
  return { canceled: true }
}

async function invoices(ws: WorkspaceRow) {
  if (!ws.asaas_subscription_id) return { payments: [] }
  const list = await asaas('GET', `/subscriptions/${ws.asaas_subscription_id}/payments?limit=12`)
  return {
    payments: (list?.data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id,
      dueDate: p.dueDate,
      value: p.value,
      status: p.status,
      url: p.invoiceUrl ?? null,
    })),
  }
}

// ---------- webhook ----------

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const addMonth = (isoDate: string) => {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString()
}

// avisos que deixam a conta em atraso: boleto/Pix vencido, estorno (pedido ou concluído) e chargeback de cartão
const PAST_DUE_EVENTS = new Set(['PAYMENT_OVERDUE', 'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'])

async function webhook(req: Request) {
  const expected = Deno.env.get('SUBSCRIPTION_WEBHOOK_TOKEN') ?? ''
  const token = req.headers.get('asaas-access-token') ?? ''
  if (expected.length < 32 || !safeEqual(token, expected)) return json(401, { error: 'unauthorized' })

  const body = await req.json().catch(() => null)
  const event = String(body?.event ?? '')
  const eventId = String(body?.id ?? '')
  const payment = body?.payment
  const subscriptionId = String(payment?.subscription ?? body?.subscription?.id ?? '')
  if (!eventId || !subscriptionId) return json(200, { ignored: true })

  const { data: ws } = await admin.from('workspaces').select('id, plan_id, pending_plan_id, current_period_end').eq('asaas_subscription_id', subscriptionId).maybeSingle()
  if (!ws) return json(200, { ignored: true })

  // o mesmo aviso pode chegar duas vezes
  const { error: seen } = await admin.from('subscription_events').insert({ id: eventId, workspace_id: ws.id, event, payload: { payment: { id: payment?.id, status: payment?.status, dueDate: payment?.dueDate, value: payment?.value } } })
  if (seen) return json(200, { duplicate: true })

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    // pago no cartão: guarda só a bandeira e os 4 últimos dígitos (nunca o número nem o token)
    const card = payment?.creditCard
    const last4 = String(card?.creditCardNumber ?? '').replace(/\D/g, '').slice(-4)
    const cardPatch = payment?.billingType === 'CREDIT_CARD' && last4.length === 4
      ? { billing_method: 'CREDIT_CARD', card_last4: last4, card_brand: String(card?.creditCardBrand ?? '').slice(0, 30) || null }
      : payment?.billingType && BILLING_TYPES.has(String(payment.billingType)) ? { billing_method: String(payment.billingType) } : {}
    const dueDate = String(payment?.dueDate ?? today())
    const paidUntil = addMonth(dueDate)
    await admin
      .from('workspaces')
      .update({
        subscription_status: 'active',
        plan_id: ws.pending_plan_id ?? ws.plan_id,
        pending_plan_id: null,
        past_due_since: null,
        cancel_at_period_end: false,
        ...cardPatch,
        // não encurta um período já pago (aviso fora de ordem)
        current_period_end: ws.current_period_end && ws.current_period_end > paidUntil ? ws.current_period_end : paidUntil,
      })
      .eq('id', ws.id)
  } else if (PAST_DUE_EVENTS.has(event)) {
    // a contagem dos 7 dias de tolerância começa no primeiro aviso de atraso
    await admin.from('workspaces').update({ past_due_since: new Date().toISOString() }).eq('id', ws.id).is('past_due_since', null)
    await admin.from('workspaces').update({ subscription_status: 'past_due' }).eq('id', ws.id)
  } else if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
    await admin.from('workspaces').update({ subscription_status: 'canceled', cancel_at_period_end: true }).eq('id', ws.id)
  }
  return json(200, { ok: true })
}

// ---------- porta de entrada ----------

const ACTIONS = new Set(['checkout', 'cancel', 'invoices', 'method', 'card'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
    if (req.headers.has('asaas-access-token')) return await webhook(req)

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await admin.auth.getUser(jwt)
    if (!auth?.user) return json(401, { error: 'unauthorized', message: 'Entre no sistema para gerenciar o plano.' })

    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    if (!ACTIONS.has(action)) return json(400, { error: 'invalid_action', message: 'Ação desconhecida.' })
    const workspaceId = String(body.workspaceId ?? '')
    if (!UUID.test(workspaceId)) return json(400, { error: 'invalid_workspace', message: 'Empresa não informada. Recarregue a página.' })

    // só o dono mexe no plano e na cobrança
    const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', auth.user.id).maybeSingle()
    if (!member || member.role !== 'owner') return json(403, { error: 'forbidden', message: 'Só o dono do workspace gerencia o plano.' })

    const ws = await loadWorkspace(workspaceId)
    if (action === 'checkout') return json(200, await checkout(ws, auth.user.email ?? '', body))
    if (action === 'cancel') return json(200, await cancel(ws))
    if (action === 'method') return json(200, await setMethod(ws, body))
    if (action === 'card') return json(200, await cardLink(ws))
    return json(200, await invoices(ws))
  } catch (error) {
    if (error instanceof Problem) return json(error.status, { error: 'subscription_failed', message: error.message })
    console.error(error)
    return json(500, { error: 'subscription_failed', message: 'Erro inesperado. Tente de novo.' })
  }
})
