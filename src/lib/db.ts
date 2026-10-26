import type { Profile, TableName, Tables, Workspace } from '@/types/database.types'
import { activeWorkspaceId } from '@/store/workspace'
import { isSupabaseConfigured, supabase } from './supabase'
import { buildSeed, DEMO_USER_ID, DEMO_WORKSPACE_ID, type MockDB } from './mock-data'

/**
 * Repositório único do app. Com Supabase configurado, fala com o banco;
 * sem credenciais, usa um banco demo guardado no localStorage. As telas
 * não sabem a diferença.
 */

const STORAGE_KEY = 'meu-erp-freelas:demo-db:v1'
let memory: MockDB | null = null

function demo(): MockDB {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      // bancos demo gravados antes de uma tabela nova existir ganham a lista vazia
      memory = { ...emptyDb(), ...(JSON.parse(raw) as Partial<MockDB>) }
      return memory
    }
  } catch {
    // localStorage indisponível ou corrompido: recomeça do seed
  }
  memory = buildSeed()
  persist()
  return memory
}

function emptyDb(): MockDB {
  const seed = buildSeed() as unknown as Record<string, unknown[]>
  return Object.fromEntries(Object.keys(seed).map((table) => [table, []])) as unknown as MockDB
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // sem persistência (aba privada, cota cheia): segue só em memória
  }
}

export function resetDemoData() {
  memory = buildSeed()
  persist()
}

/** Tabelas de dados: cada linha pertence a um workspace (migração 020). */
const SCOPED = new Set<TableName>([
  'clients', 'freelancers', 'proposals', 'quotes', 'quote_recurrences', 'projects',
  'tasks', 'calendar_events', 'financial_transactions', 'contracts', 'goals',
])

/**
 * "Perfil" é uma visão: o que é pessoal (nome, foto, lembretes) vem da tabela
 * profiles e os dados da empresa (Minha empresa, cobrança, nota fiscal) vêm do
 * workspace ativo. As telas continuam lendo e gravando 'profiles' como antes; a
 * separação acontece aqui.
 */
const COMPANY_FIELDS = [
  'company_name', 'document', 'email', 'phone', 'pix_key', 'pix_qr_image', 'signature_image',
  'billing_provider', 'billing_fine_pct', 'billing_interest_pct', 'billing_discount_pct', 'billing_discount_days',
  'billing_types', 'billing_notify', 'nfse_services', 'nfse_observations', 'nfse_regime', 'nfse_taxes',
] as const

function mergeProfile(profile: Profile, workspace: Workspace | null | undefined): Profile {
  if (!workspace) return profile
  const merged: Record<string, unknown> = { ...profile }
  for (const field of COMPANY_FIELDS) merged[field] = workspace[field]
  return merged as unknown as Profile
}

/** Separa o que o app quer gravar no perfil: o que é da empresa vai para o workspace. */
function splitProfilePatch(patch: Partial<Profile>) {
  const company: Record<string, unknown> = {}
  const personal: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if ((COMPANY_FIELDS as readonly string[]).includes(key)) company[key] = value
    else personal[key] = value
  }
  // o nome do workspace acompanha o nome da empresa
  if (typeof company.company_name === 'string' && company.company_name.trim()) company.name = company.company_name.trim()
  return { company, personal }
}

const latency = () => new Promise((resolve) => setTimeout(resolve, 220))

