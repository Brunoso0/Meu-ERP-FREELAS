import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeftRight, BarChart3, Banknote, Bug, LayoutDashboard, Layers, Menu, ScrollText, Users, X, type LucideIcon } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm'
import { Skeleton } from '@/components/ui/primitives'
import { useAdminStatus } from '@/lib/admin'
import { cn } from '@/lib/utils'
import { StepUp } from './parts'

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }

const main: Item[] = [
  { to: '/admin', label: 'Resumo', icon: LayoutDashboard, end: true },
  { to: '/admin/metricas', label: 'Métricas', icon: BarChart3 },
  { to: '/admin/financeiro', label: 'Financeiro', icon: Banknote },
  { to: '/admin/assinantes', label: 'Assinantes', icon: Users },
  { to: '/admin/planos', label: 'Planos', icon: Layers },
]
const system: Item[] = [
  { to: '/admin/erros', label: 'Erros do app', icon: Bug },
  { to: '/admin/registro', label: 'Registro de ações', icon: ScrollText },
]

function Row({ item }: { item: Item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors md:h-9',
          isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
        )
      }
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

/**
 * Modo administrador: o sistema troca de menu e de cara (barra escura, selo ADMIN) para mostrar a gestão do SaaS.
 * Quem não é administrador não descobre que ele existe; quem é precisa confirmar o código de duas etapas na sessão.
 */
export function AdminLayout() {
  const status = useAdminStatus()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])

  if (status.isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>
  if (status.data === 'none' || !status.data) return <p className="p-6 text-sm text-slate-500">Página não encontrada.</p>

  const nav = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">K</span>
        <span className="text-sm font-semibold tracking-tight text-white">Krono</span>
        <span className="rounded bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900">Admin</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="ml-auto rounded-md p-2 text-slate-400 hover:bg-white/10 md:hidden"><X className="h-[18px] w-[18px]" /></button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {main.map((i) => <Row key={i.to} item={i} />)}
        <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sistema</p>
        {system.map((i) => <Row key={i.to} item={i} />)}
      </nav>
      <div className="border-t border-white/10 p-2">
        <NavLink to="/" className="flex h-11 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-amber-300 hover:bg-white/5 md:h-9">
          <ArrowLeftRight className="h-[18px] w-[18px] shrink-0" /> Voltar ao meu negócio
        </NavLink>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-slate-900 md:flex">{nav}</aside>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={cn('safe-left safe-top fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-slate-900 shadow-2xl transition-transform md:hidden', open ? 'translate-x-0' : '-translate-x-full')}>{nav}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4 dark:bg-slate-900 md:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><Menu className="h-5 w-5" /></button>
          <span className="text-sm font-semibold">Modo administrador</span>
        </header>
        <main className="safe-x safe-bottom mx-auto w-full max-w-[1400px] flex-1">
          <div className="px-4 py-5 md:px-6 md:py-6">
            {status.data === 'needs_2fa' ? (
              <StepUp />
            ) : (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <Outlet />
              </Suspense>
            )}
          </div>
        </main>
      </div>
      <ConfirmDialog />
    </div>
  )
}
