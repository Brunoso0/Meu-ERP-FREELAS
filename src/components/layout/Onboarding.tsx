import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button, Field, Input } from '@/components/ui/primitives'
import { MY_WORKSPACES_KEY } from '@/hooks/useWorkspace'
import { businessTypeLabel, saveBusinessProfile, teamSizeLabel } from '@/lib/workspace'
import { cn, isValidCpfCnpj, maskCep, maskCpfCnpj, maskPhone } from '@/lib/utils'
import type { AcquisitionSource, BusinessType, TeamSize, Workspace } from '@/types/database.types'

const TYPE_HINT: Record<BusinessType, string> = {
  mei: 'Microempreendedor Individual',
  me: 'Microempresa, com CNPJ próprio',
  epp: 'Empresa de Pequeno Porte',
  outra_pj: 'Ltda, SLU, EIRELI ou outra',
  pf: 'Ainda atuo sem CNPJ',
}

const SOURCES: Record<AcquisitionSource, string> = {
  instagram: 'Instagram',
  indicacao: 'Indicação de alguém',
  google: 'Pesquisa no Google',
  workana: 'Workana',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  outro: 'Outro',
}
const STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function Choice({ selected, title, hint, onClick }: { selected: boolean; title: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition',
        selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-600/15' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
      )}
    >
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 dark:border-slate-600')}>
        {selected && <Check className="h-3 w-3" />}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </button>
  )
}

/**
 * Entrevista do primeiro acesso: tipo de empresa, equipe e ramo. As respostas ficam
 * no workspace (perfil da empresa) e depois servem para sugerir e limitar planos.
 */
