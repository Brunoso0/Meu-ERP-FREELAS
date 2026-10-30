import type { UseFormReturn } from 'react-hook-form'
import { Field, Input, Select } from '@/components/ui/primitives'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { businessTypeLabel, teamSizeLabel } from '@/lib/workspace'
import type { BusinessType, TeamSize, Workspace } from '@/types/database.types'

/** Campos do perfil do negócio dentro do formulário de Minha empresa (ficam fora do schema do perfil). */
export const BUSINESS_KEYS = ['business_type', 'team_size', 'segment'] as const

export const businessValues = (w: Workspace | null | undefined) => ({
  business_type: w?.business_type ?? '',
  team_size: w?.team_size ?? '',
  segment: w?.segment ?? '',
})

/**
 * Perfil do negócio (as respostas da entrevista): um bloco como os demais de "Dados da empresa".
 * Entra no mesmo formulário e é gravado junto, pelo mesmo "Salvar alterações".
 */
export function BusinessProfileFields({ form }: { form: UseFormReturn<Record<string, any>> }) {
  const { can } = useActiveWorkspace()
  const editable = can('admin')
  const set = (name: (typeof BUSINESS_KEYS)[number], value: string) => form.setValue(name, value, { shouldDirty: true })
  const v = form.watch()

  return (
    <section className="grid gap-4 p-5 lg:grid-cols-[200px_1fr] lg:gap-8">
      <div>
        <h3 className="text-sm font-semibold">Perfil do negócio</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Como a empresa atua. Usamos isso para adaptar o sistema ao seu jeito de trabalhar.</p>
      </div>
      <div className="grid grid-cols-2 content-start gap-4">
        <Field label="Tipo de empresa" className="col-span-2 sm:col-span-1">
          <Select value={v.business_type ?? ''} onChange={(e) => set('business_type', e.target.value as BusinessType)} disabled={!editable}>
            <option value="" disabled>Selecione</option>
            {(Object.keys(businessTypeLabel) as BusinessType[]).map((t) => <option key={t} value={t}>{businessTypeLabel[t]}</option>)}
          </Select>
        </Field>
        <Field label="Equipe" className="col-span-2 sm:col-span-1">
          <Select value={v.team_size ?? ''} onChange={(e) => set('team_size', e.target.value as TeamSize)} disabled={!editable}>
            <option value="" disabled>Selecione</option>
            {(Object.keys(teamSizeLabel) as TeamSize[]).map((t) => <option key={t} value={t}>{teamSizeLabel[t]}</option>)}
          </Select>
        </Field>
        <Field label="O que você faz" className="col-span-2">
          <Input value={v.segment ?? ''} onChange={(e) => set('segment', e.target.value)} maxLength={80} disabled={!editable} placeholder="Ex.: sites e sistemas" />
        </Field>
      </div>
    </section>
  )
}
