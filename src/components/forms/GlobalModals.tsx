import { z } from 'zod'
import { EntityForm, type FieldDef } from './EntityForm'
import { useTable } from '@/hooks/useData'
import { useUI, type ModalType } from '@/store/ui'
import {
  clientStatus,
  eventType,
  freelancerStatus,
  goalCategory,
  projectStatus,
  taskPriority,
  taskStatus,
  toOptions,
} from '@/lib/labels'
import { maskCpfCnpj, maskPhone } from '@/lib/utils'
import type { TableName } from '@/types/database.types'

const text = z.string()
const money = z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo')
const email = z.string().email('E-mail inválido').or(z.literal(''))
const phone = z.string().refine((v) => v === '' || v.replace(/\D/g, '').length >= 10, 'Telefone incompleto')
const document = z.string().refine((v) => [0, 11, 14].includes(v.replace(/\D/g, '').length), 'CPF ou CNPJ incompleto')

const schemas: Record<ModalType, z.ZodTypeAny> = {
  client: z.object({
    name: text.min(2, 'Informe o nome'),
    company_name: text,
    email,
    phone,
    document,
    status: z.enum(['active', 'inactive', 'lead']),
    hourly_rate: money,
    notes: text,
  }),
  freelancer: z.object({
    name: text.min(2, 'Informe o nome'),
    specialty: text,
    email,
    phone,
    pix_key: text,
    cost_per_hour: money,
    rating: z.coerce.number().min(0, 'De 0 a 5').max(5, 'De 0 a 5'),
    status: z.enum(['active', 'inactive']),
  }),
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
    freelancer_id: text,
    status: z.enum(['backlog', 'in_progress', 'review', 'done']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    scheduled_date: text,
    due_date: text,
    charged_amount: money,
    cost_amount: money,
    description: text,
  }),
  event: z
    .object({
      title: text.min(2, 'Informe o título'),
      event_type: z.enum(['meeting', 'deadline', 'review']),
      start_time: text.min(1, 'Informe o início'),
      end_time: text,
      meeting_link: z.string().url('Link inválido (inclua https://)').or(z.literal('')),
      client_id: text,
      freelancer_id: text,
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
      freelancer_id: text,
      project_id: text,
    })
    .refine((v) => v.status !== 'paid' || v.payment_date, { path: ['payment_date'], message: 'Informe a data do pagamento' }),
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
  }),
}

const meta: Record<ModalType, { table: TableName; noun: string; create: string; edit: string; variant?: 'drawer' | 'modal'; allowDelete?: boolean }> = {
  client: { table: 'clients', noun: 'o cliente', create: 'Novo cliente', edit: 'Editar cliente' },
  freelancer: { table: 'freelancers', noun: 'o freelancer', create: 'Novo freelancer', edit: 'Editar freelancer' },
  project: { table: 'projects', noun: 'o projeto', create: 'Novo projeto', edit: 'Editar projeto' },
  task: { table: 'tasks', noun: 'a demanda', create: 'Nova demanda', edit: 'Editar demanda' },
  event: { table: 'calendar_events', noun: 'o compromisso', create: 'Novo compromisso', edit: 'Editar compromisso', variant: 'modal' },
  transaction: { table: 'financial_transactions', noun: 'a transação', create: 'Nova transação', edit: 'Editar transação' },
  goal: { table: 'goals', noun: 'a meta', create: 'Nova meta', edit: 'Editar meta', variant: 'modal' },
  profile: { table: 'profiles', noun: 'o perfil', create: 'Minha empresa', edit: 'Minha empresa', allowDelete: false },
}

