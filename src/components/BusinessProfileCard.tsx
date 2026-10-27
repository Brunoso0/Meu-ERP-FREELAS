import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select } from '@/components/ui/primitives'
import { MY_WORKSPACES_KEY, useActiveWorkspace } from '@/hooks/useWorkspace'
import { businessTypeLabel, saveBusinessProfile, teamSizeLabel } from '@/lib/workspace'
import type { BusinessType, TeamSize } from '@/types/database.types'

/** Perfil do negócio (as respostas da entrevista), editável por dono e administradores. */
export function BusinessProfileCard() {
  const { workspace, can } = useActiveWorkspace()
  const qc = useQueryClient()
  const [type, setType] = useState<BusinessType | ''>('')
  const [team, setTeam] = useState<TeamSize | ''>('')
  const [segment, setSegment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setType(workspace?.business_type ?? '')
    setTeam(workspace?.team_size ?? '')
    setSegment(workspace?.segment ?? '')
  }, [workspace?.id, workspace?.business_type, workspace?.team_size, workspace?.segment])

  if (!workspace) return null
  const editable = can('admin')
  const dirty = type !== (workspace.business_type ?? '') || team !== (workspace.team_size ?? '') || segment !== (workspace.segment ?? '')

  async function save() {
    if (!workspace || !type || !team) return
    setBusy(true)
    await saveBusinessProfile(workspace.id, { business_type: type, team_size: team, segment }, !workspace.onboarded_at)
      .then(() => qc.invalidateQueries({ queryKey: MY_WORKSPACES_KEY }))
      .then(() => toast.success('Perfil do negócio salvo'))
      .catch((e) => toast.error('Não foi possível salvar', { description: e instanceof Error ? e.message : undefined }))
      .finally(() => setBusy(false))
  }

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-base font-semibold">Perfil do negócio</h2>
      <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">Como a empresa atua. Usamos isso para adaptar o sistema e, em breve, os planos.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tipo de empresa">
          <Select value={type} onChange={(e) => setType(e.target.value as BusinessType)} disabled={!editable}>
            <option value="" disabled>Selecione</option>
            {(Object.keys(businessTypeLabel) as BusinessType[]).map((t) => <option key={t} value={t}>{businessTypeLabel[t]}</option>)}
          </Select>
        </Field>
        <Field label="Equipe">
          <Select value={team} onChange={(e) => setTeam(e.target.value as TeamSize)} disabled={!editable}>
            <option value="" disabled>Selecione</option>
            {(Object.keys(teamSizeLabel) as TeamSize[]).map((t) => <option key={t} value={t}>{teamSizeLabel[t]}</option>)}
          </Select>
        </Field>
        <Field label="O que você faz">
          <Input value={segment} onChange={(e) => setSegment(e.target.value)} maxLength={80} disabled={!editable} placeholder="Ex.: sites e sistemas" />
        </Field>
      </div>
      {editable && (
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={busy} disabled={!dirty || !type || !team}>Salvar perfil</Button>
        </div>
      )}
    </Card>
  )
}
