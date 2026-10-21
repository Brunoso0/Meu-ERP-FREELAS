import { z } from 'zod'
import { EntityForm, type FieldDef } from './EntityForm'
import { GatewayConnection } from '@/components/billing/GatewayConnection'
import { NfseServicesEditor } from '@/components/billing/NfseServicesEditor'
import { ReminderSettings } from '@/components/reminders/ReminderSettings'
import { billingProviders, billingTypes } from '@/lib/billing'
import { useTable } from '@/hooks/useData'
import { useUI, type ModalType } from '@/store/ui'
import {
  clientStatus,
  eventType,
  goalCategory,
  projectStatus,
  taskPriority,
  taskStatus,
  toOptions,
} from '@/lib/labels'
import { expandRecurrence, MAX_INSTALLMENTS } from '@/lib/recurrence'
import { maskCpfCnpj, maskPhone } from '@/lib/utils'
import type { TableName } from '@/types/database.types'

const text = z.string()
const money = z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo')
const email = z.string().email('E-mail inválido').or(z.literal(''))
const phone = z.string().refine((v) => v === '' || v.replace(/\D/g, '').length >= 10, 'Telefone incompleto')
const document = z.string().refine((v) => [0, 11, 14].includes(v.replace(/\D/g, '').length), 'CPF ou CNPJ incompleto')

/** Cadastro do cliente; também usado na edição pela tela do cliente. */
export const clientSchema = z.object({
  name: text.min(2, 'Informe o nome'),
  company_name: text,
  email,
  phone,
  document,
  status: z.enum(['active', 'inactive', 'lead']),
  notes: text,
})

const schemas: Record<ModalType, z.ZodTypeAny> = {
  client: clientSchema,
  project: z.object({
    title: text.min(2, 'Informe o título'),
    client_id: text,
    status: z.enum(['planning', 'in_progress', 'review', 'completed', 'cancelled']),
    budget: money,
    deadline: text,
    description: text,
  }),
  task: z.object({
    title: text.min(2, 'Informe o título'),
    project_id: text,
    status: z.enum(['backlog', 'in_progress', 'review', 'done']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    scheduled_date: text,
    due_date: text,
    charged_amount: money,
    description: text,
  }),
  event: z
    .object({
      title: text.min(2, 'Informe o título'),
      event_type: z.enum(['meeting', 'deadline', 'review']),
      start_time: text.min(1, 'Informe o início'),
      end_time: text,
      // só http(s): z.url() sozinho aceita esquemas como javascript:, que virariam um link executável
      meeting_link: z
        .string()
        .url('Link inválido (inclua https://)')
        .refine((v) => /^https?:\/\//i.test(v), 'O link precisa começar com https://')
        .or(z.literal('')),
      client_id: text,
      })
    .refine((v) => !v.end_time || v.end_time >= v.start_time, { path: ['end_time'], message: 'Termina antes de começar' }),
  transaction: z
    .object({
      type: z.enum(['income', 'expense']),
      description: text.min(2, 'Descreva a transação'),
      category: text,
      amount: z.coerce.number({ invalid_type_error: 'Informe um número' }).positive('Informe um valor maior que zero'),
      due_date: text.min(1, 'Informe o vencimento'),
      status: z.enum(['pending', 'paid', 'overdue']),
      payment_date: text,
      client_id: text,
      project_id: text,
      // só existem ao criar; na edição chegam vazios
      recurrence: z.enum(['none', 'monthly']).or(z.literal('')).optional(),
      installments: z.coerce.number().optional(),
    })
    .refine((v) => v.status !== 'paid' || v.payment_date, { path: ['payment_date'], message: 'Informe a data do pagamento' })
    .refine((v) => v.recurrence !== 'monthly' || (Number.isInteger(v.installments) && v.installments! >= 2 && v.installments! <= MAX_INSTALLMENTS), {
      path: ['installments'],
      message: `Informe de 2 a ${MAX_INSTALLMENTS} meses`,
    }),
  goal: z
    .object({
      title: text.min(2, 'Informe o título'),
      category: z.enum(['revenue', 'clients', 'projects']),
      target_amount: z.coerce.number({ invalid_type_error: 'Informe um número' }).positive('Informe a meta'),
      current_amount: money,
      start_date: text.min(1, 'Informe o início'),
      end_date: text.min(1, 'Informe o fim'),
    })
    .refine((v) => v.end_date >= v.start_date, { path: ['end_date'], message: 'Termina antes de começar' }),
  profile: z.object({
    full_name: text.min(2, 'Informe seu nome'),
    company_name: text,
    document,
    email,
    phone,
    pix_key: text.max(140, 'Chave muito longa'),
    pix_qr_image: text.refine((v) => v === '' || v.startsWith('data:image/'), 'Imagem inválida'),
    signature_image: text.refine((v) => v === '' || (v.startsWith('data:image/png;base64,') && v.length <= 200000), 'Assinatura inválida'),
    billing_provider: z.enum(['simple', 'asaas']),
    billing_types: z.enum(['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD']),
    billing_fine_pct: z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo').max(10, 'Até 10%'),
    billing_interest_pct: z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo').max(10, 'Até 10% ao mês'),
    billing_discount_pct: z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo').max(50, 'Até 50%'),
    billing_discount_days: z.coerce.number({ invalid_type_error: 'Informe um número' }).int('Dias inteiros').min(0, 'Não pode ser negativo').max(60, 'Até 60 dias'),
    billing_notify: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'),
    nfse_services: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().trim().min(2, 'Dê um nome a cada serviço'),
          cnae: z.string(),
          code: z.string().max(20),
          description: z.string().max(1000),
          nbs: z.string().max(20).optional(),
        }),
      )
      .max(20)
      .nullable()
      .transform((v) => v ?? []),
    nfse_observations: text.max(1000, 'Até 1.000 caracteres'),
    reminder_email: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'),
    reminder_push: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'),
    reminder_hour: z.coerce.number().int().min(0).max(23),
  }),
}

