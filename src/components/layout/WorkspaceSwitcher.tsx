import { Link } from 'react-router-dom'
import { Building2, Check, ChevronsUpDown, Users } from 'lucide-react'
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { roleLabel } from '@/lib/workspace'
import { cn } from '@/lib/utils'

/** Seletor de workspace no topo do menu: troca de empresa e leva à tela de equipe. */
export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspace, role, all, switchTo } = useActiveWorkspace()
  if (!workspace) return null

  return (
    <div className="border-b p-2">
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label="Trocar de empresa"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800/70',
              collapsed && 'justify-center px-0',
            )}
          >
            <Building2 className="h-[18px] w-[18px] shrink-0 text-slate-500" />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{workspace.name}</span>
                  {role && <span className="block text-[11px] text-slate-400">{roleLabel[role]}</span>}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
              </>
            )}
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" className="w-64">
          <DropdownLabel>Suas empresas</DropdownLabel>
          {all.map((m) => (
            <DropdownItem key={m.workspace.id} icon={m.workspace.id === workspace.id ? Check : undefined} onSelect={() => switchTo(m.workspace.id)}>
              <span className="min-w-0 flex-1 truncate">{m.workspace.name}</span>
              <span className="text-[11px] text-slate-400">{roleLabel[m.role]}</span>
            </DropdownItem>
          ))}
          <DropdownSeparator />
          <Link to="/equipe" className="block">
            <DropdownItem icon={Users}>Equipe e convites</DropdownItem>
          </Link>
        </DropdownContent>
      </Dropdown>
    </div>
  )
}
