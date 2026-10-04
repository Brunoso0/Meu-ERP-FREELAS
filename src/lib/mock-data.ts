import { addDays, addHours, addMonths, setHours, setMinutes, startOfMonth, startOfWeek, subDays, subMonths, endOfMonth, endOfQuarter, startOfQuarter } from 'date-fns'
import type { FinancialTransaction, Tables } from '@/types/database.types'
import { isoDay } from './utils'

export type MockDB = { [K in keyof Tables]: Tables[K][] }

export const DEMO_USER_ID = 'demo-user'

/**
 * Dados fictícios do modo demo. As datas são relativas a "hoje" para que
 * dashboard, kanban e agenda sempre tenham algo para mostrar.
 */
export function buildSeed(): MockDB {
  const now = new Date()
  const u = DEMO_USER_ID
  const created = (daysAgo: number) => subDays(now, daysAgo).toISOString()
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const weekday = (i: number) => isoDay(addDays(monday, i))
  const at = (base: Date, h: number, m = 0) => setMinutes(setHours(base, h), m).toISOString()

  const clients: MockDB['clients'] = [
    { id: 'c1', user_id: u, name: 'Marina Albuquerque', company_name: 'Estúdio Aurora', email: 'marina@estudioaurora.example', phone: '(11) 98888-1010', document: '12.345.678/0001-90', status: 'active', hourly_rate: 180, notes: 'Prefere contato por WhatsApp.', created_at: created(160) },
    { id: 'c2', user_id: u, name: 'Rafael Teixeira', company_name: 'Bento Café', email: 'rafael@bentocafe.example', phone: '(21) 97777-2020', document: '23.456.789/0001-01', status: 'active', hourly_rate: 150, notes: null, created_at: created(120) },
    { id: 'c3', user_id: u, name: 'Lívia Moraes', company_name: 'Clínica Vértice', email: 'livia@clinicavertice.example', phone: '(31) 96666-3030', document: '34.567.890/0001-12', status: 'active', hourly_rate: 200, notes: null, created_at: created(75) },
    { id: 'c4', user_id: u, name: 'Otávio Pires', company_name: 'Rota Logística', email: 'otavio@rotalog.example', phone: '(41) 95555-4040', document: '45.678.901/0001-23', status: 'lead', hourly_rate: 160, notes: 'Chegou por indicação.', created_at: created(12) },
    { id: 'c5', user_id: u, name: 'Helena Duarte', company_name: null, email: 'helena.duarte@mail.example', phone: '(51) 94444-5050', document: '123.456.789-09', status: 'inactive', hourly_rate: 140, notes: null, created_at: created(300) },
  ]

  // a tabela continua existindo no banco, mas o app não usa mais cadastro de terceiros
  const freelancers: MockDB['freelancers'] = []

  const proposals: MockDB['proposals'] = [
    {
      id: 'p1', user_id: u, proposal_number: 1, client_id: 'c1', title: 'Novo site institucional', status: 'approved',
      scope_text: 'Redesenho completo do site institucional, com foco em portfólio e captação de contatos.',
      content: {
        deliverables: ['Layout responsivo em Figma', 'Site em React com CMS', 'Treinamento de 1h para a equipe'],
        schedule: [{ label: 'Descoberta e wireframes', duration: '1 semana' }, { label: 'Design de interface', duration: '2 semanas' }, { label: 'Desenvolvimento e publicação', duration: '3 semanas' }],
        items: [{ description: 'Design de interface', quantity: 1, unit_price: 6500 }, { description: 'Desenvolvimento front-end', quantity: 1, unit_price: 9500 }, { description: 'Integração com CMS', quantity: 1, unit_price: 2500 }],
      },
      total_amount: 18500, validity_days: 15, payment_terms: '50% na aprovação e 50% na entrega, via PIX.', created_at: created(70),
    },
    {
      id: 'p2', user_id: u, proposal_number: 2, client_id: 'c2', title: 'App de fidelidade', status: 'approved',
      scope_text: 'Aplicativo web de pontos e recompensas para clientes do café.',
      content: {
        deliverables: ['PWA de fidelidade', 'Painel administrativo', 'Documentação da API'],
        schedule: [{ label: 'Prototipação', duration: '2 semanas' }, { label: 'Desenvolvimento', duration: '5 semanas' }],
        items: [{ description: 'PWA do cliente', quantity: 1, unit_price: 14000 }, { description: 'Painel administrativo', quantity: 1, unit_price: 8000 }],
      },
      total_amount: 22000, validity_days: 20, payment_terms: '3 parcelas mensais iguais.', created_at: created(55),
    },
    {
      id: 'p3', user_id: u, proposal_number: 3, client_id: 'c3', title: 'Sistema de agendamento online', status: 'sent',
      scope_text: 'Agendamento de consultas com confirmação automática por WhatsApp.',
      content: {
        deliverables: ['Fluxo de agendamento', 'Integração com WhatsApp', 'Relatórios de ocupação'],
        schedule: [{ label: 'Levantamento', duration: '1 semana' }, { label: 'Implementação', duration: '4 semanas' }],
        items: [{ description: 'Módulo de agendamento', quantity: 1, unit_price: 11000 }, { description: 'Integrações', quantity: 1, unit_price: 4800 }],
      },
      total_amount: 15800, validity_days: 15, payment_terms: '40% de entrada, saldo em 2 parcelas.', created_at: created(6),
    },
    {
      id: 'p4', user_id: u, proposal_number: 4, client_id: 'c4', title: 'Painel de rastreamento de entregas', status: 'draft',
      scope_text: 'Dashboard para acompanhamento de entregas em tempo real.',
      content: {
        deliverables: ['Dashboard web', 'API de eventos'],
        schedule: [{ label: 'Implementação', duration: '6 semanas' }],
        items: [{ description: 'Dashboard', quantity: 1, unit_price: 17500 }, { description: 'API', quantity: 1, unit_price: 9900 }],
      },
      total_amount: 27400, validity_days: 10, payment_terms: 'A combinar.', created_at: created(2),
    },
  ]

  const projects: MockDB['projects'] = [
    { id: 'pr1', user_id: u, client_id: 'c1', proposal_id: 'p1', title: 'Site Estúdio Aurora', description: 'Site institucional com CMS.', budget: 18500, status: 'in_progress', deadline: isoDay(addDays(now, 18)), created_at: created(60) },
    { id: 'pr2', user_id: u, client_id: 'c2', proposal_id: 'p2', title: 'App Bento Fidelidade', description: 'PWA de pontos e recompensas.', budget: 22000, status: 'in_progress', deadline: isoDay(addDays(now, 35)), created_at: created(45) },
    { id: 'pr3', user_id: u, client_id: 'c3', proposal_id: null, title: 'Landing page de campanha', description: 'Página para campanha de check-up.', budget: 6400, status: 'review', deadline: isoDay(addDays(now, 4)), created_at: created(25) },
    { id: 'pr4', user_id: u, client_id: 'c5', proposal_id: null, title: 'Identidade visual', description: 'Marca e manual de uso.', budget: 7800, status: 'completed', deadline: isoDay(subDays(now, 40)), created_at: created(120) },
  ]

  const tasks: MockDB['tasks'] = [
    { id: 't1', user_id: u, project_id: 'pr1', freelancer_id: null, title: 'Ajustar layout da home', description: null, status: 'done', priority: 'medium', scheduled_date: weekday(0), due_date: weekday(0), cost_amount: 0, charged_amount: 1400, created_at: created(9) },
    { id: 't2', user_id: u, project_id: 'pr1', freelancer_id: null, title: 'Componentes do portfólio', description: 'Grade e página de detalhe.', status: 'in_progress', priority: 'high', scheduled_date: weekday(1), due_date: weekday(2), cost_amount: 0, charged_amount: 2600, created_at: created(8) },
    { id: 't3', user_id: u, project_id: 'pr2', freelancer_id: null, title: 'API de pontos', description: 'Endpoints de saldo e resgate.', status: 'in_progress', priority: 'urgent', scheduled_date: weekday(1), due_date: isoDay(addDays(now, 1)), cost_amount: 0, charged_amount: 3800, created_at: created(7) },
    { id: 't4', user_id: u, project_id: 'pr2', freelancer_id: null, title: 'Telas de resgate', description: null, status: 'review', priority: 'medium', scheduled_date: weekday(2), due_date: weekday(3), cost_amount: 0, charged_amount: 1900, created_at: created(7) },
    { id: 't5', user_id: u, project_id: 'pr3', freelancer_id: null, title: 'Formulário de captação', description: null, status: 'in_progress', priority: 'high', scheduled_date: weekday(2), due_date: isoDay(addDays(now, 1)), cost_amount: 0, charged_amount: 1100, created_at: created(5) },
    { id: 't6', user_id: u, project_id: 'pr3', freelancer_id: null, title: 'Revisão dos textos', description: null, status: 'in_progress', priority: 'low', scheduled_date: weekday(3), due_date: weekday(4), cost_amount: 0, charged_amount: 600, created_at: created(5) },
    { id: 't7', user_id: u, project_id: 'pr1', freelancer_id: null, title: 'Integração com CMS', description: null, status: 'in_progress', priority: 'medium', scheduled_date: weekday(3), due_date: isoDay(addDays(monday, 8)), cost_amount: 0, charged_amount: 2500, created_at: created(4) },
    { id: 't8', user_id: u, project_id: 'pr2', freelancer_id: null, title: 'Autenticação por telefone', description: null, status: 'in_progress', priority: 'high', scheduled_date: weekday(4), due_date: isoDay(addDays(monday, 9)), cost_amount: 0, charged_amount: 2900, created_at: created(4) },
    { id: 't9', user_id: u, project_id: 'pr2', freelancer_id: null, title: 'Notificações push', description: 'Definir provedor antes de começar.', status: 'backlog', priority: 'medium', scheduled_date: null, due_date: null, cost_amount: 0, charged_amount: 2200, created_at: created(3) },
    { id: 't10', user_id: u, project_id: 'pr1', freelancer_id: null, title: 'Página de contato', description: null, status: 'backlog', priority: 'low', scheduled_date: null, due_date: null, cost_amount: 0, charged_amount: 900, created_at: created(3) },
    { id: 't11', user_id: u, project_id: 'pr3', freelancer_id: null, title: 'Variação de banner para anúncios', description: null, status: 'backlog', priority: 'high', scheduled_date: null, due_date: isoDay(addDays(now, 6)), cost_amount: 0, charged_amount: 800, created_at: created(2) },
    { id: 't12', user_id: u, project_id: 'pr4', freelancer_id: null, title: 'Manual da marca', description: null, status: 'done', priority: 'medium', scheduled_date: isoDay(subDays(now, 45)), due_date: isoDay(subDays(now, 42)), cost_amount: 0, charged_amount: 7800, created_at: created(100) },
  ]

  const calendar_events: MockDB['calendar_events'] = [
    { id: 'e1', user_id: u, title: 'Alinhamento semanal — Bento Café', event_type: 'meeting', start_time: at(now, 10), end_time: at(now, 10, 45), meeting_link: 'https://meet.google.com/', client_id: 'c2', freelancer_id: null, created_at: created(3) },
    { id: 'e2', user_id: u, title: 'Revisão do layout antes da entrega', event_type: 'review', start_time: at(now, 15, 30), end_time: at(now, 16), meeting_link: 'https://meet.google.com/', client_id: null, freelancer_id: null, created_at: created(2) },
    { id: 'e3', user_id: u, title: 'Apresentação da proposta — Clínica Vértice', event_type: 'meeting', start_time: at(addDays(now, 1), 11), end_time: at(addDays(now, 1), 12), meeting_link: 'https://meet.google.com/', client_id: 'c3', freelancer_id: null, created_at: created(2) },
    { id: 'e4', user_id: u, title: 'Entrega da landing page', event_type: 'deadline', start_time: at(addDays(now, 4), 18), end_time: null, meeting_link: null, client_id: 'c3', freelancer_id: null, created_at: created(10) },
    { id: 'e5', user_id: u, title: 'Primeira conversa — Rota Logística', event_type: 'meeting', start_time: at(addDays(now, 3), 9, 30), end_time: at(addDays(now, 3), 10, 15), meeting_link: 'https://meet.google.com/', client_id: 'c4', freelancer_id: null, created_at: created(1) },
  ]

  // Histórico de 6 meses para alimentar os gráficos de fluxo de caixa.
  const financial_transactions: FinancialTransaction[] = []
  let txId = 0
  const tx = (t: Omit<FinancialTransaction, 'id' | 'user_id' | 'created_at' | 'proof_url'>) =>
    financial_transactions.push({ ...t, id: `x${++txId}`, user_id: u, proof_url: null, created_at: toDateTime(t.due_date) })

  const history: Array<[income: number, taxes: number, tools: number]> = [
    [9800, 590, 420], [12400, 745, 380], [8600, 515, 510], [14900, 895, 460], [13200, 790, 390],
  ]
  history.forEach(([income, taxes, tools], i) => {
    const month = startOfMonth(subMonths(now, 5 - i))
    const day = (d: number) => isoDay(addDays(month, d))
    const client = ['c1', 'c2', 'c5', 'c2', 'c1'][i]
    const project = ['pr1', 'pr2', 'pr4', 'pr2', 'pr1'][i]
    tx({ type: 'income', category: 'Projeto', description: 'Parcela de projeto', amount: income, due_date: day(9), payment_date: day(10), status: 'paid', client_id: client, freelancer_id: null, project_id: project })
    tx({ type: 'expense', category: 'Impostos', description: 'Impostos e taxas do mês', amount: taxes, due_date: day(20), payment_date: day(20), status: 'paid', client_id: null, freelancer_id: null, project_id: null })
    tx({ type: 'expense', category: 'Ferramentas', description: 'Licenças e hospedagem', amount: tools, due_date: day(4), payment_date: day(4), status: 'paid', client_id: null, freelancer_id: null, project_id: null })
  })

  const thisMonth = startOfMonth(now)
  const today = isoDay(now)
  tx({ type: 'income', category: 'Projeto', description: 'Site Aurora — 1ª parcela', amount: 9250, due_date: isoDay(addDays(thisMonth, 2)), payment_date: isoDay(addDays(thisMonth, 2)), status: 'paid', client_id: 'c1', freelancer_id: null, project_id: 'pr1' })
  tx({ type: 'income', category: 'Projeto', description: 'App Bento — 2ª parcela', amount: 7333, due_date: isoDay(addDays(now, 5)), payment_date: null, status: 'pending', client_id: 'c2', freelancer_id: null, project_id: 'pr2' })
  tx({ type: 'income', category: 'Projeto', description: 'Landing page — saldo', amount: 3200, due_date: isoDay(subDays(now, 3)), payment_date: null, status: 'pending', client_id: 'c3', freelancer_id: null, project_id: 'pr3' })
  tx({ type: 'income', category: 'Projeto', description: 'Site Aurora — 2ª parcela', amount: 9250, due_date: isoDay(addDays(now, 20)), payment_date: null, status: 'pending', client_id: 'c1', freelancer_id: null, project_id: 'pr1' })
  tx({ type: 'expense', category: 'Impostos', description: 'Impostos e taxas do mês', amount: 555, due_date: isoDay(addDays(now, 3)), payment_date: null, status: 'pending', client_id: null, freelancer_id: null, project_id: null })
  tx({ type: 'expense', category: 'Ferramentas', description: 'Assinatura da ferramenta de design', amount: 120, due_date: isoDay(addDays(now, 7)), payment_date: null, status: 'pending', client_id: null, freelancer_id: null, project_id: null })
  tx({ type: 'expense', category: 'Equipamento', description: 'Teclado e mouse', amount: 380, due_date: today, payment_date: today, status: 'paid', client_id: null, freelancer_id: null, project_id: null })
  tx({ type: 'expense', category: 'Ferramentas', description: 'Licenças e hospedagem', amount: 440, due_date: isoDay(addDays(thisMonth, 4)), payment_date: isoDay(addDays(thisMonth, 4)), status: 'paid', client_id: null, freelancer_id: null, project_id: null })
  tx({ type: 'expense', category: 'Infraestrutura', description: 'Servidor do App Bento', amount: 260, due_date: isoDay(addDays(now, 9)), payment_date: null, status: 'pending', client_id: null, freelancer_id: null, project_id: 'pr2' })

  // mensalidade em andamento: 2 de 8 já recebidas
  const monthlyStart = addDays(startOfMonth(subMonths(now, 2)), 14)
  Array.from({ length: 8 }, (_, i) => {
    const due = isoDay(addMonths(monthlyStart, i))
    const paid = i < 2
    tx({ type: 'income', category: 'Mensalidade', description: 'Mensalidade — Manutenção do sistema de pedidos', amount: 650, due_date: due, payment_date: paid ? due : null, status: paid ? 'paid' : 'pending', client_id: 'c2', freelancer_id: null, project_id: null, recurrence_id: 'r1', installment: i + 1, installments: 8, contract_id: null })
  })

  const contracts: MockDB['contracts'] = [
    { id: 'k1', user_id: u, proposal_id: 'p1', client_id: 'c1', title: 'Contrato — Novo site institucional', content_markdown: '# Contrato de Prestação de Serviços\n\nContrato de exemplo gerado no modo demo. Abra o Gerador de Contratos para criar um novo a partir de uma proposta aprovada.', status: 'active', created_at: created(58) },
  ]

  const goals: MockDB['goals'] = [
    { id: 'g1', user_id: u, title: 'Faturamento do mês', target_amount: 25000, current_amount: 0, start_date: isoDay(thisMonth), end_date: isoDay(endOfMonth(now)), category: 'revenue', created_at: created(20) },
    { id: 'g2', user_id: u, title: 'Faturamento do trimestre', target_amount: 60000, current_amount: 0, start_date: isoDay(startOfQuarter(now)), end_date: isoDay(endOfQuarter(now)), category: 'revenue', created_at: created(40) },
    { id: 'g3', user_id: u, title: 'Novos clientes no trimestre', target_amount: 4, current_amount: 0, start_date: isoDay(startOfQuarter(now)), end_date: isoDay(endOfQuarter(now)), category: 'clients', created_at: created(40) },
  ]

  const profiles: MockDB['profiles'] = [
    { id: u, full_name: 'Usuário Demo', company_name: 'Demo Serviços Digitais', document: '00.000.000/0001-00', email: 'demo@meuerp.example', phone: '(11) 90000-0000', avatar_url: null, pix_key: 'demo@meuerp.example', pix_qr_image: null, created_at: created(365) },
  ]

  const quotes: MockDB['quotes'] = [
    {
      id: 'q1', user_id: u, quote_number: 1, client_id: 'c2', customer_name: null, title: 'Atualização do cadastro de clientes',
      items: [{ description: 'Organização e padronização da lista de clientes', quantity: 1, unit_price: 450 }, { description: 'Remoção de registros duplicados', quantity: 1, unit_price: 180 }],
      notes: 'Entrega em até 3 dias úteis após o pagamento.', total_amount: 630, validity_days: 7, status: 'pending', created_at: created(1),
    },
  ]

  return { profiles, clients, freelancers, proposals, quotes, projects, tasks, calendar_events, financial_transactions, contracts, goals }
}

function toDateTime(day: string) {
  return addHours(new Date(`${day}T00:00:00`), 12).toISOString()
}
