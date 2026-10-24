import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Depois do build, escreve no service worker a lista dos arquivos gerados.
 * Assim o app instalado guarda todas as telas de uma vez (não só as já
 * visitadas) e cada publicação troca o cache inteiro pelo novo.
 */
function serviceWorkerAssets(): Plugin {
  let outDir = 'dist'
  return {
    name: 'service-worker-assets',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const assets = readdirSync(resolve(outDir, 'assets'))
        .filter((file) => /\.(js|css)$/.test(file))
        .sort()
        .map((file) => `/assets/${file}`)
      const file = resolve(outDir, 'sw.js')
      const source = readFileSync(file, 'utf8')
      const version = createHash('sha256').update(source).update(assets.join('|')).digest('hex').slice(0, 12)
      writeFileSync(file, source.replace("'__VERSION__'", JSON.stringify(version)).replace("['__ASSETS__']", JSON.stringify(assets)))
    },
  }
}

/**
 * Troca o marcador __SUPABASE_HOST__ do _headers pelo host de VITE_SUPABASE_URL,
 * para cada ambiente sair com a política de segurança do seu próprio banco.
 * Sem a variável (modo demo ou CI) o host é removido; no Cloudflare Pages
 * (CF_PAGES=1) a falta da variável quebra o build, para não publicar um site
 * que não consegue falar com o banco.
 */
function cspSupabaseHost(): Plugin {
  let outDir = 'dist'
  let supabaseUrl = ''
  return {
    name: 'csp-supabase-host',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      supabaseUrl = (config.env.VITE_SUPABASE_URL as string | undefined) ?? process.env.VITE_SUPABASE_URL ?? ''
      if (!supabaseUrl && process.env.CF_PAGES === '1') {
        throw new Error('VITE_SUPABASE_URL está vazia: defina a variável no Cloudflare Pages para este ambiente.')
      }
    },
    closeBundle() {
      const file = resolve(outDir, '_headers')
      if (!existsSync(file)) return
      let source = readFileSync(file, 'utf8')
      if (supabaseUrl) {
        source = source.replaceAll('__SUPABASE_HOST__', new URL(supabaseUrl).host)
      } else {
        console.warn('[csp-supabase-host] VITE_SUPABASE_URL vazia: CSP gerada sem o host do Supabase (modo demo).')
        source = source.replaceAll(' https://__SUPABASE_HOST__', '').replaceAll(' wss://__SUPABASE_HOST__', '')
      }
      writeFileSync(file, source)
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorkerAssets(), cspSupabaseHost()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
