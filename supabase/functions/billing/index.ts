// =====================================================================
// billing: cobrança por gateway (hoje, o Asaas).
//
// Três portas de entrada na mesma função:
//   1. O app (usuário logado) pede uma ação: conectar, gerar, atualizar,
//      cancelar ou dar baixa numa cobrança.
//   2. O Asaas avisa mudanças de pagamento e de nota fiscal (webhook),
//      identificado pelo token no cabeçalho `asaas-access-token`.
//   3. O pg_cron, uma vez por dia, gera as mensalidades do gerador de
//      orçamentos (token do Vault no cabeçalho `x-cron-token`).
//
// A chave de API do Asaas fica cifrada no Vault do banco (migração 011) e só
// é lida aqui. Nenhum segredo precisa ser cadastrado na função: ela usa as
// variáveis que o Supabase já injeta (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).
//
// Publicar com "Verify JWT" DESLIGADO: o Asaas não manda JWT, e a função
// valida o usuário por conta própria.
// =====================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const ASAAS_URL = { production: 'https://api.asaas.com/v3', sandbox: 'https://api-sandbox.asaas.com/v3' } as const
type Env = keyof typeof ASAAS_URL
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/billing`
const WEBHOOK_NAME = 'Meu ERP Freelas'
const WEBHOOK_EVENTS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_REFUNDED',
  'PAYMENT_RECEIVED_IN_CASH_UNDONE',
  'INVOICE_SYNCHRONIZED',
  'INVOICE_AUTHORIZED',
  'INVOICE_PROCESSING_CANCELLATION',
  'INVOICE_CANCELED',
  'INVOICE_CANCELLATION_DENIED',
  'INVOICE_ERROR',
]
// situações do Asaas em que o dinheiro já é do usuário (ou o cliente já pagou no cartão)
const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'])

class Problem extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) // horário de Brasília
const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '')

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Chamada à API do Asaas. Erros do Asaas viram mensagens em português para a tela. */
async function asaas(env: Env, key: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${ASAAS_URL[env]}${path}`, {
    method,
    headers: { access_token: key, 'Content-Type': 'application/json', 'User-Agent': 'MeuERPFreelas/1.0' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const description = data?.errors?.map((e: { description?: string }) => e.description).filter(Boolean).join(' ')
    if (response.status === 401) throw new Problem(description || 'O Asaas recusou a chave de API. Confira se ela é deste ambiente (produção ou sandbox) e se ainda está ativa.', 401)
    throw new Problem(description || `O Asaas respondeu ${response.status}.`, response.status >= 500 ? 502 : 400)
  }
  return data
}

// ---------- conexão ----------

interface Integration {
  environment: Env
  webhook_id: string | null
  key: string
}

async function integration(userId: string): Promise<Integration> {
  const { data: row } = await admin.from('billing_integrations').select('environment, webhook_id').eq('user_id', userId).eq('provider', 'asaas').maybeSingle()
  if (!row) throw new Problem('Conecte a sua conta do Asaas em Minha empresa → Forma de cobrança.')
  const { data: key, error } = await admin.rpc('billing_read_api_key', { p_user: userId, p_provider: 'asaas' })
  if (error || !key) throw new Problem('Não encontrei a chave do Asaas. Conecte a conta de novo em Minha empresa.')
  return { environment: row.environment as Env, webhook_id: row.webhook_id, key: key as string }
}

/** Cria (ou recria) o webhook que avisa o app quando um pagamento muda. */
async function setupWebhook(userId: string, env: Env, key: string, email: string | null) {
  const existing = await asaas(env, key, 'GET', '/webhooks?limit=100').catch(() => null)
  for (const hook of existing?.data ?? []) {
    if (hook.url === WEBHOOK_URL) await asaas(env, key, 'DELETE', `/webhooks/${hook.id}`).catch(() => null)
  }
  const token = randomToken()
  const hook = await asaas(env, key, 'POST', '/webhooks', {
    name: WEBHOOK_NAME,
    url: WEBHOOK_URL,
    email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: token,
    sendType: 'SEQUENTIALLY',
    events: WEBHOOK_EVENTS,
  })
  await admin.from('billing_integrations').update({ webhook_id: hook.id, webhook_token_hash: await sha256(token) }).eq('user_id', userId).eq('provider', 'asaas')
}

