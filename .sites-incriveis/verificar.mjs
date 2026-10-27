#!/usr/bin/env node
/* Sites Incríveis — verificador: rola a página inteira e tira screenshots
 * © 2026 Enzo Barbatto — Sparo Automações.
 *
 * Uso: node verificar.mjs --url http://localhost:4600 --saida verificacao
 * Requer: npm i playwright-core  (usa o Chrome já instalado na máquina)
 *
 * Gera:
 *   <saida>/desktop/passo-01.png ... (a página rolando em desktop)
 *   <saida>/celular/passo-01.png ... (idem, em tela de celular)
 *   <saida>/reduzido/pagina.png      (modo movimento-reduzido, página inteira)
 *   <saida>/RELATORIO.md             (erros de console e resumo)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
function opcao(nome, padrao) {
  const i = args.indexOf("--" + nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
}

const url = opcao("url", "http://localhost:4600");
const saida = opcao("saida", "verificacao");

const CHROMES = [
  process.env.CHROME_PATH,
  "/opt/pw-browsers/chromium",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA + "/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium"
];

const chrome = CHROMES.find((c) => c && existsSync(c));
if (!chrome) {
  console.error("Chrome nao encontrado. Instale o Google Chrome para verificar.");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("playwright-core nao instalado. Rode: npm i playwright-core");
  process.exit(1);
}

const problemas = [];
const passos = [];

async function rolarETirar(navegador, nome, largura, altura, reduzirMovimento) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    reducedMotion: reduzirMovimento ? "reduce" : "no-preference",
    deviceScaleFactor: 1
  });
  const pagina = await contexto.newPage();
  pagina.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const loc = msg.location() || {};
    if (String(loc.url || "").includes("favicon")) return; // ruido irrelevante
    problemas.push(`[${nome}] erro de console: ${msg.text()}`);
  });
  pagina.on("pageerror", (err) => problemas.push(`[${nome}] erro de pagina: ${err.message}`));

  await pagina.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await pagina.waitForTimeout(600);

  const dir = join(saida, nome);
  await mkdir(dir, { recursive: true });

  if (reduzirMovimento) {
    await pagina.screenshot({ path: join(dir, "pagina.png"), fullPage: true });
    passos.push(`${nome}: pagina inteira (1 imagem)`);
    await contexto.close();
    return;
  }

  const alturaTotal = await pagina.evaluate(() => document.documentElement.scrollHeight);
  const passo = Math.round(altura * 0.75);
  const total = Math.max(1, Math.ceil((alturaTotal - altura) / passo) + 1);

  for (let i = 0; i < total; i++) {
    await pagina.evaluate((y) => window.scrollTo(0, y), i * passo);
    await pagina.waitForTimeout(700); // deixa as animacoes assentarem
    const num = String(i + 1).padStart(2, "0");
    await pagina.screenshot({ path: join(dir, `passo-${num}.png`) });
  }
  passos.push(`${nome}: ${total} passos de rolagem (${largura}x${altura})`);
  await contexto.close();
}

console.log(`Verificando ${url} ...`);
const navegador = await chromium.launch({ executablePath: chrome, headless: true });

try {
  await rolarETirar(navegador, "desktop", 1440, 900, false);
  await rolarETirar(navegador, "celular", 390, 844, false);
  await rolarETirar(navegador, "reduzido", 1440, 900, true);
} finally {
  await navegador.close();
}

const relatorio = [
  "# Relatorio de verificacao — Sites Incríveis",
  "",
  `URL: ${url}`,
  `Data: ${new Date().toLocaleString("pt-BR")}`,
  "",
  "## Cobertura",
  ...passos.map((p) => `- ${p}`),
  "",
  "## Problemas detectados automaticamente",
  problemas.length ? problemas.map((p) => `- ${p}`).join("\n") : "- nenhum erro de console ou de pagina",
  "",
  "## O que conferir A OLHO nos screenshots",
  "- Trecho morto: dois passos seguidos praticamente iguais = rolagem sem recompensa",
  "- Contraste: todo texto legivel sobre o fundo daquele momento",
  "- Cortes: nada importante cortado na borda, no desktop e no celular",
  "- Ritmo: o pico aparece com espaco de sobra, nao espremido",
  "- Reduzido: TODO o conteudo visivel e legivel sem nenhuma animacao"
].join("\n");

await mkdir(saida, { recursive: true });
await writeFile(join(saida, "RELATORIO.md"), relatorio, "utf8");

console.log(relatorio);
console.log(`\nScreenshots em: ${saida}/`);
if (problemas.length) process.exitCode = 2;
