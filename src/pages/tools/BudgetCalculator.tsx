import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Field, Input, PageHeader } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { formatCurrency } from '@/lib/utils'
import type { ProposalItem } from '@/types/database.types'

interface Line {
  id: number
  name: string
  hours: number
  rate: number
}

const num = (value: string) => Math.max(0, Number(value.replace(',', '.')) || 0)

export interface CalculatorPrefill {
  items: ProposalItem[]
}

export default function BudgetCalculator() {
  const navigate = useNavigate()
  const freelancers = useTable('freelancers').data ?? []
  const [lines, setLines] = useState<Line[]>([{ id: 1, name: '', hours: 20, rate: 80 }])
  const [managerHours, setManagerHours] = useState(10)
  const [managerRate, setManagerRate] = useState(120)
  const [infra, setInfra] = useState(200)
  const [taxPct, setTaxPct] = useState(6)
  const [marginPct, setMarginPct] = useState(60)

  const setLine = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const calc = useMemo(() => {
    const freelancersCost = lines.reduce((acc, l) => acc + l.hours * l.rate, 0)
    const managerCost = managerHours * managerRate
    const cost = freelancersCost + managerCost + infra
    const withMargin = cost * (1 + marginPct / 100)
    // o imposto incide sobre o valor da nota, então é calculado "por dentro"
    const rate = Math.min(taxPct, 95) / 100
    const price = withMargin / (1 - rate)
    return { freelancersCost, managerCost, cost, profit: withMargin - cost, taxes: price - withMargin, price }
  }, [lines, managerHours, managerRate, infra, taxPct, marginPct])

  const convert = () => {
    // rateia margem e impostos nos itens para a soma fechar com o valor final
    const factor = calc.cost > 0 ? calc.price / calc.cost : 1
    const round = (n: number) => Math.round(n * factor * 100) / 100
    const items: ProposalItem[] = [
      ...lines.filter((l) => l.hours * l.rate > 0).map((l) => ({ description: l.name.trim() || 'Execução', quantity: 1, unit_price: round(l.hours * l.rate) })),
      ...(calc.managerCost > 0 ? [{ description: 'Gestão do projeto', quantity: 1, unit_price: round(calc.managerCost) }] : []),
      ...(infra > 0 ? [{ description: 'Infraestrutura e licenças', quantity: 1, unit_price: round(infra) }] : []),
    ]
    const prefill: CalculatorPrefill = { items }
    navigate('/ferramentas/proposta', { state: { prefill } })
  }

  const rows: Array<[string, number]> = [
    ['Freelancers', calc.freelancersCost],
    ['Horas do gestor', calc.managerCost],
    ['Infra e licenças', infra],
  ]

  return (
    <>
      <PageHeader title="Calculadora de orçamento" description="Some os custos, escolha a margem e veja quanto cobrar." />
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Custo de freelancers</h2>
              <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { id: Date.now(), name: '', hours: 0, rate: 0 }])}>
                <Plus className="h-3.5 w-3.5" /> Adicionar linha
              </Button>
            </div>
            <datalist id="freelancer-names">
              {freelancers.map((f) => (
                <option key={f.id} value={f.specialty ? `${f.name} — ${f.specialty}` : f.name} />
              ))}
            </datalist>
            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.id} className="grid grid-cols-12 items-end gap-2">
                  <Field label="Quem / o quê" className="col-span-12 sm:col-span-5">
                    <Input
                      list="freelancer-names"
                      value={line.name}
                      placeholder="Ex.: Front-end"
                      onChange={(e) => {
                        const name = e.target.value
                        const match = freelancers.find((f) => name.startsWith(f.name))
                        // escolher um freelancer cadastrado já traz o custo/hora dele
                        setLine(line.id, match?.cost_per_hour ? { name, rate: Number(match.cost_per_hour) } : { name })
                      }}
                    />
                  </Field>
                  <Field label="Horas" className="col-span-4 sm:col-span-2">
                    <Input type="number" min={0} value={line.hours} onChange={(e) => setLine(line.id, { hours: num(e.target.value) })} />
                  </Field>
                  <Field label="R$/hora" className="col-span-4 sm:col-span-2">
                    <Input type="number" min={0} value={line.rate} onChange={(e) => setLine(line.id, { rate: num(e.target.value) })} />
                  </Field>
                  <div className="col-span-4 flex items-center justify-end gap-1 sm:col-span-3">
                    <span className="tabular text-sm font-medium">{formatCurrency(line.hours * line.rate)}</span>
                    <Button variant="ghost" size="icon" aria-label="Remover linha" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((l) => l.id !== line.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Horas do gestor">
              <Input type="number" min={0} value={managerHours} onChange={(e) => setManagerHours(num(e.target.value))} />
            </Field>
            <Field label="Valor da hora do gestor (R$)">
              <Input type="number" min={0} value={managerRate} onChange={(e) => setManagerRate(num(e.target.value))} />
            </Field>
            <Field label="Infra e licenças (R$)">
              <Input type="number" min={0} value={infra} onChange={(e) => setInfra(num(e.target.value))} />
            </Field>
            <Field label="Impostos sobre a nota (%)">
              <Input type="number" min={0} max={95} step="0.5" value={taxPct} onChange={(e) => setTaxPct(Math.min(95, num(e.target.value)))} />
            </Field>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <label htmlFor="margin" className="text-sm font-semibold">
                Margem de lucro desejada
              </label>
              <span className="tabular text-lg font-semibold text-brand-600 dark:text-brand-400">{marginPct}%</span>
            </div>
            <input
              id="margin"
              type="range"
              min={20}
              max={200}
              step={5}
              value={marginPct}
              onChange={(e) => setMarginPct(Number(e.target.value))}
              className="mt-4 w-full accent-brand-600"
            />
            <div className="tabular mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>20%</span>
              <span>200%</span>
            </div>
          </Card>
        </div>

        <Card className="p-5 lg:sticky lg:top-20 lg:col-span-2">
          <h2 className="text-sm font-semibold">Resultado</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="tabular">{formatCurrency(value)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2.5 font-medium">
              <dt>Custo total</dt>
              <dd className="tabular">{formatCurrency(calc.cost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Lucro ({marginPct}%)</dt>
              <dd className="tabular text-emerald-600 dark:text-emerald-400">+ {formatCurrency(calc.profit)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Impostos ({taxPct}%)</dt>
              <dd className="tabular">+ {formatCurrency(calc.taxes)}</dd>
            </div>
          </dl>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Valor final do projeto</p>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{formatCurrency(calc.price)}</p>
          </div>
          <Button className="mt-5 w-full" disabled={calc.cost <= 0} onClick={convert}>
            Converter em proposta <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      </div>
    </>
  )
}
