import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { GlobalModals } from '@/components/forms/GlobalModals'
import { PaymentChoiceDialog } from '@/components/quotes/PaymentChoice'
import { ConfirmDialog } from '@/components/ui/confirm'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="safe-x safe-bottom mx-auto w-full max-w-[1400px] flex-1">
          <div className="px-4 py-5 md:px-6 md:py-6">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <CommandPalette />
      <GlobalModals />
      <ConfirmDialog />
      <PaymentChoiceDialog />
    </div>
  )
}
