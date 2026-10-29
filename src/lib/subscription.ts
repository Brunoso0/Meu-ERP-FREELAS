import { supabase } from '@/lib/supabase'

export type BillingMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD'

export interface Invoice {
  id: string
  dueDate: string
  value: number
  status: string
  url: string | null
}

/** Chama a função `subscription`; os erros que a pessoa consegue resolver voltam como mensagem. */
async function call<T>(action: string, workspaceId: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('A contratação de planos precisa do Supabase configurado (o modo demo não cobra).')
  const { data, error } = await supabase.functions.invoke('subscription', { body: { action, workspaceId, ...extra } })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null
    if (detail?.message) throw new Error(detail.message)
    if (context?.status === 404) throw new Error('A função de assinatura (subscription) ainda não foi publicada no Supabase.')
    throw new Error('Não foi possível falar com a cobrança. Tente de novo em instantes.')
  }
  return data as T
}

export const startCheckout = (workspaceId: string, input: { plan: 'essential' | 'pro'; billingType: BillingMethod; document: string; extraMembers: number }) =>
  call<{ url?: string | null; changed?: boolean }>('checkout', workspaceId, input)

export const setBillingMethod = (workspaceId: string, billingType: BillingMethod) =>
  call<{ saved: boolean; url?: string | null }>('method', workspaceId, { billingType })

/** Link da fatura em aberto, onde o cartão é cadastrado ou trocado (na página do Asaas). */
export const cardLink = (workspaceId: string) => call<{ url: string | null }>('card', workspaceId)

export const cancelSubscription = (workspaceId: string) => call<{ canceled: boolean }>('cancel', workspaceId)

export const listInvoices = (workspaceId: string) => call<{ payments: Invoice[] }>('invoices', workspaceId)

export const invoiceStatusLabel: Record<string, string> = {
  PENDING: 'Aguardando pagamento',
  RECEIVED: 'Paga',
  CONFIRMED: 'Paga',
  OVERDUE: 'Vencida',
  REFUNDED: 'Estornada',
  RECEIVED_IN_CASH: 'Paga',
}