/** Formulários de criação/edição abertos de qualquer tela via `useUI().openModal`. */
export function GlobalModals() {
  const { modal, closeModal } = useUI()
  const clients = useTable('clients').data ?? []
  const freelancers = useTable('freelancers').data ?? []
  const projects = useTable('projects').data ?? []

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.company_name ? `${c.name} — ${c.company_name}` : c.name }))
  const freelancerOptions = freelancers.map((f) => ({ value: f.id, label: f.name }))
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.title }))

  const fields: Record<ModalType, FieldDef[]> = {
    client: [
      { name: 'name', label: 'Nome do contato', full: true },
      { name: 'company_name', label: 'Empresa' },
      { name: 'document', label: 'CPF / CNPJ', mask: maskCpfCnpj, placeholder: '00.000.000/0000-00' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'phone', label: 'WhatsApp', mask: maskPhone, placeholder: '(00) 00000-0000' },
      { name: 'status', label: 'Status', type: 'select', options: toOptions(clientStatus) },
      { name: 'hourly_rate', label: 'Valor/hora (R$)', type: 'number' },
      { name: 'notes', label: 'Observações', type: 'textarea' },
    ],
    freelancer: [
      { name: 'name', label: 'Nome', full: true },
      { name: 'specialty', label: 'Especialidade', placeholder: 'Ex.: Front-end React' },
      { name: 'status', label: 'Status', type: 'select', options: toOptions(freelancerStatus) },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'phone', label: 'WhatsApp', mask: maskPhone, placeholder: '(00) 00000-0000' },
      { name: 'pix_key', label: 'Chave PIX', full: true },
      { name: 'cost_per_hour', label: 'Custo/hora (R$)', type: 'number' },
      { name: 'rating', label: 'Avaliação (0 a 5)', type: 'number', step: '0.1' },
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
      { name: 'freelancer_id', label: 'Freelancer', type: 'select', options: freelancerOptions, emptyOption: 'Não alocado' },
      { name: 'status', label: 'Status', type: 'select', options: toOptions(taskStatus) },
      { name: 'priority', label: 'Prioridade', type: 'select', options: toOptions(taskPriority) },
      { name: 'scheduled_date', label: 'Dia no kanban', type: 'date' },
      { name: 'due_date', label: 'Prazo', type: 'date' },
      { name: 'charged_amount', label: 'Cobrado do cliente (R$)', type: 'number' },
      { name: 'cost_amount', label: 'Repasse ao freelancer (R$)', type: 'number' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
    ],
    event: [
      { name: 'title', label: 'Título', full: true },
      { name: 'event_type', label: 'Tipo', type: 'select', options: toOptions(eventType), full: true },
      { name: 'start_time', label: 'Início', type: 'datetime' },
      { name: 'end_time', label: 'Fim', type: 'datetime' },
      { name: 'meeting_link', label: 'Link da videoconferência', placeholder: 'https://meet.google.com/…', full: true },
      { name: 'client_id', label: 'Cliente', type: 'select', options: clientOptions, emptyOption: 'Nenhum' },
      { name: 'freelancer_id', label: 'Freelancer', type: 'select', options: freelancerOptions, emptyOption: 'Nenhum' },
    ],
    transaction: [
      { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'income', label: 'Entrada (a receber)' }, { value: 'expense', label: 'Saída (a pagar)' }] },
      { name: 'amount', label: 'Valor (R$)', type: 'number' },
      { name: 'description', label: 'Descrição', full: true },
      { name: 'category', label: 'Categoria', placeholder: 'Projeto, Repasse, Ferramentas…' },
      { name: 'due_date', label: 'Vencimento', type: 'date' },
      { name: 'status', label: 'Situação', type: 'select', options: [{ value: 'pending', label: 'Pendente' }, { value: 'paid', label: 'Pago' }] },
      { name: 'payment_date', label: 'Data do pagamento', type: 'date' },
      { name: 'client_id', label: 'Cliente', type: 'select', options: clientOptions, emptyOption: 'Nenhum' },
      { name: 'freelancer_id', label: 'Freelancer (repasse)', type: 'select', options: freelancerOptions, emptyOption: 'Nenhum' },
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
    />
  )
}
