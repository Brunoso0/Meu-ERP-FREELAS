import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { GlobalModals } from '@/components/forms/GlobalModals'
import { ConfirmDialog } from '@/components/ui/confirm'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette />
      <GlobalModals />
      <ConfirmDialog />
    </div>
  )
}
