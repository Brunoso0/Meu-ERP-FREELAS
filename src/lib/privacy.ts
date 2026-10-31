import { listMembers, listMyWorkspaces, removeFolder } from './workspace'
import { supabase } from './supabase'

/** Baixa um JSON com tudo o que a conta enxerga (função export_my_data). */
export async function exportMyData(): Promise<void> {
  if (!supabase) throw new Error('A exportação precisa do Supabase configurado.')
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw new Error(error.message)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `krono-meus-dados-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * Apaga a conta. Antes, confere se alguma equipe ficaria sem dono e remove os arquivos (Storage)
 * dos workspaces que vão embora, porque o SQL não alcança o Storage.
 */
export async function deleteMyAccount(): Promise<void> {
  if (!supabase) throw new Error('Apagar a conta precisa do Supabase configurado.')
  const owned = (await listMyWorkspaces()).filter((w) => w.role === 'owner')
  for (const { workspace } of owned) {
    if ((await listMembers(workspace.id)).length > 1) {
      throw new Error(`"${workspace.name}" tem outras pessoas. Transfira a posse ou remova os membros antes de apagar a conta.`)
    }
  }
  for (const { workspace } of owned) await removeFolder(workspace.id)
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw new Error(error.message)
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  location.assign(location.origin + '/')
}
