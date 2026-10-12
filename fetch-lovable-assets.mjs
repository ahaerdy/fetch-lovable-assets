#!/usr/bin/env node
/**
 * Baixa as imagens referenciadas pelos arquivos *.asset.json do Lovable
 * e as salva em public/<url>, espelhando o caminho original
 * (ex.: public/__l5e/assets-v1/<id>/hero-carnes.jpg).
 *
 * Assim o código do projeto continua intacto: o Vite serve public/ na raiz,
 * então "/__l5e/assets-v1/<id>/hero-carnes.jpg" passa a funcionar localmente.
 *
 * Uso:
 *   node scripts/fetch-lovable-assets.mjs
 *
 * Configuração (variáveis de ambiente ou arquivo .env.local):
 *   LOVABLE_URL      URL base do site (preferir a URL PUBLICADA, que é estável).
 *                    Ex.: https://austin-mesquite-forge.lovable.app
 *   LOVABLE_RECEIPT  (opcional) valor do ?__lovable_receipt=... de um preview privado.
 *
 * Requer Node 18+ (usa fetch nativo). Não tem dependências.
 *
 * Projeto não oficial, sem vínculo com o Lovable.
 * https://github.com/SEU-USUARIO/fetch-lovable-assets
 */
import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-ssr', '.output', '.vinxi', '.nitro', '.tanstack', '.wrangler']);
const PUBLIC_DIR = path.join(ROOT, 'public');

// ---------- config ----------
async function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) return;
  const text = await readFile(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// ---------- util ----------
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function findAssets() {
  const assets = [];
  for await (const file of walk(ROOT)) {
    if (!file.endsWith('.asset.json')) continue;
    try {
      const json = JSON.parse(await readFile(file, 'utf8'));
      if (json.url && json.url.startsWith('/')) {
        assets.push({ url: json.url, size: json.size, source: path.relative(ROOT, file) });
      }
    } catch (err) {
      console.warn(`! Ignorando ${file}: ${err.message}`);
    }
  }
  return assets;
}

async function alreadyDownloaded(dest, expectedSize) {
  try {
    const s = await stat(dest);
    // Se o JSON informa o tamanho, exige que bata; senão, basta existir.
    return expectedSize ? s.size === expectedSize : s.size > 0;
  } catch {
    return false;
  }
}

async function download(base, receipt, asset) {
  // Impede path traversal: o destino precisa ficar dentro de public/
  const dest = path.join(PUBLIC_DIR, asset.url);
  if (!dest.startsWith(PUBLIC_DIR + path.sep)) {
    throw new Error(`caminho suspeito: ${asset.url}`);
  }

  if (await alreadyDownloaded(dest, asset.size)) return 'cache';

  const url = new URL(asset.url, base);
  if (receipt) url.searchParams.set('__lovable_receipt', receipt);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url.origin}${url.pathname}`);

  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/') && !type.startsWith('video/') && !type.startsWith('font/') && !type.includes('octet-stream')) {
    throw new Error(
      `resposta não parece uma imagem (content-type: ${type || 'vazio'}). ` +
        `O site pode exigir login/receipt — use a URL publicada.`,
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return 'baixado';
}

// ---------- main ----------
async function main() {
  await loadEnvLocal();
  const base = process.env.LOVABLE_URL;
  const receipt = process.env.LOVABLE_RECEIPT;

  const assets = await findAssets();
  if (assets.length === 0) {
    console.log('Nenhum *.asset.json encontrado no projeto. Nada a fazer.');
    return;
  }

  const pending = [];
  for (const a of assets) {
    if (!(await alreadyDownloaded(path.join(PUBLIC_DIR, a.url), a.size))) pending.push(a);
  }

  if (pending.length === 0) {
    console.log(`✔ ${assets.length} asset(s) do Lovable já estão em public/.`);
    return;
  }

  if (!base) {
    console.error(
      `✖ Faltam ${pending.length} asset(s), mas LOVABLE_URL não está definida.\n` +
        `  Crie um arquivo .env.local na raiz com:\n\n` +
        `    LOVABLE_URL=https://SEU-PROJETO.lovable.app\n`,
    );
    // Não derruba o "npm run dev"; só avisa.
    process.exitCode = process.argv.includes('--strict') ? 1 : 0;
    return;
  }

  console.log(`Baixando ${pending.length} asset(s) de ${new URL(base).origin} ...`);
  let failed = 0;
  for (const asset of pending) {
    try {
      const status = await download(base, receipt, asset);
      console.log(`  ✔ ${status.padEnd(8)} ${asset.url}`);
    } catch (err) {
      failed++;
      console.error(`  ✖ ${asset.url}\n      ${err.message}`);
    }
  }

  if (failed) {
    console.error(`\n${failed} falha(s). Verifique LOVABLE_URL (use a URL publicada) e sua conexão.`);
    process.exitCode = process.argv.includes('--strict') ? 1 : 0;
  } else {
    console.log('✔ Concluído.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