const meta: Record<ModalType, { table: TableName; noun: string; create: string; edit: string; variant?: 'drawer' | 'modal'; allowDelete?: boolean }> = {
  client: { table: 'clients', noun: 'o cliente', create: 'Novo cliente', edit: 'Editar cliente' },
  project: { table: 'projects', noun: 'o projeto', create: 'Novo projeto', edit: 'Editar projeto' },
  task: { table: 'tasks', noun: 'a demanda', create: 'Nova demanda', edit: 'Editar demanda' },
  event: { table: 'calendar_events', noun: 'o compromisso', create: 'Novo compromisso', edit: 'Editar compromisso', variant: 'modal' },
  transaction: { table: 'financial_transactions', noun: 'a transação', create: 'Nova transação', edit: 'Editar transação' },
  goal: { table: 'goals', noun: 'a meta', create: 'Nova meta', edit: 'Editar meta', variant: 'modal' },
  profile: { table: 'profiles', noun: 'o perfil', create: 'Minha empresa', edit: 'Minha empresa', allowDelete: false },
}

/** Um lançamento com repetição mensal vira uma linha por mês. */
function expandTransaction({ recurrence, installments, ...base }: Record<string, any>) {
  return recurrence === 'monthly' ? expandRecurrence(base, Number(installments)) : [base]
}

