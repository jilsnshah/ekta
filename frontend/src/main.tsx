import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { LiveProvider } from './lib/live'
import { ToastProvider } from './components/toast'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live data arrives over the socket, so background refetching only has
      // to act as a safety net.
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <LiveProvider>
            <HashRouter>
              <App />
            </HashRouter>
          </LiveProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
