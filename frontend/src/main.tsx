import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './App'
import { AuthProvider } from './auth/AuthProvider'
import './index.css'
import { reloadForNewVersion } from './lib/staleBuild'
import { ThemeProvider } from './theme/ThemeProvider'

// A deploy removed files this tab was built with: load the new version instead of failing.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
)