export function Onboarding({ workspace }: { workspace: Workspace }) {
  const qc = useQueryClient()
  const [step, setStep] = useState(0)
  const [type, setType] = useState<BusinessType | null>(workspace.business_type)
  const [team, setTeam] = useState<TeamSize | null>(workspace.team_size)
  const [company, setCompany] = useState(workspace.company_name ?? '')
  const [document, setDocument] = useState(maskCpfCnpj(workspace.document ?? ''))
  const [phone, setPhone] = useState(maskPhone(workspace.phone ?? ''))
  const [zip, setZip] = useState(maskCep(workspace.address_zip ?? ''))
  const [street, setStreet] = useState(workspace.address_street ?? '')
  const [number, setNumber] = useState(workspace.address_number ?? '')
  const [district, setDistrict] = useState(workspace.address_district ?? '')
  const [city, setCity] = useState(workspace.address_city ?? '')
  const [state, setState] = useState(workspace.address_state ?? '')
  const [source, setSource] = useState<AcquisitionSource | ''>(workspace.acquisition_source ?? '')
  const [segment, setSegment] = useState(workspace.segment ?? '')
  const [busy, setBusy] = useState(false)

  const hasCnpj = type !== null && type !== 'pf'
  const steps = 4
  const docOk = isValidCpfCnpj(document) && document.replace(/\D/g, '').length === (hasCnpj ? 14 : 11)
  const detailsOk = docOk && zip.replace(/\D/g, '').length === 8 && city.trim().length >= 2 && state !== ''
  const canNext = step === 0 ? !!type : step === 1 ? !!team : true

  async function finish() {
    if (!type || !team) return
    setBusy(true)
    try {
      await saveBusinessProfile(workspace.id, { business_type: type, team_size: team, company_name: company, document, segment,
        phone, address_zip: zip, address_street: street, address_number: number, address_district: district, address_city: city, address_state: state, acquisition_source: source,
      })
      await qc.invalidateQueries({ queryKey: MY_WORKSPACES_KEY })
      await qc.invalidateQueries({ queryKey: ['profiles'] })
    } catch (e) {
      toast.error('Não foi possível salvar', { description: e instanceof Error ? e.message : undefined })
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mb-6 flex items-center gap-1.5" aria-label={`Passo ${step + 1} de ${steps}`}>
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700')} />
          ))}
        </div>

        {step === 0 && (
          <>
            <h1 className="mb-1 text-xl font-semibold">Vamos conhecer o seu negócio</h1>
            <p className="mb-5 text-sm text-slate-500">Leva um minuto. Como você atua hoje?</p>
            <div className="space-y-2">
              {(Object.keys(businessTypeLabel) as BusinessType[]).map((t) => (
                <Choice key={t} selected={type === t} title={businessTypeLabel[t].split(' (')[0]} hint={TYPE_HINT[t]} onClick={() => setType(t)} />
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="mb-1 text-xl font-semibold">Você trabalha sozinho?</h1>
            <p className="mb-5 text-sm text-slate-500">Conta quantas pessoas vão usar o sistema com você, contando você. Dá para convidar a equipe depois.</p>
            <div className="space-y-2">
              {(Object.keys(teamSizeLabel) as TeamSize[]).map((t) => (
                <Choice key={t} selected={team === t} title={teamSizeLabel[t]} onClick={() => setTeam(t)} />
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="mb-1 text-xl font-semibold">Dados da empresa</h1>
            <p className="mb-5 text-sm text-slate-500">Aparecem nas suas propostas, contratos e cobranças. Dá para ajustar depois em Minha empresa.</p>
            <div className="space-y-4">
              <Field label={hasCnpj ? 'Nome da empresa' : 'Seu nome profissional'}>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} placeholder={hasCnpj ? 'Ex.: Silva Desenvolvimento' : 'Ex.: Ana Silva'} />
              </Field>
              <Field label="O que você faz? (opcional)">
                <Input value={segment} onChange={(e) => setSegment(e.target.value)} maxLength={80} placeholder="Ex.: sites e sistemas, design, consultoria" />
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="mb-1 text-xl font-semibold">Seus dados</h1>
            <p className="mb-5 text-sm text-slate-500">Vão nas propostas, contratos e cobranças, e servem para emitir a cobrança do seu plano. Dá para ajustar depois em Minha empresa.</p>
            <div className="space-y-4">
              <Field label={hasCnpj ? 'CNPJ' : 'CPF'} error={document && !docOk ? `${hasCnpj ? 'CNPJ' : 'CPF'} inválido` : undefined}>
                <Input value={document} onChange={(e) => setDocument(maskCpfCnpj(e.target.value))} inputMode="numeric" placeholder={hasCnpj ? '00.000.000/0000-00' : '000.000.000-00'} />
              </Field>
              <Field label="WhatsApp (opcional)">
                <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" placeholder="(00) 00000-0000" autoComplete="tel" />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="CEP"><Input value={zip} onChange={(e) => setZip(maskCep(e.target.value))} inputMode="numeric" placeholder="00000-000" autoComplete="postal-code" /></Field>
                <div className="col-span-2"><Field label="Rua (opcional)"><Input value={street} onChange={(e) => setStreet(e.target.value)} maxLength={150} autoComplete="address-line1" /></Field></div>
                <Field label="Número (opcional)"><Input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={20} /></Field>
                <div className="col-span-2"><Field label="Bairro (opcional)"><Input value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={80} /></Field></div>
                <div className="col-span-2"><Field label="Cidade"><Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" /></Field></div>
                <Field label="UF">
                  <select value={state} onChange={(e) => setState(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <option value="">--</option>
                    {STATES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Como você conheceu o Krono? (opcional)">
                <select value={source} onChange={(e) => setSource(e.target.value as AcquisitionSource | '')} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <option value="">Prefiro não dizer</option>
                  {(Object.keys(SOURCES) as AcquisitionSource[]).map((k) => <option key={k} value={k}>{SOURCES[k]}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}

        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft className="h-4 w-4" />Voltar</Button>
          ) : <span />}
          {step < steps - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continuar<ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button onClick={finish} loading={busy} disabled={!detailsOk}>Começar a usar</Button>
          )}
        </div>
      </div>
    </div>
  )
}
