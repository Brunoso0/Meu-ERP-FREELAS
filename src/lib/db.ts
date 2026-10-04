import type { TableName, Tables } from '@/types/database.types'
import { isSupabaseConfigured, supabase } from './supabase'
import { buildSeed, DEMO_USER_ID, type MockDB } from './mock-data'

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

const latency = () => new Promise((resolve) => setTimeout(resolve, 220))

function rowsOf<T extends TableName>(table: T): Tables[T][] {
  return demo()[table] as unknown as Tables[T][]
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

export async function listRows<T extends TableName>(table: T): Promise<Tables[T][]> {
  if (!supabase) {
    await latency()
    return [...rowsOf(table)].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
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
  // user_id, proposal_number e quote_number são preenchidos pelo banco (default auth.uid() e trigger)
  const { data, error } = await supabase.from(table).insert(values as Record<string, unknown>).select().single()
  fail(error)
  return data as Tables[T]
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
  const { data, error } = await supabase.from(table).insert(rows as Record<string, unknown>[]).select()
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
    const rows = rowsOf(table)
    const index = rows.findIndex((r) => r.id === id)
    if (index < 0) throw new Error('Registro não encontrado.')
    rows[index] = { ...rows[index], ...patch }
    persist()
    return rows[index]
  }
  const { data, error } = await supabase.from(table).update(patch as Record<string, unknown>).eq('id', id).select().single()
  fail(error)
  return data as Tables[T]
}

export async function deleteRow<T extends TableName>(table: T, id: string): Promise<void> {
  if (!supabase) {
    await latency()
    const db = demo() as unknown as Record<string, Array<{ id: string }>>
    db[table] = db[table].filter((r) => r.id !== id)
    persist()
    return
  }
  const { error } = await supabase.from(table).delete().eq('id', id)
  fail(error)
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
  const path = `${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
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