/** Formulários de criação/edição abertos de qualquer tela via `useUI().openModal`. */
export function GlobalModals() {
  const { modal, closeModal } = useUI()
  const clients = useTable('clients').data ?? []
  const projects = useTable('projects').data ?? []

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.company_name ? `${c.name} — ${c.company_name}` : c.name }))
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.title }))

  const fields: Record<ModalType, FieldDef[]> = {
    client: [
      { name: 'name', label: 'Nome do contato', full: true },
      { name: 'company_name', label: 'Empresa' },
      { name: 'document', label: 'CPF / CNPJ', mask: maskCpfCnpj, placeholder: '00.000.000/0000-00' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'phone', label: 'WhatsApp', mask: maskPhone, placeholder: '(00) 00000-0000' },
      { name: 'status', label: 'Status', type: 'select', options: toOptions(clientStatus), full: true },
      { name: 'notes', label: 'Observações', type: 'textarea' },
    ],
    project: [
      { name: 'title', label: 'Título', full: true },
      { name: 'client_id', label: 'Cliente', type: 'select', options: clientOptions, emptyOption: 'Sem cliente' },
      { name: 'status', label: 'Status', type: 'select', options: toOptions(projectStatus) },
      { name: 'budget', label: 'Orçamento (R$)', type: 'number' },
      { name: 'deadline', label: 'Prazo final', type: 'date' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
    ],
    task: [
      { name: 'title', label: 'Título', full: true },
      { name: 'project_id', label: 'Projeto', type: 'select', options: projectOptions, emptyOption: 'Sem projeto' },
      { name: 'status', label: 'Status', type: 'select', options: toOptions(taskStatus) },
      { name: 'priority', label: 'Prioridade', type: 'select', options: toOptions(taskPriority) },
      { name: 'scheduled_date', label: 'Dia no kanban', type: 'date' },
      { name: 'due_date', label: 'Prazo', type: 'date' },
      { name: 'charged_amount', label: 'Valor da demanda (R$)', type: 'number' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
    ],
    event: [
      { name: 'title', label: 'Título', full: true },
      { name: 'event_type', label: 'Tipo', type: 'select', options: toOptions(eventType), full: true },
      { name: 'start_time', label: 'Início', type: 'datetime' },
      { name: 'end_time', label: 'Fim', type: 'datetime' },
      { name: 'meeting_link', label: 'Link da videoconferência', placeholder: 'https://meet.google.com/…', full: true },
      { name: 'client_id', label: 'Cliente', type: 'select', options: clientOptions, emptyOption: 'Nenhum' },
    ],
    transaction: [
      { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'income', label: 'Entrada (a receber)' }, { value: 'expense', label: 'Despesa (a pagar)' }] },
      { name: 'amount', label: 'Valor (R$)', type: 'number' },
      { name: 'description', label: 'Descrição', full: true },
      { name: 'category', label: 'Categoria', placeholder: 'Projeto, Ferramentas, Impostos…' },
      { name: 'due_date', label: 'Vencimento', type: 'date' },
      { name: 'recurrence', label: 'Repetir', type: 'select', options: [{ value: 'none', label: 'Não repetir' }, { value: 'monthly', label: 'Todo mês (mensalidade)' }], createOnly: true },
      { name: 'installments', label: 'Por quantos meses', type: 'number', step: '1', placeholder: '12', createOnly: true, full: true, showWhen: (v) => v.recurrence === 'monthly', hint: 'Um lançamento por mês a partir do vencimento acima. A situação escolhida vale só para o primeiro.' },
      { name: 'status', label: 'Situação', type: 'select', options: [{ value: 'pending', label: 'Pendente' }, { value: 'paid', label: 'Pago' }] },
      { name: 'payment_date', label: 'Data do pagamento', type: 'date' },
      { name: 'client_id', label: 'Cliente', type: 'select', options: clientOptions, emptyOption: 'Nenhum' },
      { name: 'project_id', label: 'Projeto', type: 'select', options: projectOptions, emptyOption: 'Nenhum', full: true },
    ],
    goal: [
      { name: 'title', label: 'Título', full: true },
      { name: 'category', label: 'O que medir', type: 'select', options: (Object.keys(goalCategory) as Array<keyof typeof goalCategory>).map((value) => ({ value, label: goalCategory[value] })), full: true },
      { name: 'target_amount', label: 'Meta', type: 'number' },
      { name: 'current_amount', label: 'Já realizado fora do sistema', type: 'number' },
      { name: 'start_date', label: 'Início', type: 'date' },
      { name: 'end_date', label: 'Fim', type: 'date' },
    ],
    // estes dados aparecem como emitente nas propostas e contratos
    profile: [
      { name: 'full_name', label: 'Seu nome', full: true },
      { name: 'company_name', label: 'Empresa (emitente das propostas)', full: true },
      { name: 'document', label: 'CPF / CNPJ', mask: maskCpfCnpj, placeholder: '00.000.000/0000-00' },
      { name: 'phone', label: 'WhatsApp', mask: maskPhone, placeholder: '(00) 00000-0000' },
      { name: 'email', label: 'E-mail de contato', type: 'email', full: true },
      { name: 'signature_image', label: 'Sua assinatura', type: 'signature', hint: 'Sai no campo do emitente das propostas e dos contratos, inclusive nos links enviados para o cliente assinar.' },
      { name: 'billing_section', label: 'Forma de cobrança', type: 'section', hint: 'Como os seus clientes pagam os orçamentos e as parcelas do financeiro.' },
      { name: 'billing_provider', label: 'Cobrar por', type: 'select', options: (Object.keys(billingProviders) as Array<keyof typeof billingProviders>).map((value) => ({ value, label: billingProviders[value].label })), full: true },
      { name: 'billing_simple_hint', label: '', type: 'custom', showWhen: (v) => v.billing_provider !== 'asaas', render: () => <p className="col-span-2 -mt-2 text-xs text-slate-500 dark:text-slate-400">{billingProviders.simple.hint} Para aplicar multa e juros por atraso, use um gateway.</p> },
      { name: 'pix_key', label: 'Chave Pix (para receber)', placeholder: 'CPF/CNPJ, e-mail, telefone ou chave aleatória', full: true, showWhen: (v) => v.billing_provider !== 'asaas' },
      { name: 'pix_qr_image', label: 'QR Code Pix', type: 'image', hint: 'Imagem do QR Code gerado no app do seu banco. Aparece nos orçamentos.', showWhen: (v) => v.billing_provider !== 'asaas' },
      { name: 'billing_asaas_hint', label: '', type: 'custom', showWhen: (v) => v.billing_provider === 'asaas', render: () => <p className="col-span-2 -mt-2 text-xs text-slate-500 dark:text-slate-400">{billingProviders.asaas.hint}</p> },
      { name: 'billing_gateway', label: 'Conexão', type: 'custom', showWhen: (v) => v.billing_provider === 'asaas', render: ({ setValue }) => <GatewayConnection onProviderChange={(provider) => setValue('billing_provider', provider)} /> },
      { name: 'billing_types', label: 'Formas de pagamento aceitas', type: 'select', options: billingTypes, full: true, showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'billing_fine_pct', label: 'Multa por atraso (%)', type: 'number', hint: 'Cobrada uma vez, logo após o vencimento. Para pessoa física (consumidor), a lei limita a 2%.', showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'billing_interest_pct', label: 'Juros ao mês (%)', type: 'number', hint: 'Proporcionais aos dias de atraso. Comum: 1% ao mês.', showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'billing_discount_pct', label: 'Desconto para pagar antes (%)', type: 'number', hint: '0 = sem desconto.', showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'billing_discount_days', label: 'Desconto vale até (dias antes)', type: 'number', step: '1', hint: '0 = até o dia do vencimento.', showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'nfse_section', label: 'Nota fiscal', type: 'section', hint: 'Emitida pelo Asaas, no Portal Nacional da NFS-e, em Ferramentas → Gerador de Notas Fiscais.', showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'nfse_services', label: 'Serviços', type: 'custom', persist: true, initial: [], showWhen: (v) => v.billing_provider === 'asaas', render: ({ values, setValue }) => <NfseServicesEditor value={values.nfse_services} onChange={(services) => setValue('nfse_services', services)} /> },
      { name: 'nfse_observations', label: 'Observações em toda nota (opcional)', type: 'textarea', showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'billing_notify', label: 'Avisos ao cliente', type: 'select', options: [{ value: 'true', label: 'O Asaas avisa o cliente por e-mail e SMS' }, { value: 'false', label: 'Não avisar (eu mando o link)' }], full: true, hint: 'Vale para os clientes cadastrados no Asaas a partir de agora.', showWhen: (v) => v.billing_provider === 'asaas' },
      { name: 'reminder_section', label: 'Lembretes', type: 'section', hint: 'Todo dia, no horário escolhido, as demandas do dia e as atrasadas chegam por e-mail e como notificação no celular.' },
      { name: 'reminder_hour', label: 'Horário (Brasília)', type: 'select', options: Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` })) },
      { name: 'reminder_email', label: 'Por e-mail', type: 'select', options: [{ value: 'true', label: 'Enviar' }, { value: 'false', label: 'Não enviar' }] },
      { name: 'reminder_push', label: 'Notificação no celular', type: 'select', options: [{ value: 'true', label: 'Enviar para os aparelhos ativados' }, { value: 'false', label: 'Não enviar' }], full: true },
      { name: 'reminder_device', label: 'Aparelho', type: 'custom', render: ({ values }) => <ReminderSettings email={values.email ?? ''} /> },
    ],
  }

  // mantém o último tipo montado durante a animação de saída
  const type = modal?.type ?? 'client'
  const m = meta[type]

  return (
    <EntityForm
      key={type}
      open={modal !== null}
      onClose={closeModal}
      noun={m.noun}
      title={modal?.record ? m.edit : m.create}
      table={m.table}
      fields={fields[type]}
      schema={schemas[type]}
      record={modal?.record}
      defaults={modal?.defaults}
      variant={m.variant}
      allowDelete={m.allowDelete}
      expand={type === 'transaction' ? expandTransaction : undefined}
    />
  )
}
