#!/usr/bin/env bash
#
# Instala o fetch-lovable-assets em um projeto Lovable.
# Execute na RAIZ do projeto (onde fica o package.json).
#
#   curl -fsSL https://raw.githubusercontent.com/SEU-USUARIO/fetch-lovable-assets/main/install.sh \
#     | bash -s -- https://nome-do-projeto.lovable.app
#
# ou, com o repositório clonado:
#
#   bash /caminho/para/fetch-lovable-assets/install.sh https://nome-do-projeto.lovable.app
#
# O que faz:
#   1. copia o script para scripts/fetch-lovable-assets.mjs
#   2. grava LOVABLE_URL no .env.local (se você informou a URL)
#   3. adiciona "predev" ao package.json (roda o script antes do npm run dev)
#   4. adiciona public/__l5e/ e .env.local ao .gitignore
#   5. executa o download uma vez (desative com --no-run)
#
# Não sobrescreve nada que já exista: em caso de conflito, avisa e mantém.

set -euo pipefail

RAW_BASE="${FLA_RAW_URL:-https://raw.githubusercontent.com/SEU-USUARIO/fetch-lovable-assets/main}"
SCRIPT_NAME="fetch-lovable-assets.mjs"
TARGET_DIR="scripts"
PREDEV_CMD="node ${TARGET_DIR}/${SCRIPT_NAME}"

info() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*" >&2; }
fail() { printf '  \033[31m✖\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Uso: install.sh [URL_DO_SITE_PUBLICADO] [--no-run]

  URL_DO_SITE_PUBLICADO  ex.: https://nome-do-projeto.lovable.app
  --no-run               não executa o download ao final
  -h, --help             mostra esta ajuda

Execute na raiz do projeto (onde está o package.json).
EOF
}

URL=""
RUN=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --no-run)  RUN=0 ;;
    http://*|https://*) URL="${1%/}" ;;
    *) usage >&2; fail "Argumento não reconhecido: $1" ;;
  esac
  shift
done

echo "fetch-lovable-assets: instalando em $(pwd)"

# ---------- pré-requisitos ----------
[[ -f package.json ]] || fail "package.json não encontrado. Execute na raiz do projeto."
command -v node >/dev/null 2>&1 || fail "Node.js não encontrado (necessário 18 ou superior)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 18 )) || fail "Node $NODE_MAJOR detectado; é necessário 18 ou superior."

# ---------- 1. script ----------
mkdir -p "$TARGET_DIR"
SELF="${BASH_SOURCE[0]:-}"
SELF_DIR=""
if [[ -n "$SELF" && -f "$SELF" ]]; then
  SELF_DIR="$(cd "$(dirname "$SELF")" && pwd)"
fi

if [[ -n "$SELF_DIR" && -f "$SELF_DIR/$SCRIPT_NAME" ]]; then
  cp "$SELF_DIR/$SCRIPT_NAME" "$TARGET_DIR/$SCRIPT_NAME"
  info "Script copiado para $TARGET_DIR/$SCRIPT_NAME"
else
  command -v curl >/dev/null 2>&1 || fail "curl não encontrado."
  curl -fsSL "$RAW_BASE/$SCRIPT_NAME" -o "$TARGET_DIR/$SCRIPT_NAME" \
    || fail "Falha ao baixar $RAW_BASE/$SCRIPT_NAME"
  info "Script baixado para $TARGET_DIR/$SCRIPT_NAME"
fi
chmod +x "$TARGET_DIR/$SCRIPT_NAME"

# ---------- 2. .env.local ----------
if [[ -n "$URL" ]]; then
  if [[ -f .env.local ]] && grep -q '^LOVABLE_URL=' .env.local; then
    warn "LOVABLE_URL já existe no .env.local; mantido sem alteração."
  else
    printf 'LOVABLE_URL=%s\n' "$URL" >> .env.local
    info "LOVABLE_URL gravada no .env.local"
  fi
elif [[ -f .env.local ]] && grep -q '^LOVABLE_URL=.' .env.local; then
  info "LOVABLE_URL já definida no .env.local"
else
  warn "URL não informada. Crie o .env.local com: LOVABLE_URL=https://nome-do-projeto.lovable.app"
fi

# ---------- 3. predev no package.json ----------
set +e
RESULT="$(PREDEV_CMD="$PREDEV_CMD" node - <<'NODE'
const fs = require('fs');
const cmd = process.env.PREDEV_CMD;
const raw = fs.readFileSync('package.json', 'utf8');
const indent = (raw.match(/^([ \t]+)"/m) || [, '  '])[1];
const pkg = JSON.parse(raw);
pkg.scripts = pkg.scripts || {};
const cur = pkg.scripts.predev;
if (cur === cmd) { console.log('same'); process.exit(0); }
if (cur) { console.log('conflict:' + cur); process.exit(2); }
const out = {};
let placed = false;
for (const [k, v] of Object.entries(pkg.scripts)) {
  if (k === 'dev' && !placed) { out.predev = cmd; placed = true; }
  out[k] = v;
}
if (!placed) out.predev = cmd;
pkg.scripts = out;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
console.log('added');
NODE
)"
RC=$?
set -e
case "$RC:$RESULT" in
  0:same)      info "package.json já tinha o predev" ;;
  0:added)     info "Script predev adicionado ao package.json" ;;
  2:conflict:*) warn "Já existe um predev no package.json (${RESULT#conflict:}). Não alterei."
                warn "Para encadear manualmente: \"predev\": \"<o seu> && $PREDEV_CMD\"" ;;
  *)           warn "Não consegui editar o package.json (${RESULT}). Adicione manualmente: \"predev\": \"$PREDEV_CMD\"" ;;
esac

# ---------- 4. .gitignore ----------
touch .gitignore
ensure_ignored() {
  local pattern="$1"; shift
  if grep -qxE "$@" .gitignore; then
    return 0
  fi
  # garante quebra de linha antes de acrescentar
  if [[ -s .gitignore && "$(tail -c1 .gitignore | wc -l)" -eq 0 ]]; then echo >> .gitignore; fi
  echo "$pattern" >> .gitignore
  info "Adicionado ao .gitignore: $pattern"
}
ensure_ignored "public/__l5e/" 'public/__l5e/?'
ensure_ignored ".env.local" '(\.env\.local|\*\.local)'

# ---------- 5. primeira execução ----------
if (( RUN )); then
  if [[ -n "$URL" ]] || grep -qs '^LOVABLE_URL=.' .env.local; then
    echo "Baixando as imagens..."
    node "$TARGET_DIR/$SCRIPT_NAME" || warn "O download falhou; veja as mensagens acima."
  fi
fi

echo
echo "Pronto. Daqui para frente, 'npm run dev' baixa as imagens que faltarem."
