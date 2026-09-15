// Cases view — Kanban board
'use client'
import { useState } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLang } from '@/hooks/use-lang'
import { Loader2, FolderKanban } from 'lucide-react'

interface CaseSummary {
  id: string; caseId: string; status: string; priority: string; createdAt: string
  workId: string; workTitle: string; stateName: string; districtName: string
  vendorName: string; riskTier: string; ensembleScore: number; blacklistMatch: boolean; auditCount: number
}

const COLUMNS = [
  { key: 'open', label: 'Open', color: '#0891b2' },
  { key: 'investigating', label: 'Investigating', color: '#ca8a04' },
  { key: 'escalated', label: 'Escalated', color: '#dc2626' },
  { key: 'resolved', label: 'Resolved', color: '#16a34a' },
  { key: 'closed', label: 'Closed', color: '#64748b' },
]

export function CasesView({ onOpenCase }: { onOpenCase: (caseId: string) => void }) {
  const { tr } = useLang()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const res = await fetch('/api/cases')
    const data = await res.json()
    setCases(data.cases || [])
    setLoading(false)
  }

  useAsyncEffect(async () => { await refresh() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FolderKanban className="w-6 h-6" /> {tr('nav_cases')}</h1>
          <p className="text-sm text-muted-foreground">{cases.length} cases • auto-created on critical flags</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map(col => {
          const colCases = cases.filter(c => c.status === col.key)
          return (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-md" style={{ background: col.color + '15' }}>
                <div className="w-2 h-6 rounded" style={{ background: col.color }} />
                <span className="text-sm font-semibold" style={{ color: col.color }}>{tr(`case_${col.key}` as 'case_open')}</span>
                <Badge variant="secondary" className="text-xs ml-auto">{colCases.length}</Badge>
              </div>
              <ScrollArea className="max-h-[600px]">
                <div className="space-y-2">
                  {colCases.map(c => (
                    <Card key={c.id} className="cursor-pointer hover:shadow-md transition" onClick={() => onOpenCase(c.id)}>
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold">{c.caseId}</span>
                          <Badge variant="outline" className="text-[9px]">{c.priority}</Badge>
                        </div>
                        <div className="text-xs font-medium line-clamp-2">{c.workTitle}</div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span>{c.stateName}</span>
                          <span>•</span>
                          <span>{c.vendorName || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <Badge style={{
                            background: c.riskTier === 'critical' ? '#dc2626' : c.riskTier === 'high' ? '#ea580c' : '#16a34a',
                            color: 'white'
                          }} className="text-[9px]">
                            {c.riskTier || '—'}
                          </Badge>
                          {c.blacklistMatch && (
                            <Badge className="bg-red-700 text-white text-[9px]">BL</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">{c.auditCount} audit</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {colCases.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded">
                      No cases
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )
        })}
      </div>
    </div>
  )
}
