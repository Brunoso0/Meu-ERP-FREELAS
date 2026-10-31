import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip, useChartTheme } from '@/components/charts/theme'
import { Card, PageHeader } from '@/components/ui/primitives'
import { adminMetrics } from '@/lib/admin'
import { formatDate } from '@/lib/utils'
import { businessLabel, Distribution, Loaded, Stat } from '@/components/admin/parts'

const teamLabel: Record<string, string> = { solo: 'Sozinho', '2-5': '2 a 5 pessoas', '6-15': '6 a 15', '16+': '16 ou mais' }
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

export default function Metrics() {
  const q = useQuery({ queryKey: ['admin', 'metrics'], queryFn: adminMetrics, retry: false })
  const theme = useChartTheme()
  return (
    <div>
      <PageHeader title="Métricas" description="Crescimento, ativação e quem são os seus usuários." />
      <Loaded query={q}>
        {(d) => {
          const f = d.funnel
          const steps = [
            { label: 'Cadastraram', n: f.signups },
            { label: 'Cadastraram um cliente', n: f.with_client },
            { label: 'Criaram uma proposta', n: f.with_proposal },
            { label: 'Pagam o plano', n: f.paying },
          ]
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Contas" value={d.users} />
                <Stat label="Ativos em 7 dias" value={d.active_7d} hint={pct(d.active_7d, d.users) + ' das contas'} />
                <Stat label="Ativos em 30 dias" value={d.active_30d} hint={pct(d.active_30d, d.users) + ' das contas'} />
                <Stat label="Cancelamentos em 30 dias" value={d.canceled_30d} />
              </div>
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Cadastros por semana</h2>
                {d.signups_week.length === 0 ? <p className="text-sm text-slate-500">Nenhum cadastro nas últimas 12 semanas.</p> : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.signups_week.map((s) => ({ semana: formatDate(s.week, 'dd/MM'), Cadastros: s.n }))}>
                        <CartesianGrid stroke={theme.grid} vertical={false} />
                        <XAxis dataKey="semana" stroke={theme.axis} fontSize={12} tickLine={false} />
                        <YAxis stroke={theme.axis} fontSize={12} tickLine={false} allowDecimals={false} width={28} />
                        <Tooltip cursor={{ fill: theme.cursor }} content={<ChartTooltip format={(v) => String(v)} />} />
                        <Bar dataKey="Cadastros" fill={theme.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Funil de ativação</h2>
                <ul className="space-y-3">
                  {steps.map((s, i) => (
                    <li key={s.label} className="text-sm">
                      <div className="mb-1 flex justify-between"><span>{s.label}</span><span className="tabular-nums text-slate-500">{s.n} {i > 0 && `· ${pct(s.n, steps[0].n)}`}</span></div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${steps[0].n ? (s.n / steps[0].n) * 100 : 0}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </Card>
              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">Como conheceram o Krono</h2><Distribution data={d.by_source} /></Card>
                <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">Tipo de negócio</h2><Distribution data={d.by_business_type} labels={businessLabel} /></Card>
                <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">Tamanho da equipe</h2><Distribution data={d.by_team_size} labels={teamLabel} /></Card>
                <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">Estados</h2><Distribution data={d.by_state} /></Card>
              </div>
            </div>
          )
        }}
      </Loaded>
    </div>
  )
}
