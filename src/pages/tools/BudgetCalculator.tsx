import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Field, Input, PageHeader } from '@/components/ui/primitives'
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

/** Preço de um trabalho a partir das suas horas: atividades, custos, impostos e margem. */
export default function BudgetCalculator() {
  const navigate = useNavigate()
  const [lines, setLines] = useState<Line[]>([{ id: 1, name: '', hours: 20, rate: 80 }])
  const [infra, setInfra] = useState(0)
  const [taxPct, setTaxPct] = useState(6)
  const [marginPct, setMarginPct] = useState(20)

  const setLine = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  // nova atividade herda o valor/hora da anterior: quase sempre é o mesmo
  const addLine = () => setLines((ls) => [...ls, { id: Date.now(), name: '', hours: 0, rate: ls[ls.length - 1]?.rate ?? 0 }])

  const calc = useMemo(() => {
    const hours = lines.reduce((acc, l) => acc + l.hours, 0)
    const work = lines.reduce((acc, l) => acc + l.hours * l.rate, 0)
    const cost = work + infra
    const withMargin = cost * (1 + marginPct / 100)
    // o imposto incide sobre o valor da nota, então é calculado "por dentro"
    const rate = Math.min(taxPct, 95) / 100
    const price = withMargin / (1 - rate)
    return { hours, work, cost, profit: withMargin - cost, taxes: price - withMargin, price, perHour: hours > 0 ? (price - infra - (price - withMargin)) / hours : 0 }
  }, [lines, infra, taxPct, marginPct])

  const convert = () => {
    // rateia margem e impostos nos itens para a soma fechar com o valor final
    const factor = calc.cost > 0 ? calc.price / calc.cost : 1
    const round = (n: number) => Math.round(n * factor * 100) / 100
    const items: ProposalItem[] = [
      ...lines.filter((l) => l.hours * l.rate > 0).map((l) => ({ description: l.name.trim() || 'Execução do serviço', quantity: 1, unit_price: round(l.hours * l.rate) })),
      ...(infra > 0 ? [{ description: 'Ferramentas e licenças', quantity: 1, unit_price: round(infra) }] : []),
    ]
    const prefill: CalculatorPrefill = { items }
    navigate('/ferramentas/proposta', { state: { prefill } })
  }

  return (
    <>
      <PageHeader title="Calculadora de preço" description="Some suas horas e custos, escolha a margem e veja quanto cobrar." />
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Suas horas de trabalho</h2>
              <Button variant="secondary" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" /> Adicionar atividade
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.id} className="grid grid-cols-12 items-end gap-2">
                  <Field label="Atividade" className="col-span-12 sm:col-span-5">
                    <Input value={line.name} placeholder="Ex.: Atualização dos cadastros" onChange={(e) => setLine(line.id, { name: e.target.value })} />
                  </Field>
                  <Field label="Horas" className="col-span-4 sm:col-span-2">
                    <Input type="number" min={0} value={line.hours} onChange={(e) => setLine(line.id, { hours: num(e.target.value) })} />
                  </Field>
                  <Field label="R$/hora" className="col-span-4 sm:col-span-2">
                    <Input type="number" min={0} value={line.rate} onChange={(e) => setLine(line.id, { rate: num(e.target.value) })} />
                  </Field>
                  <div className="col-span-4 flex items-center justify-end gap-1 sm:col-span-3">
                    <span className="tabular text-sm font-medium">{formatCurrency(line.hours * line.rate)}</span>
                    <Button variant="ghost" size="icon" aria-label="Remover atividade" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((l) => l.id !== line.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Ferramentas e licenças do trabalho (R$)">
              <Input type="number" min={0} value={infra} onChange={(e) => setInfra(num(e.target.value))} />
            </Field>
            <Field label="Impostos sobre a nota (%)">
              <Input type="number" min={0} max={95} step="0.5" value={taxPct} onChange={(e) => setTaxPct(Math.min(95, num(e.target.value)))} />
            </Field>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <label htmlFor="margin" className="text-sm font-semibold">
                Margem sobre o custo
              </label>
              <span className="tabular text-lg font-semibold text-brand-600 dark:text-brand-400">{marginPct}%</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Folga para imprevistos, ajustes e períodos sem trabalho, além do valor da sua hora.</p>
            <input
              id="margin"
              type="range"
              min={0}
              max={200}
              step={5}
              value={marginPct}
              onChange={(e) => setMarginPct(Number(e.target.value))}
              className="mt-4 w-full accent-brand-600"
            />
            <div className="tabular mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>0%</span>
              <span>200%</span>
            </div>
          </Card>
        </div>

        <Card className="p-5 lg:sticky lg:top-20 lg:col-span-2">
          <h2 className="text-sm font-semibold">Resultado</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Suas horas ({calc.hours}h)</dt>
              <dd className="tabular">{formatCurrency(calc.work)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Ferramentas e licenças</dt>
              <dd className="tabular">{formatCurrency(infra)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2.5 font-medium">
              <dt>Custo total</dt>
              <dd className="tabular">{formatCurrency(calc.cost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Margem ({marginPct}%)</dt>
              <dd className="tabular text-emerald-600 dark:text-emerald-400">+ {formatCurrency(calc.profit)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Impostos ({taxPct}%)</dt>
              <dd className="tabular">+ {formatCurrency(calc.taxes)}</dd>
            </div>
          </dl>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Valor a cobrar</p>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{formatCurrency(calc.price)}</p>
            {calc.hours > 0 && (
              <p className="tabular mt-1 text-xs text-slate-500 dark:text-slate-400">
                Sobra para você {formatCurrency(calc.perHour)} por hora, já descontados impostos e ferramentas.
              </p>
            )}
          </div>
          <Button className="mt-5 w-full" disabled={calc.cost <= 0} onClick={convert}>
            Converter em proposta <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      </div>
    </>
  )
}
