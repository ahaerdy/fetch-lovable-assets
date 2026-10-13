#!/usr/bin/env node
/**
 * fetch-lovable-assets — resolve as imagens quebradas de projetos Lovable
 * ao rodar o projeto fora do Lovable.
 *
 * O Lovable não guarda as imagens no repositório: grava ponteiros *.asset.json
 * cujo "url" (/__l5e/...) só existe nos servidores dele. Este script tem dois modos.
 *
 * ── MODO LOCAL (--local): não precisa de URL nem de internet ──────────────────
 *   Use quando as imagens JÁ ESTÃO na sua máquina (ex.: em public/images/).
 *   O script converte o código do projeto para usar esses arquivos:
 *     • remove os imports "*.asset.json" e troca "<var>.url" por '/images/<arquivo>';
 *     • troca URLs literais "/__l5e/..." pelo caminho local;
 *     • se achar a imagem em outra pasta do projeto, copia para public/images/.
 *   Só altera uma imagem se o arquivo local existir e tiver o tamanho registrado
 *   no ponteiro (evita usar uma versão antiga por engano).
 *
 *     node scripts/fetch-lovable-assets.mjs --local
 *     node scripts/fetch-lovable-assets.mjs --local --dry-run     (só mostra o que faria)
 *
 *   Opções do modo local:
 *     --dry-run           não grava nada; apenas mostra as mudanças
 *     --images-dir=DIR    pasta das imagens, dentro de public/ (padrão: public/images)
 *     --remove-pointers   apaga os *.asset.json que deixaram de ser usados
 *     --ignore-size       aceita arquivos com tamanho diferente do registrado
 *     --strict            sai com código 1 se alguma imagem não puder ser convertida
 *
 * ── MODO DOWNLOAD (padrão): baixa as imagens do site publicado ────────────────
 *   Salva em public/<url>, espelhando o caminho original, sem mexer no código.
 *
 *     LOVABLE_URL=https://nome-do-projeto.lovable.app node scripts/fetch-lovable-assets.mjs
 *
 *   Configuração (variáveis de ambiente ou .env.local):
 *     LOVABLE_URL      URL base do site (preferir a URL PUBLICADA, que é estável).
 *     LOVABLE_RECEIPT  (opcional) valor do ?__lovable_receipt=... de um preview privado.
 *     --strict         sai com código 1 em caso de erro.
 *
 * Requer Node 18+. Sem dependências.
 * Projeto não oficial, sem vínculo com o Lovable.
 * https://github.com/ahaerdy/fetch-lovable-assets
 */
import { readdir, readFile, mkdir, writeFile, stat, copyFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-ssr', '.output', '.vinxi', '.nitro', '.tanstack', '.wrangler']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.sass', '.less', '.html', '.vue', '.svelte', '.astro', '.mdx']);
const SELF = path.basename(process.argv[1] ?? '');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};

// ───────────────────────── utilidades comuns ─────────────────────────

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
        assets.push({
          url: json.url,
          size: json.size,
          id: json.asset_id,
          original: json.original_filename,
          file,
          source: path.relative(ROOT, file),
        });
      }
    } catch (err) {
      console.warn(`! Ignorando ${file}: ${err.message}`);
    }
  }
  return assets;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ───────────────────────── MODO DOWNLOAD ─────────────────────────

async function alreadyDownloaded(dest, expectedSize) {
  try {
    const s = await stat(dest);
    return expectedSize ? s.size === expectedSize : s.size > 0;
  } catch {
    return false;
  }
}

async function download(base, receipt, asset) {
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

async function runDownload() {
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
      `✖ Faltam ${pending.length} asset(s) em public/ e LOVABLE_URL não está definida.\n\n` +
        `  Se as imagens JÁ estão na sua máquina (ex.: public/images/), use o modo local,\n` +
        `  que não precisa de URL nem de internet:\n\n` +
        `    node scripts/fetch-lovable-assets.mjs --local\n\n` +
        `  Para baixá-las do Lovable, crie um .env.local com:\n\n` +
        `    LOVABLE_URL=https://SEU-PROJETO.lovable.app\n`,
    );
    process.exitCode = flag('--strict') ? 1 : 0;
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
    process.exitCode = flag('--strict') ? 1 : 0;
  } else {
    console.log('✔ Concluído.');
  }
}

