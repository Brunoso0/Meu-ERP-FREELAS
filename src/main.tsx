import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/overlays'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { installErrorReporting, reportQueryError } from '@/lib/errors'
import { registerServiceWorker } from '@/lib/pwa'
import { APP_BASE } from '@/lib/app-base'
import App from './App'
import './index.css'

registerServiceWorker()
installErrorReporting()

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => reportQueryError(error, 'consulta', query.queryKey) }),
  mutationCache: new MutationCache({ onError: (error) => reportQueryError(error, 'acao') }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <BrowserRouter basename={APP_BASE}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