async function connect(userId: string, body: Record<string, unknown>) {
  const env = body.environment === 'sandbox' ? 'sandbox' : 'production'
  const key = String(body.apiKey ?? '').trim()
  if (!/^\$aact_/.test(key) || key.length < 30 || key.length > 400) throw new Problem('Cole a chave de API completa, que começa com $aact_.')
  if (env === 'production' && key.startsWith('$aact_hmlg_')) throw new Problem('Esta é uma chave do sandbox. Escolha o ambiente "Sandbox (testes)".')
  if (env === 'sandbox' && key.startsWith('$aact_prod_')) throw new Problem('Esta é uma chave de produção. Escolha o ambiente "Produção".')

  const account = await asaas(env, key, 'GET', '/myAccount/commercialInfo')
  const name = account?.companyName || account?.name || null
  const email = account?.email || null
  const { error } = await admin.rpc('billing_save_api_key', { p_user: userId, p_provider: 'asaas', p_environment: env, p_key: key, p_account_name: name, p_account_email: email })
  if (error) throw new Problem(`Não foi possível guardar a chave: ${error.message}`, 500)
  await admin.from('profiles').update({ billing_provider: 'asaas' }).eq('id', userId)

  let webhookError: string | null = null
  try {
    const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle()
    await setupWebhook(userId, env, key, profile?.email || email)
  } catch (error) {
    webhookError = error instanceof Error ? error.message : String(error)
  }
  return { connected: true, environment: env, account_name: name, account_email: email, webhook: !webhookError, webhookError }
}

async function disconnect(userId: string) {
  try {
    const current = await integration(userId)
    if (current.webhook_id) await asaas(current.environment, current.key, 'DELETE', `/webhooks/${current.webhook_id}`).catch(() => null)
  } catch {
    // já não havia conexão: segue limpando
  }
  await admin.rpc('billing_forget', { p_user: userId, p_provider: 'asaas' })
  await admin.from('profiles').update({ billing_provider: 'simple' }).eq('id', userId)
  return { connected: false }
}

// ---------- cobranças ----------

async function transactionOf(userId: string, id: unknown) {
  const { data: tx } = await admin.from('financial_transactions').select('*').eq('id', String(id ?? '')).eq('user_id', userId).maybeSingle()
  if (!tx) throw new Problem('Lançamento não encontrado.', 404)
  return tx
}

/** Id do cliente no Asaas: reaproveita o já criado, procura pelo CPF/CNPJ ou cadastra. */
async function customerId(userId: string, current: Integration, clientId: string) {
  const { data: known } = await admin.from('gateway_customers').select('external_id').eq('client_id', clientId).eq('provider', 'asaas').eq('environment', current.environment).maybeSingle()
  if (known) return known.external_id as string

  const { data: client } = await admin.from('clients').select('*').eq('id', clientId).eq('user_id', userId).maybeSingle()
  if (!client) throw new Problem('Cliente do lançamento não encontrado.')
  const document = onlyDigits(client.document)
  if (document.length !== 11 && document.length !== 14) throw new Problem(`Cadastre o CPF ou CNPJ de ${client.company_name || client.name} para gerar a cobrança.`)

  const { data: profile } = await admin.from('profiles').select('billing_notify').eq('id', userId).maybeSingle()
  const found = await asaas(current.environment, current.key, 'GET', `/customers?cpfCnpj=${document}&limit=1`)
  let id: string | undefined = found?.data?.[0]?.id
  if (!id) {
    const phone = onlyDigits(client.phone)
    const created = await asaas(current.environment, current.key, 'POST', '/customers', {
      name: client.company_name || client.name,
      cpfCnpj: document,
      email: client.email || undefined,
      mobilePhone: phone.length >= 10 ? phone.slice(-11) : undefined,
      externalReference: client.id,
      notificationDisabled: profile?.billing_notify === false,
    })
    id = created.id
  }
  await admin.from('gateway_customers').upsert({ user_id: userId, client_id: clientId, provider: 'asaas', environment: current.environment, external_id: id })
  return id!
}

const NO_PIX = { gateway_pix_payload: null, gateway_pix_image: null }

/**
 * QR Code Pix dinâmico da cobrança (já com multa e juros, se pago depois).
 * Sem chave Pix cadastrada no Asaas, ele devolve um QR que só vale até o fim
 * do dia: esse não vai para o orçamento, para o cliente não receber um QR que
 * para de funcionar. Nesses casos volta um aviso para a tela.
 */
async function pixOf(current: Integration, chargeId: string, dueDate: string, billingType: string) {
  if (billingType === 'CREDIT_CARD') return { fields: NO_PIX, pixWarning: null }
  try {
    const pix = await asaas(current.environment, current.key, 'GET', `/payments/${chargeId}/pixQrCode`)
    const expires = String(pix?.expirationDate ?? '').slice(0, 10)
    if (expires && expires < dueDate) {
      return { fields: NO_PIX, pixWarning: 'O QR Code Pix não foi incluído: a sua conta do Asaas não tem chave Pix cadastrada, e sem ela o QR vale só até hoje. Cadastre uma chave em Pix → Minhas chaves, no Asaas, e use "Atualizar QR Code Pix". O link de pagamento funciona normalmente.' }
    }
    const image = pix?.encodedImage ? `data:image/png;base64,${pix.encodedImage}` : null
    if (!image || image.length > 60000) return { fields: { gateway_pix_payload: pix?.payload ?? null, gateway_pix_image: null }, pixWarning: 'O Asaas não devolveu a imagem do QR Code Pix. O link de pagamento funciona normalmente.' }
    return { fields: { gateway_pix_payload: pix.payload ?? null, gateway_pix_image: image }, pixWarning: null }
  } catch (error) {
    return { fields: NO_PIX, pixWarning: `O QR Code Pix não foi incluído: ${error instanceof Error ? error.message : 'o Asaas não o devolveu'}. O link de pagamento funciona normalmente.` }
  }
}

