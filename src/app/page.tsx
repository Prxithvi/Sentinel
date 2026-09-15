'use client'

import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { useLang } from '@/hooks/use-lang'
import { AuthView } from '@/components/views/auth-view'
import { DashboardView } from '@/components/views/dashboard-view'
import { MapView } from '@/components/views/map-view'
import { GraphView } from '@/components/views/graph-view'
import { CasesView } from '@/components/views/cases-view'
import { CaseDetailView } from '@/components/views/case-detail-view'
import { AdminConfigView, ModelMetricsView, BlacklistView } from '@/components/views/admin-views'
import { TransparencyView, LeaderboardView, CitizenReportView, FieldVerificationView, SystemHealthView } from '@/components/views/public-views'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard, Map as MapIcon, Network, FolderKanban, Trophy, Globe, Flag, ClipboardCheck,
  Sliders, BarChart3, Ban, HeartPulse, LogOut, ShieldCheck, Languages,
} from 'lucide-react'

type ViewKey =
  | 'dashboard' | 'map' | 'graph' | 'cases' | 'caseDetail'
  | 'leaderboard' | 'transparency' | 'report' | 'field'
  | 'adminConfig' | 'adminMetrics' | 'adminBlacklist'
  | 'health'

const NAV: { key: ViewKey; labelKey: any; icon: React.ReactNode; roles?: string[]; isPublic?: boolean }[] = [
  { key: 'dashboard', labelKey: 'nav_dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'map', labelKey: 'nav_map', icon: <MapIcon className="w-4 h-4" /> },
  { key: 'graph', labelKey: 'nav_graph', icon: <Network className="w-4 h-4" /> },
  { key: 'cases', labelKey: 'nav_cases', icon: <FolderKanban className="w-4 h-4" /> },
  { key: 'leaderboard', labelKey: 'nav_leaderboard', icon: <Trophy className="w-4 h-4" />, isPublic: true },
  { key: 'transparency', labelKey: 'nav_transparency', icon: <Globe className="w-4 h-4" />, isPublic: true },
  { key: 'report', labelKey: 'nav_report', icon: <Flag className="w-4 h-4" />, isPublic: true },
  { key: 'field', labelKey: 'nav_field', icon: <ClipboardCheck className="w-4 h-4" />, roles: ['auditor', 'admin', 'analyst'] },
  { key: 'adminConfig', labelKey: 'nav_adminConfig', icon: <Sliders className="w-4 h-4" />, roles: ['admin'] },
  { key: 'adminMetrics', labelKey: 'nav_adminMetrics', icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'adminBlacklist', labelKey: 'nav_adminBlacklist', icon: <Ban className="w-4 h-4" />, roles: ['admin', 'analyst'] },
  { key: 'health', labelKey: 'nav_health', icon: <HeartPulse className="w-4 h-4" /> },
]

function Shell() {
  const { user, loading, logout } = useAuth()
  const { lang, setLanguage, tr } = useLang()
  const [view, setView] = useState<ViewKey>('dashboard')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ShieldCheck className="w-12 h-12 text-emerald-600 animate-pulse" />
      </div>
    )
  }

  if (!user) {
    return <AuthView onLoginSuccess={() => setView('dashboard')} />
  }

  const visibleNav = NAV.filter(n => !n.roles || n.roles.includes(user.role))

  const openCase = (id: string) => {
    setSelectedCaseId(id)
    setView('caseDetail')
  }

  const openWork = (id: string) => {
    setSelectedWorkId(id)
    // For simplicity, open as a case if exists, otherwise show on cases view
    setView('cases')
  }

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <DashboardView onOpenWork={openWork} />
      case 'map': return <MapView onStateClick={() => setView('dashboard')} />
      case 'graph': return <GraphView />
      case 'cases': return <CasesView onOpenCase={openCase} />
      case 'caseDetail': return selectedCaseId ? <CaseDetailView caseId={selectedCaseId} onBack={() => setView('cases')} /> : null
      case 'leaderboard': return <LeaderboardView />
      case 'transparency': return <TransparencyView />
      case 'report': return <CitizenReportView />
      case 'field': return <FieldVerificationView />
      case 'adminConfig': return user.role === 'admin' ? <AdminConfigView /> : <NoAccess />
      case 'adminMetrics': return <ModelMetricsView />
      case 'adminBlacklist': return ['admin', 'analyst'].includes(user.role) ? <BlacklistView /> : <NoAccess />
      case 'health': return <SystemHealthView />
      default: return null
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
              <LayoutDashboard className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 leading-tight">MPLAD Sentinel</div>
                <div className="text-[10px] text-muted-foreground">SIH26102 — Fraud Detection Platform</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLanguage(lang === 'en' ? 'hi' : 'en')}>
              <Languages className="w-4 h-4 mr-1" /> {lang === 'en' ? 'EN' : 'हि'}
            </Button>
            <Badge variant="outline" className="hidden md:inline-flex">
              <span className="text-[10px] text-muted-foreground mr-1">{user.role}</span>
              {user.name}
            </Badge>
            <Button variant="ghost" size="sm" onClick={async () => { await logout(); setView('dashboard') }}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className={`${mobileNavOpen ? 'block' : 'hidden'} lg:block w-56 bg-white border-r border-slate-200 overflow-y-auto`}>
          <nav className="p-2 space-y-0.5">
            {visibleNav.map(n => (
              <button key={n.key} onClick={() => { setView(n.key); setMobileNavOpen(false) }}
                className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-2 transition ${
                  view === n.key || (view === 'caseDetail' && n.key === 'cases')
                    ? 'bg-emerald-100 text-emerald-800 font-medium'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}>
                {n.icon}
                <span className="truncate">{tr(n.labelKey)}</span>
                {n.isPublic && <Globe className="w-3 h-3 ml-auto text-muted-foreground" />}
              </button>
            ))}
          </nav>
          <div className="p-3 mt-2 border-t border-slate-200 text-[10px] text-muted-foreground">
            <div className="font-semibold mb-1">Demo data</div>
            <div>250 synthetic works • 69 vendors • 12 states • 4 years</div>
            <div className="mt-2 font-semibold mb-1">Built with</div>
            <div>Next.js 16 • Prisma • Recharts • Socket.IO</div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-x-auto p-4 lg:p-6">
          {renderView()}
        </main>
      </div>

      {/* Footer */}
      <footer className="mt-auto bg-white border-t border-slate-200 py-2 px-4 text-center text-xs text-muted-foreground">
        {tr('footer_note')}
      </footer>
    </div>
  )
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Ban className="w-12 h-12 text-red-500 mb-2" />
      <h2 className="text-lg font-bold">Access restricted</h2>
      <p className="text-sm text-muted-foreground">Your role doesn't have access to this view.</p>
    </div>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
