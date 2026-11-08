import { House } from 'lucide-react'
import { Route, Routes } from 'react-router'

import { HomePage } from '@/pages/home'
import { AppShell } from '@/shared/ui/app-shell'
import { EnvironmentBadge } from '@/shared/ui/environment-badge'

export function App() {
  return (
    <AppShell
      title="<AppName>"
      header={<EnvironmentBadge />}
      navigation={[{ to: '/', label: 'Home', icon: House, end: true }]}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </AppShell>
  )
}