function chargeFields(current: Integration, payment: Record<string, any>) {
  return {
    gateway: 'asaas',
    gateway_env: current.environment,
    gateway_charge_id: payment.id,
    gateway_status: payment.status,
    gateway_invoice_url: payment.invoiceUrl ?? null,
    gateway_bank_slip_url: payment.bankSlipUrl ?? null,
    gateway_net_value: payment.netValue ?? null,
    gateway_synced_at: new Date().toISOString(),
  }
}

async function createCharge(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (tx.type !== 'income') throw new Problem('Só recebimentos podem virar cobrança.')
  if (tx.status === 'paid') throw new Problem('Este lançamento já está pago.')
  if (tx.gateway_charge_id) throw new Problem('Este lançamento já tem uma cobrança no Asaas.')
  if (!tx.client_id) throw new Problem('Escolha o cliente do lançamento antes de gerar a cobrança.')
  if (tx.due_date < today()) throw new Problem('O vencimento deste lançamento já passou. Edite a data de vencimento e gere a cobrança de novo.')

  const current = await integration(userId)
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
  const customer = await customerId(userId, current, tx.client_id)
  const discount = Number(profile?.billing_discount_pct) || 0
  const payment = await asaas(current.environment, current.key, 'POST', '/payments', {
    customer,
    billingType: profile?.billing_types || 'UNDEFINED',
    value: Number(tx.amount),
    dueDate: tx.due_date,
    description: String(tx.description || tx.category || 'Cobrança').slice(0, 500),
    externalReference: tx.id,
    fine: { value: Number(profile?.billing_fine_pct) || 0, type: 'PERCENTAGE' },
    interest: { value: Number(profile?.billing_interest_pct) || 0 },
    ...(discount > 0 ? { discount: { value: discount, dueDateLimitDays: Number(profile?.billing_discount_days) || 0, type: 'PERCENTAGE' } } : {}),
  })
  const pix = await pixOf(current, payment.id, tx.due_date, payment.billingType)
  const patch = { ...chargeFields(current, payment), ...pix.fields }
  const { data: saved, error } = await admin.from('financial_transactions').update(patch).eq('id', tx.id).select().single()
  if (error) {
    // a cobrança existe no Asaas mas não ficou registrada aqui: desfaz para não ficar órfã
    await asaas(current.environment, current.key, 'DELETE', `/payments/${payment.id}`).catch(() => null)
    throw new Problem(`Não foi possível registrar a cobrança: ${error.message}`, 500)
  }
  return { transaction: saved, pixWarning: pix.pixWarning }
}

/** Busca de novo o QR Code Pix (ex.: depois de cadastrar a chave Pix no Asaas). */
async function refreshPix(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.gateway_charge_id || tx.status === 'paid') return { transaction: tx, pixWarning: null }
  const current = await integration(userId)
  const payment = await asaas(current.environment, current.key, 'GET', `/payments/${tx.gateway_charge_id}`)
  const pix = await pixOf(current, tx.gateway_charge_id, tx.due_date, payment.billingType)
  const { data: saved } = await admin.from('financial_transactions').update(pix.fields).eq('id', tx.id).select().single()
  return { transaction: saved, pixWarning: pix.pixWarning }
}

/** Cancela a cobrança no Asaas (se ainda existir lá) e limpa o lançamento. */
async function dropCharge(current: Integration, tx: Record<string, any>) {
  try {
    await asaas(current.environment, current.key, 'DELETE', `/payments/${tx.gateway_charge_id}`)
  } catch (error) {
    if (!(error instanceof Problem && error.status === 404)) throw error
  }
  const { data: saved } = await admin.from('financial_transactions').update(clearedCharge).eq('id', tx.id).select().single()
  return saved
}

/**
 * Leva para o Asaas o que mudou no lançamento (valor, vencimento, descrição, cliente).
 * - Cliente trocado: a cobrança do cliente antigo é cancelada e outra é criada para o novo.
 * - Valor ou vencimento mudou, mas o vencimento já passou (o Asaas não aceita): a cobrança
 *   antiga, que ficou errada, é cancelada; uma nova é gerada quando você pedir.
 * - Só a descrição mudou: atualiza só ela, sem mexer numa cobrança que pode estar vencida.
 */
