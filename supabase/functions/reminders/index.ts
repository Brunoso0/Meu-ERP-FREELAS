// =====================================================================
// reminders: lembrete diário das demandas, por e-mail e no celular.
//
// Duas portas de entrada:
//   1. O pg_cron, de hora em hora (token do Vault no cabeçalho
//      `x-cron-token`, migração 016). Quem escolheu aquela hora no perfil
//      (horário de Brasília) recebe as demandas do dia e as atrasadas, uma
//      vez por dia; dia sem demanda não manda nada.
//   2. O app (usuário logado): buscar a chave pública do Web Push para
//      inscrever o aparelho, e mandar um lembrete de teste agora.
//
// E-mail pelo Resend: segredo RESEND_API_KEY da função (e, opcional,
// RESEND_FROM com um remetente de domínio verificado). Sem domínio, o
// remetente de teste do Resend só entrega para o e-mail da conta do Resend.
// Web Push: as chaves VAPID são geradas aqui na primeira vez e ficam no Vault.
//
// Publicar com "Verify JWT" DESLIGADO: o pg_cron não manda JWT, e a função
// valida o usuário por conta própria.
// =====================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ApplicationServer, exportApplicationServerKey, exportVapidKeys, generateVapidKeys, importVapidKeys, PushMessageError, Urgency } from 'jsr:@negrel/webpush@0.5.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const APP_URL = 'https://meus-freelas.pages.dev'
const TIME_ZONE = 'America/Sao_Paulo'

class Problem extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

/** Dia (yyyy-MM-dd) e hora (0 a 23) em Brasília. */
function brasilia(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(date))
  return { day, hour }
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const brDate = (iso: string) => iso.split('-').reverse().join('/')
const PRIORITY: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

// ---------- as demandas do dia ----------

interface Item {
  title: string
  project: string | null
  priority: string
  due: string | null
}

async function digest(userId: string, day: string) {
  // cada pessoa recebe as demandas de todos os workspaces em que trabalha (leitores não recebem)
  const { data: memberships } = await admin.from('workspace_members').select('workspace_id').eq('user_id', userId).in('role', ['owner', 'admin', 'member'])
  // lembretes por e-mail são do plano Essencial para cima
  const workspaceIds: string[] = []
  for (const m of memberships ?? []) {
    const { data: allowed } = await admin.rpc('plan_feature', { p_workspace: m.workspace_id, p_key: 'reminders' })
    if (allowed) workspaceIds.push(m.workspace_id)
  }
  if (workspaceIds.length === 0) return { today: [], late: [] }
  const { data: tasks } = await admin
    .from('tasks')
    .select('title, status, priority, scheduled_date, due_date, project_id')
    .in('workspace_id', workspaceIds)
    .neq('status', 'done')
    .or(`scheduled_date.eq.${day},due_date.lte.${day}`)
  const ids = [...new Set((tasks ?? []).map((t) => t.project_id).filter(Boolean))]
  const { data: projects } = ids.length ? await admin.from('projects').select('id, title').in('id', ids) : { data: [] }
  const projectTitle = (id: string | null) => (projects ?? []).find((p) => p.id === id)?.title ?? null
  const item = (t: Record<string, any>): Item => ({ title: t.title, project: projectTitle(t.project_id), priority: t.priority, due: t.due_date })
  const byPriority = (a: Item, b: Item) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
  const today = (tasks ?? []).filter((t) => t.scheduled_date === day || t.due_date === day).map(item).sort(byPriority)
  const late = (tasks ?? []).filter((t) => t.scheduled_date !== day && t.due_date && t.due_date < day).map(item).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
  return { today, late }
}

type Digest = Awaited<ReturnType<typeof digest>>

