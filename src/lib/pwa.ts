import { useEffect, useState } from 'react'

/** Registra o service worker (só no site publicado: no dev ele atrapalharia o recarregamento do Vite). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // sem service worker o site funciona igual, só não instala nem abre offline
    })
  })
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pending: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  // o navegador avisa quando o app pode ser instalado; guardamos o aviso para usar no botão
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    pending = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    pending = null
    notify()
  })
}

/** Devolve a função que abre a instalação do app, ou null quando não há o que instalar. */
export function useInstallApp() {
  const [available, setAvailable] = useState(!!pending)
  useEffect(() => {
    const update = () => setAvailable(!!pending)
    update()
    listeners.add(update)
    return () => void listeners.delete(update)
  }, [])

  if (!available) return null
  return async () => {
    const event = pending
    if (!event) return
    await event.prompt()
    await event.userChoice
    pending = null
    notify()
  }
}