async function updateCharge(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.gateway_charge_id || tx.status === 'paid') return { transaction: tx }
  const current = await integration(userId)
  const payment = await asaas(current.environment, current.key, 'GET', `/payments/${tx.gateway_charge_id}`)
  if (PAID.has(payment.status)) return { transaction: await applyPayment(userId, tx, payment) }

  if (!tx.client_id) {
    return { transaction: await dropCharge(current, tx), notice: 'O lançamento ficou sem cliente, então a cobrança no Asaas foi cancelada.' }
  }
  const expected = await customerId(userId, current, tx.client_id)
  const pastDue = tx.due_date < today()
  if (payment.customer !== expected) {
    await dropCharge(current, tx)
    if (pastDue) return { transaction: (await transactionOf(userId, tx.id)), notice: 'O cliente mudou e o vencimento já passou: a cobrança antiga foi cancelada. Gere uma nova, com outra data.' }
    const created = await createCharge(userId, body)
    return { ...created, notice: 'O cliente mudou: a cobrança antiga foi cancelada e outra foi criada no nome do novo cliente.' }
  }

  const description = String(tx.description || tx.category || 'Cobrança').slice(0, 500)
  const valueChanged = Math.abs(Number(payment.value) - Number(tx.amount)) > 0.004
  const dueChanged = payment.dueDate !== tx.due_date
  if ((valueChanged || dueChanged) && pastDue) {
    return { transaction: await dropCharge(current, tx), notice: 'O valor ou o vencimento mudou, mas a data já passou e o Asaas não aceita. A cobrança antiga foi cancelada; gere uma nova, com outra data.' }
  }
  if (!valueChanged && !dueChanged && payment.description === description) return { transaction: tx }

  const updated = await asaas(current.environment, current.key, 'PUT', `/payments/${tx.gateway_charge_id}`, valueChanged || dueChanged ? { value: Number(tx.amount), dueDate: tx.due_date, description } : { description })
  const pix = valueChanged || dueChanged ? await pixOf(current, updated.id, tx.due_date, updated.billingType) : null
  const patch = { ...chargeFields(current, updated), ...(pix?.fields ?? {}) }
  const { data: saved } = await admin.from('financial_transactions').update(patch).eq('id', tx.id).select().single()
  return { transaction: saved, pixWarning: pix?.pixWarning ?? null }
}

const clearedCharge = {
  gateway: null,
  gateway_env: null,
  gateway_charge_id: null,
  gateway_status: null,
  gateway_invoice_url: null,
  gateway_bank_slip_url: null,
  gateway_pix_payload: null,
  gateway_pix_image: null,
  gateway_net_value: null,
  gateway_synced_at: null,
}

async function cancelCharge(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.gateway_charge_id) return { transaction: tx }
  const current = await integration(userId)
  try {
    await asaas(current.environment, current.key, 'DELETE', `/payments/${tx.gateway_charge_id}`)
  } catch (error) {
    // cobrança que já não existe no Asaas pode ser esquecida aqui; as demais recusas (ex.: já paga) voltam para a tela
    if (!(error instanceof Problem && error.status === 404)) throw error
  }
  const { data: saved } = await admin.from('financial_transactions').update(clearedCharge).eq('id', tx.id).select().single()
  return { transaction: saved }
}

/** Recebimento por fora (dinheiro, transferência): dá baixa no Asaas para o cliente não pagar de novo. */
async function receiveInCash(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.gateway_charge_id) throw new Problem('Este lançamento não tem cobrança no Asaas.')
  const current = await integration(userId)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paymentDate)) ? String(body.paymentDate) : today()
  const payment = await asaas(current.environment, current.key, 'POST', `/payments/${tx.gateway_charge_id}/receiveInCash`, {
    paymentDate: date,
    value: Number(tx.amount),
    notifyCustomer: false,
  })
  return { transaction: await applyPayment(userId, tx, { ...payment, paymentDate: date }) }
}

/** Desfaz uma baixa por fora. Pagamento recebido pelo próprio Asaas só pode ser estornado lá. */
async function undoReceiveInCash(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.gateway_charge_id) return { transaction: tx }
  const current = await integration(userId)
  const payment = await asaas(current.environment, current.key, 'GET', `/payments/${tx.gateway_charge_id}`)
  if (payment.status !== 'RECEIVED_IN_CASH') {
    if (PAID.has(payment.status)) throw new Problem('Este pagamento foi recebido pelo Asaas e não pode ser desfeito aqui. Se precisar devolver, faça o estorno no painel do Asaas.')
    return { transaction: await applyPayment(userId, tx, payment, 'PAYMENT_RECEIVED_IN_CASH_UNDONE') }
  }
  const undone = await asaas(current.environment, current.key, 'POST', `/payments/${tx.gateway_charge_id}/undoReceivedInCash`)
  return { transaction: await applyPayment(userId, tx, undone, 'PAYMENT_RECEIVED_IN_CASH_UNDONE') }
}

async function refreshCharge(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.gateway_charge_id) return { transaction: tx }
  const current = await integration(userId)
  try {
    const payment = await asaas(current.environment, current.key, 'GET', `/payments/${tx.gateway_charge_id}`)
    if (payment.deleted) return { transaction: (await admin.from('financial_transactions').update(clearedCharge).eq('id', tx.id).select().single()).data }
    return { transaction: await applyPayment(userId, tx, payment) }
  } catch (error) {
    if (error instanceof Problem && error.status === 404) {
      return { transaction: (await admin.from('financial_transactions').update(clearedCharge).eq('id', tx.id).select().single()).data }
    }
    throw error
  }
}

