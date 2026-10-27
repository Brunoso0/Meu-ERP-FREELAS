#!/usr/bin/env node
/* Sites Incríveis — servidor local simples
 * © 2026 Enzo Barbatto — Sparo Automações.
 * Uso: node servir.mjs --pasta . --porta 4600
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const args = process.argv.slice(2);
function opcao(nome, padrao) {
  const i = args.indexOf("--" + nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
}

const pasta = resolve(opcao("pasta", "."));
const porta = parseInt(opcao("porta", "4600"), 10);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

const servidor = http.createServer(async (req, res) => {
  try {
    let caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (caminho.endsWith("/")) caminho += "index.html";
    const arquivo = normalize(join(pasta, caminho));
    if (!arquivo.startsWith(pasta)) {
      res.writeHead(403).end("Fora da pasta servida.");
      return;
    }
    const conteudo = await readFile(arquivo);
    res.writeHead(200, {
      "Content-Type": TIPOS[extname(arquivo).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(conteudo);
  } catch {
    res.writeHead(404).end("Nao encontrado.");
  }
});

servidor.listen(porta, () => {
  console.log(`Sites Incríveis servindo ${pasta}`);
  console.log(`Abra: http://localhost:${porta}`);
});
