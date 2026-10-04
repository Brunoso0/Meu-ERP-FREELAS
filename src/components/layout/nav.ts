import {
  Briefcase,
  Calculator,
  CalendarDays,
  FilePlus,
  FileText,
  Kanban,
  QrCode,
  Radar,
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

export const mainNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/propostas', label: 'Propostas', icon: FileText },
  { to: '/projetos', label: 'Projetos', icon: Briefcase },
  { to: '/demandas', label: 'Demandas', icon: Kanban },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/metas', label: 'Metas & Relatórios', icon: Target },
]

export const toolsNav: NavItem[] = [
  { to: '/ferramentas/leads', label: 'Busca de Leads', icon: Radar },
  { to: '/ferramentas/calculadora', label: 'Calculadora de Preço', icon: Calculator },
  { to: '/ferramentas/orcamento', label: 'Gerador de Orçamentos', icon: QrCode },
  { to: '/ferramentas/proposta', label: 'Gerador de Propostas', icon: FilePlus },
  { to: '/ferramentas/contrato', label: 'Gerador de Contratos', icon: ScrollText },
]