// ---------- nota fiscal de serviço (NFS-e) ----------

// nota que já existe e conta: só uma cancelada ou com erro pode ser emitida de novo
const LIVE_INVOICE = new Set(['SCHEDULED', 'SYNCHRONIZED', 'AUTHORIZED', 'PROCESSING_CANCELLATION', 'CANCELLATION_DENIED'])

/** Webhooks criados antes da nota fiscal só avisam pagamentos: acrescenta os eventos de nota. */
async function ensureInvoiceEvents(current: Integration) {
  if (!current.webhook_id) return
  try {
    const hook = await asaas(current.environment, current.key, 'GET', `/webhooks/${current.webhook_id}`)
    if (!(hook?.events ?? []).includes('INVOICE_AUTHORIZED')) {
      await asaas(current.environment, current.key, 'PUT', `/webhooks/${current.webhook_id}`, { events: WEBHOOK_EVENTS })
    }
  } catch {
    // sem o aviso, a situação da nota ainda pode ser consultada em "Atualizar nota fiscal"
  }
}

function invoiceFields(invoice: Record<string, any>) {
  const patch: Record<string, unknown> = {
    nfse_id: invoice.id,
    nfse_status: invoice.status,
    nfse_number: invoice.number ?? null,
    nfse_error: invoice.status === 'ERROR' ? String(invoice.statusDescription || 'A prefeitura recusou a nota.').slice(0, 500) : null,
    nfse_synced_at: new Date().toISOString(),
  }
  // o PDF autorizado vira a nota fiscal do lançamento (o mesmo campo do anexo manual)
  if (invoice.status === 'AUTHORIZED' && /^https:\/\//.test(invoice.pdfUrl ?? '')) patch.invoice_url = invoice.pdfUrl
  return patch
}

/**
 * Regime tributário da nota: MEI (SIMEI, ISS no DAS, sem retenções), ME/EPP no
 * Simples Nacional (ISS na nota, pode ser retido; os federais vão no DAS) ou
 * regime normal (Lucro Presumido/Real: ISS e retenções federais na nota).
 */
type Regime = 'mei' | 'simples' | 'normal'
const REGIMES = new Set<Regime>(['mei', 'simples', 'normal'])

function rate(value: unknown, label: string, max: number) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Problem(`A alíquota de ${label} precisa estar entre 0 e ${max}%.`)
  return Math.round(n * 100) / 100
}

function invoiceTaxes(regime: Regime, raw: Record<string, unknown>, nbsCode: string) {
  const nbs = nbsCode ? { nbsCode } : {}
  if (regime === 'mei') return { ...nbs, retainIss: false, iss: 0, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 }
  const iss = rate(raw.iss, 'ISS', 5)
  const retainIss = raw.retainIss === true
  if (regime === 'simples') return { ...nbs, retainIss, iss, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 }
  return {
    ...nbs,
    retainIss,
    iss,
    pis: rate(raw.pis, 'PIS', 30),
    cofins: rate(raw.cofins, 'COFINS', 30),
    csll: rate(raw.csll, 'CSLL', 30),
    inss: rate(raw.inss, 'INSS', 30),
    ir: rate(raw.ir, 'IR', 30),
  }
}

/**
 * Emite a NFS-e de um recebimento já pago, pelo valor dele, com os dados das
 * etapas do gerador (as mesmas do Emissor Nacional): serviço com o código de
 * tributação nacional, descrição, deduções e os tributos do regime escolhido.
 */