// ───────────────────────── MODO LOCAL ─────────────────────────

async function runLocal() {
  const dryRun = flag('--dry-run');
  const ignoreSize = flag('--ignore-size');
  const removePointers = flag('--remove-pointers');
  const strict = flag('--strict');
  const tag = dryRun ? '[simulação] ' : '';

  const imagesDir = path.resolve(ROOT, option('--images-dir') ?? 'public/images');
  if (!imagesDir.startsWith(PUBLIC_DIR + path.sep)) {
    console.error(`✖ --images-dir precisa ficar dentro de public/ (recebido: ${rel(imagesDir)}).`);
    process.exitCode = 1;
    return;
  }
  const localUrlOf = (file) => '/' + path.relative(PUBLIC_DIR, file).split(path.sep).join('/');

  const assets = await findAssets();
  if (assets.length === 0) {
    console.log('Nenhum *.asset.json encontrado no projeto: nada a converter.');
    return;
  }

  const allFiles = [];
  for await (const f of walk(ROOT)) allFiles.push(f);
  const byBase = new Map();
  for (const f of allFiles) {
    const b = path.basename(f);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(f);
  }

  // nomes de arquivo repetidos (ids diferentes) colidiriam na mesma pasta
  const nameOf = (a) => a.original || path.basename(a.url);
  const nameCount = new Map();
  for (const a of assets) nameCount.set(nameOf(a), (nameCount.get(nameOf(a)) ?? 0) + 1);

  // ── 1. localizar as imagens ──
  const resolved = new Map(); // a.file -> { status, localUrl?, note? }
  const sizeOk = async (p, a) => ignoreSize || !a.size || (await stat(p)).size === a.size;

  for (const a of assets) {
    const name = nameOf(a);
    if (nameCount.get(name) > 1) {
      resolved.set(a.file, { status: 'conflito', note: `há mais de um ponteiro com o nome "${name}"` });
      continue;
    }
    const dest = path.join(imagesDir, name);

    if (existsSync(dest)) {
      if (await sizeOk(dest, a)) {
        resolved.set(a.file, { status: 'ok', localUrl: localUrlOf(dest), note: rel(imagesDir) });
      } else {
        const got = (await stat(dest)).size;
        resolved.set(a.file, {
          status: 'tamanho',
          note: `${rel(dest)} tem ${got} bytes; o ponteiro registra ${a.size}. Substitua o arquivo ou use --ignore-size`,
        });
      }
      continue;
    }

    let source = null;
    const rejected = [];
    for (const c of byBase.get(name) ?? []) {
      if (await sizeOk(c, a)) { source = c; break; }
      rejected.push(`${rel(c)} (${(await stat(c)).size} bytes)`);
    }
    if (source) {
      if (!dryRun) {
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(source, dest);
      }
      resolved.set(a.file, { status: 'copiada', localUrl: localUrlOf(dest), note: `${tag}copiada de ${rel(source)}` });
    } else if (rejected.length) {
      resolved.set(a.file, {
        status: 'tamanho',
        note: `achei ${rejected.join(', ')}, mas o ponteiro registra ${a.size} bytes (versão diferente?). Use --ignore-size para aceitar`,
      });
    } else {
      resolved.set(a.file, { status: 'ausente', note: `coloque o arquivo em ${rel(dest)}` });
    }
  }

  // ── 2. reescrever o código ──
  const byKey = new Map(); // nome do ponteiro (sem .asset.json) -> [assets]
  for (const a of assets) {
    const key = path.basename(a.file).replace(/\.asset\.json$/, '');
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(a);
  }

  const importRe = /[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"\n]+?\.asset\.json)\2[ \t]*;?[ \t]*(?:\r?\n)?/g;
  const changes = [];
  const warnings = [];
  const stillReferenced = new Set();

  for (const file of allFiles) {
    if (!CODE_EXT.has(path.extname(file).toLowerCase())) continue;
    if (path.basename(file) === SELF) continue;

    const original = await readFile(file, 'utf8');
    if (!original.includes('.asset.json') && !assets.some((a) => original.includes(a.url))) continue;

    let text = original;
    let converted = 0;

    for (const m of [...text.matchAll(importRe)]) {
      const [full, v, , spec] = m;
      const key = path.basename(spec).replace(/\.asset\.json$/, '');
      const candidates = byKey.get(key) ?? [];
      const asset = candidates.length === 1 ? candidates[0] : null;
      const r = asset && resolved.get(asset.file);

      if (!r?.localUrl) {
        warnings.push(`${rel(file)}: mantive "${v}" (${!asset ? 'ponteiro não encontrado' : r.status})`);
        continue;
      }
      const rest = text.replace(full, '');
      const anyUse = new RegExp(`(?<![\\w$.])${esc(v)}(?![\\w$])`, 'g');
      const urlUse = new RegExp(`(?<![\\w$.])${esc(v)}\\.url(?![\\w$])`, 'g');
      if ((rest.match(anyUse) ?? []).length !== (rest.match(urlUse) ?? []).length) {
        warnings.push(`${rel(file)}: mantive "${v}" (usado além de ".url"; converta à mão)`);
        continue;
      }
      text = rest.replace(urlUse, () => `'${r.localUrl}'`);
      converted++;
    }

    let literals = 0;
    for (const a of assets) {
      const r = resolved.get(a.file);
      if (r?.localUrl && text.includes(a.url)) {
        literals += text.split(a.url).length - 1;
        text = text.split(a.url).join(r.localUrl);
      }
    }

    for (const m of text.matchAll(/([^'"\s/\\]+)\.asset\.json/g)) stillReferenced.add(m[1]);

    if (text !== original) {
      if (!dryRun) await writeFile(file, text);
      changes.push({ file: rel(file), converted, literals });
    }
  }

  // ── 3. remover ponteiros sem uso (opcional) ──
  const removed = [];
  if (removePointers) {
    for (const a of assets) {
      const key = path.basename(a.file).replace(/\.asset\.json$/, '');
      if (resolved.get(a.file)?.localUrl && !stillReferenced.has(key)) {
        if (!dryRun) await unlink(a.file);
        removed.push(rel(a.file));
      }
    }
  }

  // ── relatório ──
  console.log(`${tag}Imagens (${assets.length}):`);
  let bad = 0;
  for (const a of assets) {
    const r = resolved.get(a.file);
    const ok = !!r.localUrl;
    if (!ok) bad++;
    const label = ok ? (r.status === 'copiada' ? 'copiada ' : 'ok      ') : r.status.padEnd(8);
    console.log(`  ${ok ? '✔' : '✖'} ${label} ${nameOf(a)}${r.note ? '  — ' + r.note : ''}`);
  }

  console.log(`\n${tag}Código:`);
  if (changes.length === 0) console.log('  (nenhuma alteração necessária)');
  for (const c of changes) {
    const parts = [];
    if (c.converted) parts.push(`${c.converted} import(s) convertido(s)`);
    if (c.literals) parts.push(`${c.literals} URL(s) literal(is) trocada(s)`);
    console.log(`  ✔ ${c.file}  (${parts.join(', ')})`);
  }
  for (const w of warnings) console.log(`  ! ${w}`);
  if (removed.length) console.log(`\n${tag}Ponteiros removidos: ${removed.length}`);

  if (bad) {
    console.log(`\n${bad} imagem(ns) não puderam ser convertidas; as referências a elas foram mantidas.`);
    process.exitCode = strict ? 1 : 0;
  } else if (!dryRun && changes.length) {
    console.log('\n✔ Concluído. Reinicie o servidor (npm run dev) e atualize a página com Ctrl+F5.');
  } else if (dryRun) {
    console.log('\nNada foi gravado (--dry-run). Rode sem essa opção para aplicar.');
  }
}

// ───────────────────────── entrada ─────────────────────────

async function main() {
  if (flag('--help') || flag('-h')) {
    console.log(`Uso:
  node scripts/fetch-lovable-assets.mjs --local [--dry-run] [--images-dir=DIR] [--remove-pointers] [--ignore-size] [--strict]
      Converte o código para usar imagens que já estão na sua máquina. Sem URL, sem internet.

  LOVABLE_URL=https://... node scripts/fetch-lovable-assets.mjs [--strict]
      Baixa as imagens do site publicado para public/.`);
    return;
  }
  if (flag('--local')) return runLocal();
  return runDownload();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
