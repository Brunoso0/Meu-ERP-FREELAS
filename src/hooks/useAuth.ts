import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearSessionMarks } from '@/lib/session'

/** Em modo demo não há login: `ready` já nasce true e `session` fica nula. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [recovering, setRecovering] = useState(false)

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

  return {
    session,
    ready,
    recovering,
    doneRecovering: () => setRecovering(false),
    signOut: () => {
      clearSessionMarks()
      return supabase?.auth.signOut()
    },
  }
}