async function issueInvoice(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (tx.type !== 'income') throw new Problem('Nota fiscal só para recebimentos.')
  if (tx.status !== 'paid') throw new Problem('Emita a nota depois que o pagamento estiver registrado.')
  if (tx.nfse_id && LIVE_INVOICE.has(tx.nfse_status)) throw new Problem('Este recebimento já tem nota fiscal.')
  if (!tx.client_id) throw new Problem('Escolha o cliente do lançamento antes de emitir a nota.')

  const description = String(body.serviceDescription ?? '').trim()
  const code = String(body.serviceCode ?? '').trim()
  const name = String(body.serviceName ?? '').trim()
  const nbsCode = String(body.nbsCode ?? '').trim()
  const observations = String(body.observations ?? '').trim()
  const regime = String(body.regime ?? 'mei') as Regime
  if (!REGIMES.has(regime)) throw new Problem('Regime tributário inválido.')
  if (description.length < 10) throw new Problem('Descreva o serviço prestado (pelo menos uma frase).')
  if (description.length > 2000) throw new Problem('A descrição pode ter até 2.000 caracteres.')
  if (!code) throw new Problem('Informe o código de tributação nacional do serviço.')
  const value = Number(tx.amount)
  const deductions = regime === 'mei' ? 0 : Number(body.deductions ?? 0)
  if (!Number.isFinite(deductions) || deductions < 0 || deductions >= value) throw new Problem('As deduções precisam ser menores que o valor do serviço.')
  const taxes = invoiceTaxes(regime, (body.taxes ?? {}) as Record<string, unknown>, nbsCode)

  const current = await integration(userId)
  await ensureInvoiceEvents(current)
  // ligada à cobrança quando o pagamento veio pelo Asaas; senão, ao cliente
  const origin = tx.gateway_charge_id ? { payment: tx.gateway_charge_id } : { customer: await customerId(userId, current, tx.client_id) }
  const scheduled = await asaas(current.environment, current.key, 'POST', '/invoices', {
    ...origin,
    serviceDescription: description,
    observations: observations || ' ',
    externalReference: tx.id,
    value,
    deductions: Math.round(deductions * 100) / 100,
    effectiveDate: today(),
    municipalServiceCode: code,
    municipalServiceName: (name || description).slice(0, 250),
    taxes,
  })
  await admin.from('financial_transactions').update({ ...invoiceFields(scheduled), nfse_service: name || null }).eq('id', tx.id)

  let invoice = scheduled
  try {
    invoice = await asaas(current.environment, current.key, 'POST', `/invoices/${scheduled.id}/authorize`)
  } catch (error) {
    // a nota ficou agendada no Asaas: o motivo aparece na tela e dá para tentar de novo
    const { data: saved } = await admin.from('financial_transactions').update({ nfse_status: 'ERROR', nfse_error: error instanceof Error ? error.message : String(error) }).eq('id', tx.id).select().single()
    return { transaction: saved }
  }
  const { data: saved } = await admin.from('financial_transactions').update(invoiceFields(invoice)).eq('id', tx.id).select().single()
  return { transaction: saved }
}

/**
 * Dados fiscais cadastrados no Asaas (Notas fiscais → Configurações): é de lá
 * que sai o regime que vai impresso na nota. `configured: false` quando a
 * conta ainda não tem a configuração de nota fiscal.
 */
async function fiscalInfo(userId: string) {
  const current = await integration(userId)
  try {
    const info = await asaas(current.environment, current.key, 'GET', '/fiscalInfo/')
    return {
      configured: true,
      simplesNacional: info?.simplesNacional ?? null,
      specialTaxRegime: info?.specialTaxRegime ?? null,
      nationalPortalTaxCalculationRegime: info?.nationalPortalTaxCalculationRegime ?? null,
      cnae: info?.cnae ?? null,
      municipalInscription: info?.municipalInscription ?? null,
      serviceProvisionCityDefaultType: info?.serviceProvisionCityDefaultType ?? null,
    }
  } catch (error) {
    // 404: a conta ainda não tem as informações fiscais
    if (error instanceof Problem && error.status === 400) return { configured: false }
    throw error
  }
}

/** Busca na tabela de códigos de tributação nacional (ou NBS) do Asaas. */
async function searchServiceCodes(userId: string, body: Record<string, unknown>) {
  const term = String(body.term ?? '').trim().slice(0, 80)
  if (term.length < 2) return { data: [] }
  const current = await integration(userId)
  if (body.kind === 'nbs') {
    const list = await asaas(current.environment, current.key, 'GET', `/fiscalInfo/nbsCodes?limit=20&codeDescription=${encodeURIComponent(term)}`)
    return { data: (list?.data ?? []).map((i: Record<string, string>) => ({ code: i.nbsCode, description: i.codeDescription })) }
  }
  const query = /^[\d.\s]+$/.test(term) ? `code=${term.replace(/\D/g, '')}` : `description=${encodeURIComponent(term)}`
  const list = await asaas(current.environment, current.key, 'GET', `/fiscalInfo/federalServiceCodes?limit=20&${query}`)
  return { data: (list?.data ?? []).map((i: Record<string, string>) => ({ code: i.code, description: i.description })) }
}

async function refreshInvoice(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.nfse_id) return { transaction: tx }
  const current = await integration(userId)
  const invoice = await asaas(current.environment, current.key, 'GET', `/invoices/${tx.nfse_id}`)
  const { data: saved } = await admin.from('financial_transactions').update(invoiceFields(invoice)).eq('id', tx.id).select().single()
  return { transaction: saved }
}

