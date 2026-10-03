import { lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/hooks/useAuth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useUI } from '@/store/ui'
import Login from '@/pages/Login'
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Clients = lazy(() => import('@/pages/Clients'))
const Freelancers = lazy(() => import('@/pages/Freelancers'))
const Projects = lazy(() => import('@/pages/Projects'))
const Proposals = lazy(() => import('@/pages/Proposals'))
const ProposalView = lazy(() => import('@/pages/ProposalView'))
const Tasks = lazy(() => import('@/pages/Tasks'))
const Agenda = lazy(() => import('@/pages/Agenda'))
const Finance = lazy(() => import('@/pages/Finance'))
const Goals = lazy(() => import('@/pages/Goals'))
const BudgetCalculator = lazy(() => import('@/pages/tools/BudgetCalculator'))
const QuoteGenerator = lazy(() => import('@/pages/tools/QuoteGenerator'))
const ProposalGenerator = lazy(() => import('@/pages/tools/ProposalGenerator'))
const ContractGenerator = lazy(() => import('@/pages/tools/ContractGenerator'))

export default function App() {
  const theme = useUI((s) => s.theme)
  const { session, ready } = useAuth()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // dados em cache pertencem a quem estava logado: troca de usuário começa do zero
  const queryClient = useQueryClient()
  const userId = session?.user.id
  useEffect(() => {
    queryClient.clear()
  }, [userId, queryClient])

  const needsLogin = isSupabaseConfigured && !session

  return (
    <>
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
      {!ready ? (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : needsLogin ? (
        <Login />
      ) : (
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="clientes" element={<Clients />} />
            <Route path="freelancers" element={<Freelancers />} />
            <Route path="projetos" element={<Projects />} />
            <Route path="propostas" element={<Proposals />} />
            <Route path="propostas/:id" element={<ProposalView />} />
            <Route path="demandas" element={<Tasks />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="financeiro" element={<Finance />} />
            <Route path="metas" element={<Goals />} />
            <Route path="ferramentas/calculadora" element={<BudgetCalculator />} />
            <Route path="ferramentas/orcamento" element={<QuoteGenerator />} />
            <Route path="ferramentas/proposta" element={<ProposalGenerator />} />
            <Route path="ferramentas/contrato" element={<ContractGenerator />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </>
  )
}
