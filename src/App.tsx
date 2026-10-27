import { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { WorkspaceGate } from '@/components/layout/WorkspaceGate'
import { useAuth } from '@/hooks/useAuth'
import { useSessionGuard } from '@/hooks/useSessionGuard'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useUI } from '@/store/ui'
import { useWorkspaceStore } from '@/store/workspace'
import Login from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'
const QuickAccess = lazy(() => import('@/pages/QuickAccess'))
const Engagement = lazy(() => import('@/pages/Engagement'))
const Engagements = lazy(() => import('@/pages/Engagements'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Clients = lazy(() => import('@/pages/Clients'))
const ClientView = lazy(() => import('@/pages/ClientView'))
const Projects = lazy(() => import('@/pages/Projects'))
const Proposals = lazy(() => import('@/pages/Proposals'))
const ProposalView = lazy(() => import('@/pages/ProposalView'))
const Tasks = lazy(() => import('@/pages/Tasks'))
const Agenda = lazy(() => import('@/pages/Agenda'))
const Finance = lazy(() => import('@/pages/Finance'))
const Goals = lazy(() => import('@/pages/Goals'))
const Company = lazy(() => import('@/pages/Company'))
const BudgetCalculator = lazy(() => import('@/pages/tools/BudgetCalculator'))
const QuoteGenerator = lazy(() => import('@/pages/tools/QuoteGenerator'))
const ProposalGenerator = lazy(() => import('@/pages/tools/ProposalGenerator'))
const ContractGenerator = lazy(() => import('@/pages/tools/ContractGenerator'))
const LeadFinder = lazy(() => import('@/pages/tools/LeadFinder'))
const InvoiceGenerator = lazy(() => import('@/pages/tools/InvoiceGenerator'))
const Team = lazy(() => import('@/pages/Team'))
const AcceptInvite = lazy(() => import('@/pages/AcceptInvite'))
const PublicProposal = lazy(() => import('@/pages/PublicProposal'))
const PublicContract = lazy(() => import('@/pages/PublicContract'))

export default function App() {
  const theme = useUI((s) => s.theme)
  const { session, ready, recovering, doneRecovering } = useAuth()
  useSessionGuard(session)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // dados em cache pertencem a quem estava logado: troca de usuário começa do zero
  const queryClient = useQueryClient()
  const userId = session?.user.id
  const lastUserId = useRef(userId)
  useEffect(() => {
    // só limpa quando alguém que estava logado sai ou é trocado. Limpar na entrada
    // derrubaria as consultas que o layout acabou de abrir (menu ficaria sem perfil).
    if (lastUserId.current && lastUserId.current !== userId) {
      queryClient.clear()
      useWorkspaceStore.getState().setActive(null)
    }
    lastUserId.current = userId
  }, [userId, queryClient])

  const needsLogin = isSupabaseConfigured && (!session || recovering)
  // o link de assinatura é aberto pelo cliente, que não tem (nem precisa de) login
  const isPublicPage = useLocation().pathname.startsWith('/assinar/')

  return (
    <>
      {/* a tela de login é sempre escura: os avisos dela acompanham */}
      <Toaster theme={needsLogin ? 'dark' : theme} position="bottom-right" richColors closeButton />
      {isPublicPage ? (
        <Suspense fallback={null}>
          <Routes>
            <Route path="assinar/contrato/:token" element={<PublicContract />} />
            <Route path="assinar/:token" element={<PublicProposal />} />
          </Routes>
        </Suspense>
      ) : !ready ? (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : recovering ? (
        <ResetPassword onDone={doneRecovering} />
      ) : needsLogin ? (
        <Login />
      ) : (
        <WorkspaceGate>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<QuickAccess />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="atendimentos" element={<Engagements />} />
            <Route path="atendimentos/novo" element={<Engagement />} />
            <Route path="atendimentos/:id" element={<Engagement />} />
            <Route path="clientes" element={<Clients />} />
            <Route path="clientes/:id" element={<ClientView />} />
            <Route path="projetos" element={<Projects />} />
            <Route path="propostas" element={<Proposals />} />
            <Route path="propostas/:id" element={<ProposalView />} />
            <Route path="demandas" element={<Tasks />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="financeiro" element={<Finance />} />
            <Route path="metas" element={<Goals />} />
            <Route path="minha-empresa" element={<Company />} />
            <Route path="equipe" element={<Team />} />
            <Route path="convite/:token" element={<AcceptInvite />} />
            <Route path="ferramentas/calculadora" element={<BudgetCalculator />} />
            <Route path="ferramentas/orcamento" element={<QuoteGenerator />} />
            <Route path="ferramentas/proposta" element={<ProposalGenerator />} />
            <Route path="ferramentas/contrato" element={<ContractGenerator />} />
            <Route path="ferramentas/leads" element={<LeadFinder />} />
            <Route path="ferramentas/nota-fiscal" element={<InvoiceGenerator />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </WorkspaceGate>
      )}
    </>
  )
}
