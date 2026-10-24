import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
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
 * Escreve no _headers o host do Supabase de quem está sendo publicado
 * (testes ou produção), para a Content-Security-Policy liberar só ele.
 * Em modo demo (sem VITE_SUPABASE_URL) o marcador sai e nada é liberado;
 * no Cloudflare Pages (CF_PAGES) a variável é obrigatória.
 */
function securityHeaders(): Plugin {
  let outDir = 'dist'
  let host = ''
  return {
    name: 'security-headers',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      const url = loadEnv(config.mode, config.root, 'VITE_').VITE_SUPABASE_URL ?? ''
      if (!url && process.env.CF_PAGES) throw new Error('VITE_SUPABASE_URL não está definida neste ambiente do Cloudflare Pages.')
      host = url ? new URL(url).host : ''
    },
    closeBundle() {
      const file = resolve(outDir, '_headers')
      const source = readFileSync(file, 'utf8')
      const output = host
        ? source.replace(/__SUPABASE_HOST__/g, host)
        : source.replace(/ (https|wss):\/\/__SUPABASE_HOST__/g, '')
      writeFileSync(file, output)
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorkerAssets(), securityHeaders()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