function rowsOf<T extends TableName>(table: T): Tables[T][] {
  return demo()[table] as unknown as Tables[T][]
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

export async function listRows<T extends TableName>(table: T): Promise<Tables[T][]> {
  const workspaceId = activeWorkspaceId()
  if (!supabase) {
    await latency()
    let rows = [...rowsOf(table)]
    if (table === 'profiles') {
      const workspace = demo().workspaces.find((w) => w.id === (workspaceId ?? DEMO_WORKSPACE_ID))
      rows = (rows as unknown as Profile[]).map((p) => mergeProfile(p, workspace)) as unknown as Tables[T][]
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  if (table === 'profiles') {
    const { data, error } = await supabase.from('profiles').select('*')
    fail(error)
    let workspace: Workspace | null = null
    if (workspaceId) {
      const res = await supabase.from('workspaces').select('*').eq('id', workspaceId).maybeSingle()
      fail(res.error)
      workspace = res.data as Workspace | null
    }
    return ((data ?? []) as Profile[]).map((p) => mergeProfile(p, workspace)) as unknown as Tables[T][]
  }
  let query = supabase.from(table).select('*')
  if (workspaceId && SCOPED.has(table)) query = query.eq('workspace_id', workspaceId)
  const { data, error } = await query.order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as Tables[T][]
}

export async function insertRow<T extends TableName>(table: T, values: Partial<Tables[T]>): Promise<Tables[T]> {
  if (!supabase) {
    await latency()
    const row: Record<string, unknown> = {
      ...values,
      id: crypto.randomUUID(),
      user_id: DEMO_USER_ID,
      created_at: new Date().toISOString(),
    }
    if (table === 'proposals') {
      const last = Math.max(0, ...rowsOf('proposals').map((p) => p.proposal_number))
      row.proposal_number = last + 1
    }
    if (table === 'quotes') {
      const last = Math.max(0, ...rowsOf('quotes').map((q) => q.quote_number))
      row.quote_number = last + 1
    }
    rowsOf(table).push(row as unknown as Tables[T])
    persist()
    return row as unknown as Tables[T]
  }
  // user_id, proposal_number e quote_number são preenchidos pelo banco (default auth.uid() e trigger);
  // o workspace é o que está aberto (sem ele o banco usa o principal da pessoa)
  const { data, error } = await supabase.from(table).insert(withWorkspace(table, values) as Record<string, unknown>).select().single()
  fail(error)
  return data as Tables[T]
}

function withWorkspace<T extends TableName>(table: T, values: Partial<Tables[T]>): Partial<Tables[T]> {
  const workspaceId = activeWorkspaceId()
  if (!workspaceId || !SCOPED.has(table)) return values
  return { workspace_id: workspaceId, ...values }
}

/** Insere várias linhas de uma vez (ex.: as parcelas de uma recorrência). */
export async function insertRows<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]> {
  if (!supabase) {
    await latency()
    const now = Date.now()
    const created = rows.map((values, i) => ({
      ...values,
      id: crypto.randomUUID(),
      user_id: DEMO_USER_ID,
      created_at: new Date(now + i).toISOString(),
    })) as unknown as Tables[T][]
    rowsOf(table).push(...created)
    persist()
    return created
  }
  const { data, error } = await supabase.from(table).insert(rows.map((r) => withWorkspace(table, r)) as Record<string, unknown>[]).select()
  fail(error)
  return (data ?? []) as Tables[T][]
}

export async function updateRow<T extends TableName>(
  table: T,
  id: string,
  patch: Partial<Tables[T]>,
): Promise<Tables[T]> {
  if (!supabase) {
    await latency()
    if (table === 'profiles') {
      const { company, personal } = splitProfilePatch(patch as Partial<Profile>)
      const workspace = demo().workspaces.find((w) => w.id === (activeWorkspaceId() ?? DEMO_WORKSPACE_ID))
      if (workspace) Object.assign(workspace, company)
      const profile = demo().profiles.find((p) => p.id === id)
      if (profile) Object.assign(profile, personal)
      persist()
      return (await listRows('profiles'))[0] as Tables[T]
    }
    const rows = rowsOf(table)
    const index = rows.findIndex((r) => r.id === id)
    if (index < 0) throw new Error('Registro não encontrado.')
    rows[index] = { ...rows[index], ...patch }
    persist()
    return rows[index]
  }
  if (table === 'profiles') return updateProfile(id, patch as Partial<Profile>) as Promise<Tables[T]>
  const { data, error } = await supabase.from(table).update(patch as Record<string, unknown>).eq('id', id).select().single()
  fail(error)
  return data as Tables[T]
}

async function updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
  const { company, personal } = splitProfilePatch(patch)
  const workspaceId = activeWorkspaceId()
  if (Object.keys(company).length > 0) {
    if (!workspaceId) throw new Error('Nenhuma empresa selecionada.')
    // select() sem linhas = o papel da pessoa não permite alterar a empresa
    const { data, error } = await supabase!.from('workspaces').update(company).eq('id', workspaceId).select('id')
    fail(error)
    if (!data?.length) throw new Error('Só o dono ou um administrador pode alterar os dados da empresa.')
  }
  if (Object.keys(personal).length > 0) {
    const { error } = await supabase!.from('profiles').update(personal).eq('id', id)
    fail(error)
  }
  const [profile] = (await listRows('profiles')) as Profile[]
  return profile
}

export async function deleteRow<T extends TableName>(table: T, id: string): Promise<void> {
  if (!supabase) {
    await latency()
    const db = demo() as unknown as Record<string, Array<{ id: string }>>
    db[table] = db[table].filter((r) => r.id !== id)
    persist()
    return
  }
  if (table === 'financial_transactions') await cancelOpenCharge(id)
  const { error } = await supabase.from(table).delete().eq('id', id)
  fail(error)
}

/**
 * Lançamento com cobrança aberta no gateway não pode sumir daqui deixando a
 * cobrança valendo lá (o cliente ainda conseguiria pagar). Todo caminho de
 * exclusão passa por deleteRow, então a trava fica aqui: cancela no gateway
 * primeiro e, se não der, não exclui.
 */
async function cancelOpenCharge(id: string) {
  if (!supabase) return
  const { data } = await supabase.from('financial_transactions').select('gateway_charge_id, status, nfse_status').eq('id', id).maybeSingle()
  if (data?.nfse_status === 'AUTHORIZED' || data?.nfse_status === 'SCHEDULED' || data?.nfse_status === 'SYNCHRONIZED') {
    throw new Error('Este recebimento tem nota fiscal emitida. Cancele a nota antes de excluir o lançamento.')
  }
  if (!data?.gateway_charge_id || data.status === 'paid') return
  const { error } = await supabase.functions.invoke('billing', { body: { action: 'cancel-charge', transactionId: id } })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(`A cobrança no Asaas não foi cancelada, então o lançamento não foi excluído. ${detail?.message ?? error.message}`)
  }
}

/** Envia o comprovante e devolve o valor a gravar em `proof_url`. */
export async function uploadProof(file: File): Promise<string> {
  if (!supabase) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
      reader.readAsDataURL(file)
    })
  }
  const { data: session } = await supabase.auth.getSession()
  const uid = session.session?.user.id
  if (!uid) throw new Error('Sessão expirada. Entre novamente.')
  // a pasta é o workspace; sem ele (cadastro antigo) vale o id da pessoa, que é o mesmo do workspace dela
  const path = `${activeWorkspaceId() ?? uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from('proofs').upload(path, file)
  fail(error)
  return path
}

/** Resolve `proof_url` para um endereço que o navegador consegue abrir. */
export async function resolveProofUrl(proof: string): Promise<string> {
  if (!supabase || proof.startsWith('data:') || proof.startsWith('http')) return proof
  const { data, error } = await supabase.storage.from('proofs').createSignedUrl(proof, 300)
  fail(error)
  return data!.signedUrl
}

export async function pingSupabase(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
  return !error
}
