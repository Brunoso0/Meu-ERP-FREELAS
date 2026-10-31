import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearSessionMarks } from '@/lib/session'
import { sessionIdOf, trustSession } from '@/lib/mfa'

/** Logins que um aparelho confiável já liberou, e os pedidos em andamento (várias telas usam este hook). */
const trustedLogins = new Set<string>()
const trustChecks = new Map<string, Promise<boolean>>()

function trustLogin(uid: string, sid: string | null): Promise<boolean> {
  if (sid && trustedLogins.has(sid)) return Promise.resolve(true)
  const key = sid ?? uid
  let check = trustChecks.get(key)
  if (!check) {
    check = trustSession(uid)
      .then((ok) => {
        if (ok && sid) trustedLogins.add(sid)
        return ok
      })
      .finally(() => trustChecks.delete(key))
    trustChecks.set(key, check)
  }
  return check
}

/** Em modo demo não há login: `ready` já nasce true e `session` fica nula. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [recovering, setRecovering] = useState(false)
  // nível da sessão: quem ativou a verificação em duas etapas só segue depois de digitar o código (aal2)
  const [mfa, setMfa] = useState<{ uid: string; pending: boolean } | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // o link do e-mail de recuperação entra logado: antes de seguir, a pessoa define a nova senha
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!supabase) return
    // sem sessão não sobra nada do login anterior: o próximo login começa "sem saber" o nível
    // (se sobrasse, o app abriria já na senha e consultaria os dados antes do código, recebendo vazio)
    if (!uid) {
      setMfa(null)
      return
    }
    let live = true
    const accessToken = session?.access_token ?? ''
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(async ({ data }) => {
      let pending = data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2'
      if (pending) {
        // aparelho em que o código já foi confirmado antes (30 dias): a função libera este login
        if (await trustLogin(uid, sessionIdOf(accessToken))) pending = false
      }
      if (live) setMfa({ uid, pending })
    })
    return () => {
      live = false
    }
    // o token muda ao confirmar o código (aal2) e ao renovar: reavalia sem piscar a tela
  }, [uid, session?.access_token])

  // enquanto o nível não é conhecido, o app não abre (evita um instante de telas sem dados)
  const mfaKnown = !session || mfa?.uid === uid

  return {
    session,
    ready: ready && mfaKnown,
    recovering,
    mfaPending: Boolean(session && mfa?.uid === uid && mfa?.pending),
    doneRecovering: () => setRecovering(false),
    signOut: () => {
      clearSessionMarks()
      return supabase?.auth.signOut()
    },
  }
}
