# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-10-12

### Adicionado
- `fetch-lovable-assets.mjs`: lê os `*.asset.json` do projeto e baixa as imagens
  para `public/`, espelhando o caminho original (`/__l5e/...`).
- Varredura do projeto inteiro, ignorando `node_modules`, `.git` e pastas de build.
- Cache por tamanho: arquivos já baixados são pulados.
- Validação do `content-type`, para não gravar páginas HTML de login como imagem.
- Proteção contra caminhos que saiam de `public/`.
- Configuração por `LOVABLE_URL` e `LOVABLE_RECEIPT`, via ambiente ou `.env.local`.
- Opção `--strict` para falhar (e interromper o `npm run dev`) em caso de erro.
- `install.sh`: configura um projeto com um comando (script, `.env.local`,
  `predev` e `.gitignore`), de forma idempotente e sem sobrescrever o que existe.