function summary(d: Digest) {
  const parts = [d.today.length && `${d.today.length} para hoje`, d.late.length && `${d.late.length} atrasada${d.late.length === 1 ? '' : 's'}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Nenhuma demanda para hoje'
}

// ---------- e-mail ----------

// Mesmo visual dos PDFs de proposta e orçamento: onda em degradê no topo,
// selo magenta, título em caixa alta, tabela em caixa arredondada e rodapé
// com a pílula. E-mail não aceita SVG nem CSS externo: a onda é uma imagem
// publicada com o app (public/email/onda.png) e o resto é tabela com estilo
// em linha. Quem não carrega imagens perde só a onda.
const INK = '#18092b'
const BODY = '#4b5563'
const MAGENTA = '#e6007a'
const PURPLE = '#7928ca'
const GRADIENT = 'linear-gradient(135deg,#ec008c 0%,#8916b5 60%,#4b0082 100%)'
const FONT = "'Plus Jakarta Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const DISPLAY = "'Space Grotesk','Plus Jakarta Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'background:#fee2e2;color:#b91c1c',
  high: 'background:#ffedd5;color:#c2410c',
  medium: 'background:#f3e8ff;color:#7e22ce',
  low: 'background:#f1f5f9;color:#475569',
}

function emailHtml(d: Digest, day: string, name: string) {
  const first = name ? escapeHtml(name.split(' ')[0]) : ''
  const pill = (priority: string) =>
    PRIORITY[priority]
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.low}">${PRIORITY[priority]}</span>`
      : ''
  const row = (i: Item, late: boolean) => `
            <tr>
              <td style="padding:12px 16px;border-top:1px solid #eef0f6;font-family:${FONT}">
                <div style="font-size:14px;font-weight:600;color:${INK};line-height:1.35">${escapeHtml(i.title)}</div>
                ${i.project ? `<div style="font-size:12px;color:${BODY};margin-top:3px">${escapeHtml(i.project)}</div>` : ''}
              </td>
              <td align="right" style="padding:12px 16px;border-top:1px solid #eef0f6;white-space:nowrap;vertical-align:top;font-family:${FONT}">
                ${pill(i.priority)}
                ${i.due ? `<div style="font-size:12px;margin-top:5px;font-weight:600;color:${late ? '#dc2626' : BODY}">${late ? `venceu ${brDate(i.due)}` : i.due === day ? 'vence hoje' : `prazo ${brDate(i.due)}`}</div>` : ''}
              </td>
            </tr>`
  const section = (title: string, items: Item[], late: boolean) =>
    items.length
      ? `
      <tr><td style="padding:0 32px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e9e4f2;border-radius:14px;border-collapse:separate;overflow:hidden">
          <tr>
            <td style="padding:10px 16px;background:${late ? '#fef2f2' : '#f8f6fc'};font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${late ? '#dc2626' : '#6b5b86'}">${title}</td>
            <td align="right" style="padding:10px 16px;background:${late ? '#fef2f2' : '#f8f6fc'};font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${late ? '#dc2626' : '#6b5b86'}">${items.length}</td>
          </tr>${items.map((i) => row(i, late)).join('')}
        </table>
      </td></tr>`
      : ''
  const meta = (label: string, value: string, color = INK) => `
          <td valign="top" style="padding:0 16px 0 0;font-family:${FONT}">
            <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8b7fa3">${label}</div>
            <div style="font-size:15px;font-weight:700;color:${color};margin-top:4px">${value}</div>
          </td>`

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Demandas de hoje</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f3f0f8">
  <div style="display:none;max-height:0;overflow:hidden">${summary(d)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0f8">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 30px rgba(75,0,130,.12)">
        <tr><td style="line-height:0;font-size:0;background:#ffffff"><img src="${APP_URL}/email/onda.png" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
        <tr><td style="padding:8px 32px 0;font-family:${FONT}">
          <div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${MAGENTA}">Lembrete do dia</div>
          <h1 style="margin:10px 0 0;font-family:${DISPLAY};font-size:30px;line-height:1.08;font-weight:700;text-transform:uppercase;color:${INK}">Demandas de hoje</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:${BODY}">Bom dia${first ? `, ${first}` : ''}! ${d.today.length || d.late.length ? 'Estas são as demandas que pedem atenção hoje.' : 'Nada agendado para hoje.'}</p>
        </td></tr>
        <tr><td style="padding:22px 32px 24px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee8f6;padding-top:16px;width:100%">
            <tr>
              ${meta('Data', brDate(day))}
              ${meta('Para hoje', String(d.today.length))}
              ${meta('Atrasadas', String(d.late.length), d.late.length ? '#dc2626' : INK)}
            </tr>
          </table>
        </td></tr>
        ${section('Para hoje', d.today, false)}
        ${section('Atrasadas', d.late, true)}
        <tr><td style="padding:4px 32px 32px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:999px;background:${PURPLE};background-image:${GRADIENT}">
              <a href="${APP_URL}/demandas" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">Abrir as demandas</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:14px 32px;border-top:1px solid #f0ebf7;font-family:${FONT}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:11px;color:#8b7fa3">Para parar, desligue o e-mail em Minha empresa → Lembretes.</td>
            <td align="right"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${PURPLE};background-image:${GRADIENT};color:#ffffff;font-size:10px;font-weight:700;white-space:nowrap">Krono</span></td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendEmail(to: string, d: Digest, day: string, name: string): Promise<string> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return 'sem a chave do Resend (segredo RESEND_API_KEY da função)'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') || 'Krono <onboarding@resend.dev>',
      to: [to],
      subject: `Demandas de hoje: ${summary(d)}`,
      html: emailHtml(d, day, name),
    }),
  })
  if (response.ok) return 'enviado'
  const body = await response.json().catch(() => null)
  return `o Resend recusou: ${body?.message ?? response.status}`
}