async function cancelInvoice(userId: string, body: Record<string, unknown>) {
  const tx = await transactionOf(userId, body.transactionId)
  if (!tx.nfse_id) return { transaction: tx }
  const current = await integration(userId)
  const invoice = await asaas(current.environment, current.key, 'POST', `/invoices/${tx.nfse_id}/cancel`)
  const patch = invoiceFields(invoice)
  // o PDF de uma nota cancelada não serve mais como nota do lançamento
  if (tx.invoice_url && /^https:\/\//.test(tx.invoice_url)) patch.invoice_url = null
  const { data: saved } = await admin.from('financial_transactions').update(patch).eq('id', tx.id).select().single()
  return { transaction: saved }
}

// ---------- situação do pagamento (ação manual e webhook) ----------

/** Leva a situação do Asaas para o lançamento e, se ele é de um orçamento, para o orçamento. */
async function applyPayment(userId: string, tx: Record<string, any>, payment: Record<string, any>, event?: string) {
  const patch: Record<string, unknown> = {
    gateway_status: payment.status ?? tx.gateway_status,
    gateway_net_value: payment.netValue ?? tx.gateway_net_value,
    gateway_synced_at: new Date().toISOString(),
  }
  if (PAID.has(payment.status)) {
    patch.status = 'paid'
    patch.payment_date = payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate || tx.payment_date || today()
  } else if (tx.status === 'paid' && (payment.status === 'REFUNDED' || event === 'PAYMENT_RESTORED' || event === 'PAYMENT_RECEIVED_IN_CASH_UNDONE' || ['PENDING', 'OVERDUE'].includes(payment.status))) {
    // estorno ou baixa desfeita no Asaas: volta a ser um valor a receber
    patch.status = 'pending'
    patch.payment_date = null
  }
  if (payment.invoiceUrl) patch.gateway_invoice_url = payment.invoiceUrl
  if (payment.bankSlipUrl) patch.gateway_bank_slip_url = payment.bankSlipUrl

  const { data: saved, error } = await admin.from('financial_transactions').update(patch).eq('id', tx.id).eq('user_id', userId).select().single()
  if (error) throw new Problem(error.message, 500)
  if (saved.quote_id) await refreshQuote(userId, saved.quote_id)
  return saved
}

/** Mesma regra do app (statusFromParts): nada pago = pendente; tudo = pago; parte = parcialmente pago. */
async function refreshQuote(userId: string, quoteId: string) {
  const { data: parts } = await admin.from('financial_transactions').select('status').eq('quote_id', quoteId).eq('user_id', userId)
  if (!parts?.length) return
  const paid = parts.filter((p) => p.status === 'paid').length
  const status = paid === 0 ? 'pending' : paid === parts.length ? 'paid' : 'partial'
  await admin.from('quotes').update({ status }).eq('id', quoteId).eq('user_id', userId)
}

async function webhook(req: Request) {
  const token = req.headers.get('asaas-access-token') ?? ''
  if (token.length < 32) return json(401, { error: 'unauthorized' })
  const { data: owner } = await admin.from('billing_integrations').select('user_id').eq('provider', 'asaas').eq('webhook_token_hash', await sha256(token)).maybeSingle()
  if (!owner) return json(401, { error: 'unauthorized' })

  const body = await req.json().catch(() => null)
  const payment = body?.payment
  const event = String(body?.event ?? '')

  // nota fiscal emitida, recusada ou cancelada
  if (body?.invoice?.id) {
    const invoice = body.invoice
    const { data: nf } = await admin.from('financial_transactions').select('id, invoice_url').eq('user_id', owner.user_id).eq('nfse_id', invoice.id).maybeSingle()
    if (!nf) return json(200, { ignored: true })
    const patch = invoiceFields(invoice)
    if (invoice.status === 'CANCELED' && /^https:\/\//.test(nf.invoice_url ?? '')) patch.invoice_url = null
    await admin.from('financial_transactions').update(patch).eq('id', nf.id)
    return json(200, { ok: true })
  }

  // eventos que não são de cobrança, ou de cobranças criadas fora do app: só confirma o recebimento
  if (!payment?.id) return json(200, { ignored: true })
  const { data: tx } = await admin.from('financial_transactions').select('*').eq('user_id', owner.user_id).eq('gateway', 'asaas').eq('gateway_charge_id', payment.id).maybeSingle()
  if (!tx) return json(200, { ignored: true })

  if (event === 'PAYMENT_DELETED') {
    await admin.from('financial_transactions').update(clearedCharge).eq('id', tx.id)
    return json(200, { ok: true })
  }
  await applyPayment(owner.user_id, tx, payment, event)
  return json(200, { ok: true })
}

// ---------- mensalidades (pg_cron) ----------

/**
 * Todo dia o pg_cron chama a função com o token do Vault (migração 015).
 * Cada série de mensalidade que chegou na data (vencimento menos a
 * antecedência) ganha o orçamento do mês: réplica do último da série, com o
 * vencimento novo, o lançamento no financeiro e, no Asaas, a cobrança.
 * O próximo vencimento é trocado antes de gerar e só se ainda for o mesmo,
 * então o app (que também confere ao abrir) e a função nunca geram o mesmo mês.
 */
const MAX_CATCH_UP = 3
const pad2 = (n: number) => String(n).padStart(2, '0')
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const onDay = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(Math.min(day, daysIn(year, month)))}`

function nextMonthly(due: string, day: number) {
  const [y, m] = due.split('-').map(Number)
  return m === 12 ? onDay(y + 1, 1, day) : onDay(y, m + 1, day)
}

function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const quoteNumber = (n: number) => `#ORC-${String(n ?? 0).padStart(4, '0')}`

async function generateMonthly(rec: Record<string, any>, due: string) {
  const query = admin.from('quotes').select('*').eq('user_id', rec.user_id)
  const { data: source } = rec.last_quote_id
    ? await query.eq('id', rec.last_quote_id).maybeSingle()
    : await query.eq('recurrence_id', rec.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!source) throw new Problem('A série não tem orçamento para replicar.')

  const { data: quote, error } = await admin
    .from('quotes')
    .insert({
      user_id: rec.user_id,
      client_id: source.client_id,
      customer_name: source.customer_name,
      title: source.title,
      items: source.items,
      notes: source.notes,
      total_amount: source.total_amount,
      validity_days: source.validity_days,
      status: 'pending',
      proposal_id: null,
      deposit_pct: null,
      due_date: due,
      recurrence_id: rec.id,
    })
    .select()
    .single()
  if (error) throw new Problem(`Não foi possível criar o orçamento: ${error.message}`, 500)

  const { data: tx, error: txError } = await admin
    .from('financial_transactions')
    .insert({
      user_id: rec.user_id,
      type: 'income',
      category: 'Mensalidade',
      description: `Orçamento ${quoteNumber(quote.quote_number)} — ${quote.title}`,
      amount: quote.total_amount,
      due_date: due,
      payment_date: null,
      status: 'pending',
      client_id: quote.client_id,
      quote_id: quote.id,
    })
    .select()
    .single()
  if (txError) throw new Problem(`Orçamento ${quoteNumber(quote.quote_number)} criado, mas o lançamento não: ${txError.message}`, 500)

  let lastError: string | null = null
  const { data: profile } = await admin.from('profiles').select('billing_provider').eq('id', rec.user_id).maybeSingle()
  if (profile?.billing_provider === 'asaas' && tx.client_id) {
    try {
      await createCharge(rec.user_id, { transactionId: tx.id })
    } catch (e) {
      lastError = `Mensalidade gerada, mas a cobrança no Asaas não: ${e instanceof Error ? e.message : 'erro desconhecido'}`
    }
  }
  await admin.from('quote_recurrences').update({ last_quote_id: quote.id, last_error: lastError }).eq('id', rec.id)
  return quote.id as string
}

async function runRecurrences() {
  const day = today()
  const { data: series } = await admin.from('quote_recurrences').select('*').eq('active', true)
  const created: string[] = []
  for (const rec of series ?? []) {
    let current = rec
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      const due = current.next_due_date as string
      if (current.ends_on && due > current.ends_on) {
        await admin.from('quote_recurrences').update({ active: false }).eq('id', current.id)
        break
      }
      if (shiftDays(due, -Number(current.lead_days)) > day) break
      const next = nextMonthly(due, Number(current.day_of_month))
      const { data: claimed } = await admin
        .from('quote_recurrences')
        .update({ next_due_date: next, last_run_at: new Date().toISOString() })
        .eq('id', current.id)
        .eq('next_due_date', due)
        .eq('active', true)
        .select('id')
      if (!claimed?.length) break
      try {
        created.push(await generateMonthly(current, due))
      } catch (e) {
        await admin.from('quote_recurrences').update({ last_error: (e instanceof Error ? e.message : 'Não foi possível gerar a mensalidade.').slice(0, 1000) }).eq('id', current.id)
        break
      }
      current = { ...current, next_due_date: next }
    }
  }
  return { created: created.length }
}

