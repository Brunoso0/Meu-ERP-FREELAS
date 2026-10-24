import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { expireSession, markActive, sessionIdle } from '@/lib/session'

const ACTIVITY_THROTTLE_MS = 15_000
const CHECK_EVERY_MS = 20_000

/**
 * Aplica a regra de src/lib/session.ts à sessão aberta: 5 minutos sem uso
 * encerram a sessão, ao abrir o app, ao voltar para ele ou com ele parado na
 * tela. Usado uma vez, no App.
 */
export function useSessionGuard(session: Session | null) {
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    if (sessionIdle()) return void expireSession()

    let lastMark = 0
    const onActivity = () => {
      if (Date.now() - lastMark < ACTIVITY_THROTTLE_MS) return
      // parado além do limite, o primeiro toque já não vale: a sessão venceu antes dele
      if (sessionIdle()) return void expireSession()
      lastMark = Date.now()
      markActive()
    }
    const check = () => sessionIdle() && void expireSession()
    const onVisibility = () => document.visibilityState === 'visible' && check()
    const timer = window.setInterval(check, CHECK_EVERY_MS)

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [userId])
}
