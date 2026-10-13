# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.1.0] - 2026-10-12

### Adicionado
- **Modo `--local`**: converte o código para usar imagens que já estão na máquina,
  sem URL e sem internet. Remove os imports `*.asset.json`, troca `x.url` pelo
  caminho local (`/images/...`) e troca URLs literais `/__l5e/...`.
- Busca a imagem por nome em `public/images/` e no resto do projeto; copia para
  `public/images/` quando a encontra em outra pasta.
- Validação por tamanho (o registrado no ponteiro), para não usar versões antigas.
- Opções `--dry-run`, `--images-dir`, `--remove-pointers`, `--ignore-size` e `--help`.
- Relatório por imagem (`ok`, `copiada`, `ausente`, `tamanho`, `conflito`) e por arquivo alterado.

### Alterado
- Sem `LOVABLE_URL` e sem `--local`, a mensagem de erro agora sugere o modo local.
- README reorganizado em torno dos dois modos, com guia de qual usar (incluindo deploy no Netlify).

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