async function cron(req: Request) {
  const { data: ok } = await admin.rpc('billing_cron_token_ok', { p_token: req.headers.get('x-cron-token') ?? '' })
  if (ok !== true) return json(401, { error: 'unauthorized' })
  return json(200, await runRecurrences())
}

// ---------- entrada ----------

const actions: Record<string, (userId: string, body: Record<string, unknown>) => Promise<unknown>> = {
  connect,
  disconnect: (userId) => disconnect(userId),
  'create-charge': createCharge,
  'update-charge': updateCharge,
  'cancel-charge': cancelCharge,
  'refresh-charge': refreshCharge,
  'receive-in-cash': receiveInCash,
  'undo-receive-in-cash': undoReceiveInCash,
  'refresh-pix': refreshPix,
  'issue-invoice': issueInvoice,
  'refresh-invoice': refreshInvoice,
  'cancel-invoice': cancelInvoice,
  'fiscal-info': (userId) => fiscalInfo(userId),
  'search-service-codes': searchServiceCodes,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
    if (req.headers.has('asaas-access-token')) return await webhook(req)
    if (req.headers.has('x-cron-token')) return await cron(req)

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await admin.auth.getUser(jwt)
    if (!auth?.user) return json(401, { error: 'unauthorized', message: 'Entre no sistema para usar a cobrança.' })

    const body = await req.json().catch(() => ({}))
    const action = actions[String(body.action ?? '')]
    if (!action) return json(400, { error: 'invalid_action', message: 'Ação desconhecida.' })
    return json(200, await action(auth.user.id, body))
  } catch (error) {
    if (error instanceof Problem) return json(error.status, { error: 'billing_failed', message: error.message })
    console.error(error)
    return json(500, { error: 'billing_failed', message: error instanceof Error ? error.message : 'Erro inesperado.' })
  }
})
