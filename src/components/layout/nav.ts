import {
  Briefcase,
  Handshake,
  Home,
  Calculator,
  CalendarDays,
  FilePlus,
  FileText,
  Kanban,
  QrCode,
  Radar,
  ReceiptText,
  LayoutDashboard,
  ScrollText,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** O dia a dia: o que um usuário novo precisa ver primeiro. */
export const mainNav: NavItem[] = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/atendimentos', label: 'Atendimentos', icon: Handshake },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
]

/** Cada etapa do atendimento e os números, para quem quer ir direto a uma delas. */
export const moreNav: NavItem[] = [
  { to: '/propostas', label: 'Propostas', icon: FileText },
  { to: '/projetos', label: 'Projetos', icon: Briefcase },
  { to: '/demandas', label: 'Demandas', icon: Kanban },
  { to: '/dashboard', label: 'Resumo', icon: LayoutDashboard },
  { to: '/metas', label: 'Metas & Relatórios', icon: Target },
]

export const toolsNav: NavItem[] = [
  { to: '/ferramentas/leads', label: 'Busca de Leads', icon: Radar },
  { to: '/ferramentas/calculadora', label: 'Calculadora de Preço', icon: Calculator },
  { to: '/ferramentas/orcamento', label: 'Gerador de Orçamentos', icon: QrCode },
  { to: '/ferramentas/proposta', label: 'Gerador de Propostas', icon: FilePlus },
  { to: '/ferramentas/contrato', label: 'Gerador de Contratos', icon: ScrollText },
  { to: '/ferramentas/nota-fiscal', label: 'Gerador de Notas Fiscais', icon: ReceiptText },
]
