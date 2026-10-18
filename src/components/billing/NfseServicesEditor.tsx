import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@/components/ui/primitives'
import { defaultNfseServices } from '@/lib/nfse'
import type { NfseService } from '@/types/database.types'

/**
 * Catálogo de serviços da nota fiscal, no perfil. Cada serviço corresponde a
 * um CNAE do MEI e tem o seu código de serviço (tributação nacional) e o texto
 * padrão da descrição.
 */
export function NfseServicesEditor({ value, onChange }: { value: NfseService[] | null | undefined; onChange: (services: NfseService[]) => void }) {
  const services = value ?? []
  const set = (index: number, patch: Partial<NfseService>) => onChange(services.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <div className="col-span-2 space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Os serviços que você presta, um por CNAE. A nota descreve um deles. O <strong>código de tributação nacional</strong> é o mesmo que você escolhe no Emissor Nacional; dá para buscar pela tabela no próprio gerador de notas.
      </p>
      {services.length === 0 && <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-slate-400">Nenhum serviço cadastrado.</p>}
      {services.map((s, i) => (
        <div key={s.id} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <Field label={s.cnae ? `Serviço · CNAE ${s.cnae}` : 'Serviço'} className="flex-1">
              <Input value={s.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={120} />
            </Field>
            <Button variant="ghost" size="icon" aria-label={`Remover ${s.label}`} className="mt-6" onClick={() => onChange(services.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Field label="Código de tributação nacional">
            <Input value={s.code} onChange={(e) => set(i, { code: e.target.value.trim() })} placeholder="Ex.: 01.07.01" maxLength={20} />
            {!s.code && <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">Sem o código, este serviço ainda não pode ir numa nota.</span>}
          </Field>
          <Field label="Descrição padrão na nota">
            <Textarea value={s.description} onChange={(e) => set(i, { description: e.target.value })} maxLength={1000} className="min-h-[64px]" />
          </Field>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange([...services, { id: crypto.randomUUID().slice(0, 8), label: '', cnae: '', code: '', description: '' }])} disabled={services.length >= 20}>
          <Plus className="h-3.5 w-3.5" /> Serviço
        </Button>
        {services.length === 0 && (
          <Button variant="secondary" size="sm" onClick={() => onChange(defaultNfseServices)}>
            <RotateCcw className="h-3.5 w-3.5" /> Usar os serviços dos meus CNAEs
          </Button>
        )}
      </div>
    </div>
  )
}
