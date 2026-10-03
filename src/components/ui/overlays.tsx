import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DM from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ---------- Sheet: drawer lateral ou modal central ---------- */

export function Sheet({
  open,
  onClose,
  title,
  description,
  variant = 'drawer',
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  variant?: 'drawer' | 'modal'
  className?: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-950/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-white shadow-2xl focus:outline-none dark:bg-slate-900',
            variant === 'drawer'
              ? 'inset-y-0 right-0 w-full max-w-md animate-slide-in border-l'
              : 'left-1/2 top-1/2 max-h-[88vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-xl border',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              <Dialog.Description className={cn('mt-0.5 text-sm text-slate-500 dark:text-slate-400', !description && 'sr-only')}>
                {description ?? title}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ---------- Dropdown ---------- */

export const Dropdown = DM.Root
export const DropdownTrigger = DM.Trigger

export function DropdownContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[200px] animate-fade-in rounded-lg border bg-white p-1 shadow-lg dark:bg-slate-900',
          className,
        )}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  )
}

export function DropdownItem({
  icon: Icon,
  children,
  onSelect,
  danger,
}: {
  icon?: LucideIcon
  children: React.ReactNode
  onSelect?: () => void
  danger?: boolean
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none',
        danger
          ? 'text-red-600 data-[highlighted]:bg-red-50 dark:text-red-400 dark:data-[highlighted]:bg-red-950/50'
          : 'text-slate-700 data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800',
      )}
    >
      {Icon && <Icon className="h-4 w-4 opacity-70" />}
      {children}
    </DM.Item>
  )
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="px-2.5 py-1.5 text-xs font-medium text-slate-400">{children}</DM.Label>
}

export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-800" />

/* ---------- Tooltip ---------- */

export const TooltipProvider = Tooltip.Provider

export function Tip({
  label,
  side = 'right',
  disabled,
  children,
}: {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  disabled?: boolean
  children: React.ReactElement
}) {
  if (disabled) return children
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={8}
          className="z-50 animate-fade-in rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-md dark:bg-slate-100 dark:text-slate-900"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
