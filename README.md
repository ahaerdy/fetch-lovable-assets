# fetch-lovable-assets

Faz as imagens de projetos [Lovable](https://lovable.dev) aparecerem quando você roda o projeto fora do Lovable. Sem dependências, só Node 18+.

Tem **dois modos**:

| Modo | Precisa de URL? | O que faz |
|---|---|---|
| **`--local`** | **Não** (nem de internet) | Converte o código para usar imagens que já estão na sua máquina (ex.: `public/images/`). |
| **Download** (padrão) | Sim (`LOVABLE_URL`) | Baixa as imagens do site publicado para `public/`, sem mexer no código. |

> **Projeto não oficial.** Não tem vínculo com o Lovable. Ele depende de um detalhe interno da plataforma (os arquivos `*.asset.json`), que pode mudar sem aviso. Veja [Limitações](#limitações).

---

## O problema

Você desenvolve um projeto no Lovable, sincroniza com o GitHub, clona na sua máquina e roda:

```bash
npm i
npm run dev
```

A página abre, mas **as imagens aparecem quebradas**.

**Causa:** o Lovable não coloca no repositório as imagens geradas ou enviadas. Ele grava em `src/assets/` apenas arquivos-ponteiro com sufixo `.asset.json`, por exemplo `hero.jpg.asset.json`:

```json
{
  "asset_id": "e444e576-...",
  "url": "/__l5e/assets-v1/e444e576-.../hero.jpg",
  "original_filename": "hero.jpg",
  "size": 270081,
  "content_type": "image/jpeg"
}
```

O código usa esse `url` no `<img>`, mas o caminho `/__l5e/...` só existe nos servidores do Lovable. Localmente o Vite devolve 404.

Repare que o ponteiro **não tem a URL do arquivo**, só um caminho interno. Sem um endereço do Lovable de onde buscar, nenhum script consegue *baixar* a imagem. Por isso existem os dois modos.

---

## Qual modo usar?

| Situação | Modo recomendado |
|---|---|
| As imagens **já estão** na sua máquina, e você vai publicar o projeto por conta própria (Netlify, Vercel...). | **`--local`** |
| Você continua sincronizando com o Lovable (`git pull`) e só quer rodar localmente. | **Download** |
| Você tem as imagens, mas não quer informar a URL. | **`--local`** |

**Para deploy fora do Lovable, prefira o `--local`.** O modo download roda no `predev`, ou seja, só em `npm run dev`; o build do Netlify não passa por ele, e `public/__l5e/` fica no `.gitignore`. Com o `--local`, as imagens ficam em `public/images/`, **são commitadas no repositório** e o site deixa de depender dos servidores do Lovable.

---

## Modo local (`--local`)

Use quando as imagens já estão em algum lugar do projeto, de preferência em `public/images/`. O script **não usa internet e não precisa de URL**.

### Uso

Na **raiz do projeto**, sem instalar nada no projeto:

```bash
curl -fsSL https://raw.githubusercontent.com/ahaerdy/fetch-lovable-assets/main/fetch-lovable-assets.mjs -o /tmp/fla.mjs

node /tmp/fla.mjs --local --dry-run   # simula e mostra o que mudaria
node /tmp/fla.mjs --local             # aplica
```

Ou, se o script já está no projeto (`scripts/fetch-lovable-assets.mjs`):

```bash
node scripts/fetch-lovable-assets.mjs --local
```

Depois reinicie o `npm run dev` e atualize a página com Ctrl+F5.

> Faça `git status` antes. O modo local **altera arquivos do seu código**; se não gostar do resultado, `git checkout src/` desfaz.

### O que ele faz

1. Lê os `*.asset.json` e, para cada um, procura a imagem pelo nome (`original_filename`): primeiro em `public/images/`, depois em qualquer outra pasta do projeto. Se achar fora de `public/images/`, **copia** para lá.
2. Confere o **tamanho** do arquivo com o registrado no ponteiro. Se for diferente, não usa (evita aproveitar uma versão antiga por engano).
3. Converte o código: remove `import x from '...asset.json'` e troca `x.url` por `'/images/arquivo.jpg'`.
4. Troca URLs literais `/__l5e/...` (em `.tsx`, `.css`, `.html` etc.) pelo caminho local.
5. Imagens que não puderam ser resolvidas **ficam como estavam**, e o relatório diz o que fazer.

Exemplo de relatório:

```
Imagens (6):
  ✔ ok       hero-carnes.jpg  — public/images
  ✔ copiada  equipe.jpg  — copiada de 000-Midia/equipe.jpg
  ✖ ausente  bebidas.jpg  — coloque o arquivo em public/images/bebidas.jpg
  ✖ tamanho  tacos.jpg  — achei src/assets/tacos.jpg (203837 bytes), mas o ponteiro registra 105834 bytes

Código:
  ✔ src/routes/index.tsx  (4 import(s) convertido(s))
  ! src/routes/index.tsx: mantive "bebidasAsset" (ausente)
```

É **idempotente**: rodar de novo não muda mais nada.

### Opções

| Opção | Efeito |
|---|---|
| `--dry-run` | Não grava nada; só mostra as mudanças. |
| `--images-dir=DIR` | Pasta das imagens, dentro de `public/` (padrão: `public/images`). |
| `--remove-pointers` | Apaga os `*.asset.json` que deixaram de ser usados. |
| `--ignore-size` | Aceita arquivos com tamanho diferente do registrado. |
| `--strict` | Sai com código 1 se alguma imagem não puder ser convertida. |

### De onde vêm as imagens?

De qualquer fonte, uma vez: baixadas no navegador a partir do preview do Lovable, os originais que você mesmo enviou ao projeto, etc. O modo local não as obtém sozinho. Ele só liga o código a arquivos que **já existem** na sua máquina. Para buscá-las automaticamente do Lovable, use o modo download.

---

## Modo download

Baixa cada imagem do site publicado para `public/`, **reproduzindo o mesmo caminho** do `url`:

```
public/__l5e/assets-v1/e444e576-.../hero.jpg
```

O Vite serve `public/` na raiz, então o caminho original passa a funcionar localmente **sem nenhuma alteração no código**. Você continua sincronizando com o Lovable (`git pull`) sem conflitos.

### Instalação rápida

Na **raiz do projeto Lovable** (onde está o `package.json`), troque a URL do site:

```bash
curl -fsSL https://raw.githubusercontent.com/ahaerdy/fetch-lovable-assets/main/install.sh \
  | bash -s -- https://nome-do-projeto.lovable.app
```

O instalador:

1. copia o script para `scripts/fetch-lovable-assets.mjs`;
2. grava `LOVABLE_URL` no `.env.local`;
3. adiciona `"predev"` ao `package.json`, para o script rodar antes do `npm run dev`;
4. adiciona `public/__l5e/` e `.env.local` ao `.gitignore`;
5. baixa as imagens uma vez.

Ele é **idempotente** e **não sobrescreve nada**: se já existir um `predev` diferente, ou um `LOVABLE_URL` no `.env.local`, ele avisa e mantém o que existe.

| Opção do instalador | Efeito |
|---|---|
| `URL` (posicional) | URL publicada do site. Se omitida, você configura o `.env.local` depois. |
| `--no-run` | Não executa o download ao final. |
| `-h`, `--help` | Mostra a ajuda. |

**Alternativa: clonar o repositório**

```bash
git clone https://github.com/ahaerdy/fetch-lovable-assets.git ~/tools/fetch-lovable-assets

# dentro de cada projeto Lovable:
bash ~/tools/fetch-lovable-assets/install.sh https://nome-do-projeto.lovable.app
```

**Alternativa: instalação manual**

```bash
mkdir -p scripts
curl -fsSL https://raw.githubusercontent.com/ahaerdy/fetch-lovable-assets/main/fetch-lovable-assets.mjs \
  -o scripts/fetch-lovable-assets.mjs

echo "LOVABLE_URL=https://nome-do-projeto.lovable.app" > .env.local
npm pkg set scripts.predev="node scripts/fetch-lovable-assets.mjs"
printf 'public/__l5e/\n.env.local\n' >> .gitignore
```

> **Segurança:** `curl | bash` executa código baixado da internet. Leia o [`install.sh`](install.sh) antes de rodar e, se quiser, fixe uma versão trocando `main` por uma tag (por exemplo `v1.1.0`) na URL.

### Descobrindo a URL do site

No Lovable, clique em **Publish**. A URL tem o formato `https://nome-do-projeto.lovable.app`, ou é o seu domínio próprio, se você configurou um.

Use a **URL publicada**. A URL de preview (`preview--...lovable.app/?__lovable_receipt=...`) tem um token temporário e pode exigir login. Se não houver outra opção, informe também o token:

```
LOVABLE_URL=https://preview--nome-do-projeto.lovable.app
LOVABLE_RECEIPT=mat_xxxxxxxxxxxxxxxx
```

### Uso no dia a dia

```bash
git pull        # traz as alterações feitas no Lovable
npm run dev     # o predev baixa só o que estiver faltando e inicia o servidor
```

Só o download, sem iniciar o servidor:

```bash
node scripts/fetch-lovable-assets.mjs
```

Informando a URL na hora, sem `.env.local`:

```bash
LOVABLE_URL=https://nome-do-projeto.lovable.app node scripts/fetch-lovable-assets.mjs
```

### Configuração

| Variável / opção | Efeito |
|---|---|
| `LOVABLE_URL` | URL base do site. Obrigatória se houver imagens a baixar. |
| `LOVABLE_RECEIPT` | Token de um preview privado (opcional). |
| `--strict` | Em caso de erro, sai com código 1 e **interrompe** o `npm run dev`. Sem a opção, o script só avisa e o servidor sobe mesmo assim. |

As variáveis podem vir do ambiente ou do `.env.local`. O ambiente tem prioridade.

### Como funciona

1. Varre o projeto atrás de `*.asset.json` (ignora `node_modules`, `.git`, `dist` e pastas de build).
2. Lê `url` e `size` de cada um.
3. Pula o que já existe em `public/` com o tamanho esperado.
4. Baixa o restante de `LOVABLE_URL` + `url`.
5. Confere se a resposta é uma imagem (e não uma página HTML de login) antes de gravar.
6. Salva em `public/<url>`, recusando qualquer caminho que saia de `public/`.

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `LOVABLE_URL não está definida` | Modo download sem `.env.local`. | Crie-o com `LOVABLE_URL=...`, ou, se já tem as imagens, use `--local`. |
| `ausente` no relatório do `--local` | Não há arquivo com esse nome no projeto. | Coloque-o em `public/images/` (o relatório diz o caminho exato). |
| `tamanho` no relatório do `--local` | O arquivo achado não é a versão registrada no ponteiro (ex.: uma imagem antiga com o mesmo nome). | Substitua pelo arquivo correto, ou use `--ignore-size` se for de propósito. |
| `mantive "x" (usado além de ".url")` | O código usa outra propriedade do ponteiro, como `x.size`. | Converta essa referência à mão. |
| `resposta não parece uma imagem (content-type: text/html)` | A URL exige login, o token expirou ou o projeto não está publicado. | Publique o projeto e use a URL publicada, sem `?__lovable_receipt=`. |
| `HTTP 404` | URL base errada, ou a imagem foi removida no Lovable. | Abra a `LOVABLE_URL` no navegador para conferir. |
| `HTTP 401` / `403` | Projeto privado. | Use um preview com `LOVABLE_RECEIPT`, ou torne o site público. |
| Imagens continuam quebradas depois de rodar | Cache do navegador, ou o servidor não percebeu os arquivos novos. | Ctrl+F5; se persistir, reinicie o `npm run dev`. |
| Imagem funciona local, mas some no Netlify | Os arquivos não foram commitados (ou estão no `.gitignore`). | Confira com `git ls-files public/images`. |
| `Nenhum *.asset.json encontrado` | O projeto não usa ponteiros, ou já foram convertidos e removidos. | Nada a fazer. |

Para conferir que os arquivos baixados (modo download) são imagens de verdade:

```bash
find public/__l5e -type f -exec file {} \;
```

Se algum aparecer como `HTML document`, apague `public/__l5e/` e rode de novo com a URL correta.

---

## Limitações

- **Depende do formato do Lovable.** O script espera ponteiros `*.asset.json` com o campo `url` iniciando por `/`. Se o formato mudar, ele avisa que não encontrou nada, em vez de quebrar.
- **O modo local não baixa nada.** Ele só liga o código a arquivos que já existem. Sem uma fonte (URL), não há como obter imagens que só existem nos servidores do Lovable.
- **O modo local só reescreve dois padrões:** `import x from '...asset.json'` com uso apenas de `x.url`, e URLs literais `/__l5e/...`. Qualquer outro uso é mantido e listado no relatório.
- **Pasta `public/`.** Funciona com Vite e TanStack Start, que servem `public/` na raiz. Em outro framework, ajuste `PUBLIC_DIR` no início do script.
- **Se você usar o `--local` e continuar sincronizando com o Lovable**, o `git pull` pode trazer de volta os imports originais. Rode `--local` de novo (é idempotente), ou prefira o modo download nesse fluxo.
- **Imagens por URL externa** (CDN, Unsplash etc.) já funcionam localmente e não passam pelo script.

## Boas práticas

- Rode `--dry-run` primeiro e faça `git status` antes do `--local`.
- Commite `public/images/` se for publicar fora do Lovable.
- No modo download, não versione `.env.local` nem `public/__l5e/`.
- Antes de publicar um projeto em repositório **público**, confira se o `.env` não tem chaves que você não queira expor.

---

## Contribuindo

Issues e pull requests são bem-vindos. Ao reportar um problema, inclua:

- a versão do Node (`node -v`);
- a saída completa do script;
- um exemplo (sem dados sensíveis) de um `*.asset.json` do projeto.

O formato dos ponteiros é o ponto mais provável de quebrar. Se o Lovable mudar, um exemplo do novo formato é tudo de que o ajuste precisa.

## Licença

[MIT](LICENSE)
