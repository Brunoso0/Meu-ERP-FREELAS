/*
 * Service worker do Meu ERP Freelas.
 *
 * Guarda só a "casca" do app (HTML, JS, CSS, ícones) para ele abrir rápido e
 * funcionar instalado. Os dados continuam vindo do Supabase a cada uso: nada
 * de outro domínio passa por aqui, e nenhuma resposta da API é guardada.
 *
 * VERSION e ASSETS são preenchidos no build (plugin em vite.config.ts).
 */
const VERSION = '__VERSION__'
const ASSETS = ['__ASSETS__']
const CACHE = `erp-shell-${VERSION}`
const SHELL = '/'

self.addEventListener('install', (event) => {
  const files = ASSETS.filter((path) => path.startsWith('/'))
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([new Request(SHELL, { cache: 'reload' }), ...files]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

const isHtml = (response) => (response.headers.get('content-type') || '').includes('text/html')

/** Páginas: sempre tenta a rede (versão nova); sem conexão, abre a casca guardada. */
async function page(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && isHtml(response)) await cache.put(SHELL, response.clone())
    return response
  } catch {
    const cached = await cache.match(SHELL, { ignoreVary: true })
    if (cached) return cached
    throw new Error('offline')
  }
}

/** Arquivos com hash no nome nunca mudam: o que já está guardado serve direto. */
async function asset(request) {
  const cache = await caches.open(CACHE)
  // o mesmo arquivo é pedido com cabeçalhos diferentes (script, import dinâmico): o Vary não importa aqui
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached) return cached
  const response = await fetch(request)
  // arquivo inexistente volta como a página inicial (HTML): isso não pode ser guardado como script
  if (response.ok && !isHtml(response)) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(page(request))
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg') {
    event.respondWith(asset(request))
  }
})