// ---------- Web Push ----------

async function vapidKeys() {
  let stored: string | null = (await admin.rpc('reminders_vapid_read')).data
  if (!stored) {
    const generated = await exportVapidKeys(await generateVapidKeys({ extractable: true }))
    await admin.rpc('reminders_vapid_save', { p_keys: JSON.stringify(generated) })
    // outra chamada pode ter gravado antes: vale o que ficou no Vault
    stored = (await admin.rpc('reminders_vapid_read')).data
  }
  if (!stored) throw new Problem('Não foi possível preparar as chaves das notificações.', 500)
  return importVapidKeys(JSON.parse(stored), { extractable: true })
}

async function sendPush(userId: string, contact: string, d: Digest) {
  const { data: subscriptions } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
  if (!subscriptions?.length) return { sent: 0, removed: 0 }
  const server = await ApplicationServer.new({ contactInformation: `mailto:${contact || 'lembretes@meus-freelas.pages.dev'}`, vapidKeys: await vapidKeys() })
  const names = [...d.today, ...d.late].slice(0, 3).map((i) => i.title)
  const payload = JSON.stringify({
    title: 'Demandas de hoje',
    body: names.length ? `${summary(d)}: ${names.join(', ')}${d.today.length + d.late.length > 3 ? '…' : ''}` : summary(d),
    url: '/demandas',
    tag: 'demandas-do-dia',
  })
  let sent = 0
  let removed = 0
  for (const s of subscriptions) {
    try {
      await server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }).pushTextMessage(payload, { ttl: 12 * 3600, urgency: Urgency.High, topic: 'demandas-do-dia' })
      await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id)
      sent++
    } catch (error) {
      // aparelho que desinstalou o app ou tirou a permissão: a inscrição não vale mais
      if (error instanceof PushMessageError && (error.isGone() || [403, 404, 410].includes(error.response.status))) {
        await admin.from('push_subscriptions').delete().eq('id', s.id)
        removed++
      } else console.error('push', error)
    }
  }
  return { sent, removed }
}

// ---------- envio ----------

async function remind(userId: string, day: string, force: boolean) {
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (!profile) throw new Problem('Perfil não encontrado.', 404)
  const d = await digest(userId, day)
  if (!force && !d.today.length && !d.late.length) return { skipped: true }
  const { data: auth } = await admin.auth.admin.getUserById(userId)
  const to = profile.email || auth?.user?.email || ''
  const email = profile.reminder_email || force ? (to ? await sendEmail(to, d, day, profile.full_name ?? '') : 'sem e-mail no perfil') : 'desligado'
  const push = profile.reminder_push || force ? await sendPush(userId, to, d) : null
  return { summary: summary(d), email, emailTo: profile.reminder_email || force ? to : null, push }
}

/** De hora em hora: quem escolheu esta hora e ainda não recebeu hoje. */
async function run() {
  const { day, hour } = brasilia()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, reminder_email, reminder_push')
    .eq('reminder_hour', hour)
    .or(`reminder_last_sent.is.null,reminder_last_sent.lt.${day}`)
  let sent = 0
  for (const p of (profiles ?? []).filter((x) => x.reminder_email || x.reminder_push)) {
    // marca antes de mandar: uma segunda chamada na mesma hora não repete
    const { data: claimed } = await admin.from('profiles').update({ reminder_last_sent: day }).eq('id', p.id).or(`reminder_last_sent.is.null,reminder_last_sent.lt.${day}`).select('id')
    if (!claimed?.length) continue
    try {
      const result = await remind(p.id, day, false)
      if (!('skipped' in result)) sent++
    } catch (error) {
      console.error('lembrete', p.id, error)
    }
  }
  return { hour, sent }
}

// ---------- entrada ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
    if (req.headers.has('x-cron-token')) {
      const { data: ok } = await admin.rpc('billing_cron_token_ok', { p_token: req.headers.get('x-cron-token') ?? '' })
      if (ok !== true) return json(401, { error: 'unauthorized' })
      return json(200, await run())
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await admin.auth.getUser(jwt)
    if (!auth?.user) return json(401, { error: 'unauthorized', message: 'Entre no sistema para usar os lembretes.' })

    const body = await req.json().catch(() => ({}))
    if (body.action === 'vapid-public-key') return json(200, { key: await exportApplicationServerKey(await vapidKeys()) })
    if (body.action === 'send-test') return json(200, await remind(auth.user.id, brasilia().day, true))
    return json(400, { error: 'invalid_action', message: 'Ação desconhecida.' })
  } catch (error) {
    if (error instanceof Problem) return json(error.status, { error: 'reminders_failed', message: error.message })
    console.error(error)
    return json(500, { error: 'reminders_failed', message: error instanceof Error ? error.message : 'Erro inesperado.' })
  }
})
