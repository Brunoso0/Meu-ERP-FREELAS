import { useEffect, useLayoutEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { biometricFor, expireSession, judgeSession, loginAt, markActive, useSessionLock, type SessionVerdict } from '@/lib/session'

const ACTIVITY_THROTTLE_MS = 30_000
const CHECK_EVERY_MS = 60_000

/**
 * Aplica as regras de src/lib/session.ts à sessão aberta: encerra a que venceu
 * e bloqueia o app (biometria) ao abrir, ao voltar depois de um tempo fora ou
 * depois de muito tempo parado. Usado uma vez, no App.
 */
export function useSessionGuard(session: Session | null) {
  const userId = session?.user.id
  const { locked, setLocked } = useSessionLock()

  // antes de pintar a tela, para o conteúdo não aparecer por um instante ao abrir o app
  useLayoutEffect(() => {
    if (!userId) return setLocked(false)
    const verdict = judgeSession(userId, { away: true })
    if (verdict === 'expired') return void apply(verdict)
    // ao abrir o app a biometria é pedida sempre, menos logo depois de entrar com a senha
    const justLoggedIn = Date.now() - loginAt() < 60_000
    if (biometricFor(userId) && !justLoggedIn) setLocked(true)
    else markActive()
  }, [userId, setLocked])

  useEffect(() => {
    if (!userId) return
    let lastMark = 0
    const onActivity = () => {
      if (useSessionLock.getState().locked || Date.now() - lastMark < ACTIVITY_THROTTLE_MS) return
      lastMark = Date.now()
      markActive()
    }
    const onVisibility = () => {
      if (useSessionLock.getState().locked) return
      if (document.visibilityState === 'hidden') markActive()
      else apply(judgeSession(userId, { away: true }))
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !useSessionLock.getState().locked) apply(judgeSession(userId, { away: false }))
    }, CHECK_EVERY_MS)

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [userId])

  return locked
}

function apply(verdict: SessionVerdict) {
  if (verdict === 'lock') useSessionLock.getState().setLocked(true)
  if (verdict === 'expired') void expireSession({ notice: true })
}
