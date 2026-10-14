import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Download, LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { Avatar } from '@/components/ui/primitives'
import { Tip } from '@/components/ui/overlays'
import { useTable } from '@/hooks/useData'
import { useAuth } from '@/hooks/useAuth'
import { useNarrowScreen } from '@/hooks/useMediaQuery'
import { useInstallApp } from '@/lib/pwa'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useUI } from '@/store/ui'
import { mainNav, toolsNav, type NavItem } from './nav'

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <Tip label={item.label} disabled={!collapsed}>
      {/* o Tooltip mescla className no filho direto; NavLink usa className em função, então o gatilho é a div */}
      <div>
        <NavLink
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex h-11 items-center gap-3 rounded-lg text-sm font-medium transition-colors md:h-9',
              collapsed ? 'justify-center px-0' : 'px-2.5',
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-400'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100',
            )
          }
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </NavLink>
      </div>
    </Tip>
  )
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, openModal, mobileNavOpen, setMobileNavOpen } = useUI()
  const narrow = useNarrowScreen()
  // no celular o menu é uma gaveta que abre por cima da tela, sempre com os nomes
  const collapsed = sidebarCollapsed && !narrow
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname, narrow, setMobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileNavOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen, setMobileNavOpen])
  const profile = useTable('profiles').data?.[0]
  const { signOut } = useAuth()
  const install = useInstallApp()
  const name = profile?.full_name || profile?.email || 'Usuário'

  return (
    <>
      {narrow && (
        <div
          aria-hidden
          onClick={() => setMobileNavOpen(false)}
          className={cn(
            'no-print fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200',
            mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
      )}
      <aside
        id="menu-principal"
        className={cn(
          'no-print flex shrink-0 flex-col border-r bg-white dark:bg-slate-900',
          narrow
            ? cn(
                'safe-left safe-top safe-bottom fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl transition-[transform,visibility] duration-200',
                mobileNavOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
              )
            : cn('sticky top-0 h-screen transition-[width] duration-200', collapsed ? 'w-[60px]' : 'w-60'),
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b', collapsed ? 'justify-center' : 'px-4')}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            F
          </span>
          {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">Meu ERP Freelas</span>}
          {narrow && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Fechar menu"
              className="ml-auto rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-2">
          {mainNav.map((item) => (
            <NavRow key={item.to} item={item} collapsed={collapsed} />
          ))}
          {collapsed ? (
            <div className="mx-2 my-3 border-t" />
          ) : (
            <p className="px-2.5 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ferramentas</p>
          )}
          {toolsNav.map((item) => (
            <NavRow key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="space-y-1 border-t p-2">
          {install && (
            <Tip label="Instalar app" disabled={!collapsed}>
              <button
                type="button"
                onClick={install}
                aria-label="Instalar app"
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-50 md:h-9 dark:text-brand-400 dark:hover:bg-brand-600/15',
                  collapsed ? 'justify-center' : 'px-2.5',
                )}
              >
                <Download className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && 'Instalar app'}
              </button>
            </Tip>
          )}
          <Tip label="Expandir menu" disabled={!collapsed}>
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn(
                'hidden h-9 w-full md:flex items-center gap-3 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/70',
                collapsed ? 'justify-center' : 'px-2.5',
              )}
            >
              {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
              {!collapsed && 'Recolher'}
            </button>
          </Tip>

          <div className={cn('flex items-center gap-2.5 rounded-lg p-1.5', collapsed && 'flex-col-reverse justify-center')}>
            <button
              type="button"
              title="Editar dados da empresa"
              disabled={!profile}
              onClick={() => profile && openModal({ type: 'profile', record: profile })}
              className={cn('flex min-w-0 items-center gap-2.5 rounded-md text-left', !collapsed && 'flex-1')}
            >
              <Avatar name={name} />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {profile?.company_name || (isSupabaseConfigured ? profile?.email : 'Modo demo')}
                  </p>
                </div>
              )}
            </button>
            {isSupabaseConfigured && (
              <Tip label="Sair" side="top">
                <button
                  type="button"
                  onClick={() => signOut()}
                  aria-label="Sair"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </Tip>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
