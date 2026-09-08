import { StrictMode, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import { ThemeProvider } from './components/layout/ThemeProvider'
import { ToastProvider } from './components/layout/ToastProvider'
import './index.css'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './stores/authStore'

function Bootstrap() {
  const hydrate = useAuthStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
        <ToastProvider />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Bootstrap />
    </BrowserRouter>
  </StrictMode>,
)
