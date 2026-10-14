import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

export default defineConfig({
  plugins: [react(), serviceWorkerAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
