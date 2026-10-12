# fetch-lovable-assets

Baixa localmente as imagens de projetos [Lovable](https://lovable.dev) para que elas apareçam quando você roda o projeto na sua máquina. Sem dependências, só Node 18+.

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
  "url": "/__l5e/assets-v1/e444e576-.../hero.jpg",
  "size": 270081,
  "content_type": "image/jpeg"
}
```

O código usa esse `url` no `<img>`, mas o caminho `/__l5e/...` só existe nos servidores do Lovable. Localmente o Vite devolve 404.

## A solução

O script lê todos os `*.asset.json` do projeto e baixa cada imagem do site publicado para `public/`, **reproduzindo o mesmo caminho** do `url`:

```
public/__l5e/assets-v1/e444e576-.../hero.jpg
```

O Vite serve `public/` na raiz do site, então o caminho original passa a funcionar localmente **sem nenhuma alteração no código**. Você continua sincronizando com o Lovable (`git pull`) sem conflitos.

---

## Instalação rápida

Na **raiz do projeto Lovable** (onde está o `package.json`), troque `SEU-USUARIO` e a URL do site:

```bash
curl -fsSL https://raw.githubusercontent.com/SEU-USUARIO/fetch-lovable-assets/main/install.sh \
  | bash -s -- https://nome-do-projeto.lovable.app
```

O instalador:

1. copia o script para `scripts/fetch-lovable-assets.mjs`;
2. grava `LOVABLE_URL` no `.env.local`;
3. adiciona `"predev"` ao `package.json`, para o script rodar antes do `npm run dev`;
4. adiciona `public/__l5e/` e `.env.local` ao `.gitignore`;
5. baixa as imagens uma vez.

Ele é **idempotente** e **não sobrescreve nada**: se já existir um `predev` diferente, ou um `LOVABLE_URL` no `.env.local`, ele avisa e mantém o que existe.

Opções do instalador:

| Opção | Efeito |
|---|---|
| `URL` (posicional) | URL publicada do site. Se omitida, você configura o `.env.local` depois. |
| `--no-run` | Não executa o download ao final. |
| `-h`, `--help` | Mostra a ajuda. |

### Alternativa: clonar o repositório

```bash
git clone https://github.com/SEU-USUARIO/fetch-lovable-assets.git ~/tools/fetch-lovable-assets

# dentro de cada projeto Lovable:
bash ~/tools/fetch-lovable-assets/install.sh https://nome-do-projeto.lovable.app
```

### Alternativa: instalação manual

```bash
mkdir -p scripts
curl -fsSL https://raw.githubusercontent.com/SEU-USUARIO/fetch-lovable-assets/main/fetch-lovable-assets.mjs \
  -o scripts/fetch-lovable-assets.mjs

echo "LOVABLE_URL=https://nome-do-projeto.lovable.app" > .env.local
npm pkg set scripts.predev="node scripts/fetch-lovable-assets.mjs"
printf 'public/__l5e/\n.env.local\n' >> .gitignore
```

> **Segurança:** `curl | bash` executa código baixado da internet. Leia o [`install.sh`](install.sh) antes de rodar e, se quiser, fixe uma versão trocando `main` por uma tag (por exemplo `v1.0.0`) na URL.

---

## Descobrindo a URL do site

No Lovable, clique em **Publish**. A URL tem o formato `https://nome-do-projeto.lovable.app`, ou é o seu domínio próprio, se você configurou um.

Use a **URL publicada**. A URL de preview (`preview--...lovable.app/?__lovable_receipt=...`) tem um token temporário e pode exigir login. Se não houver outra opção, informe também o token:

```
LOVABLE_URL=https://preview--nome-do-projeto.lovable.app
LOVABLE_RECEIPT=mat_xxxxxxxxxxxxxxxx
```

---

## Uso no dia a dia

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

---

## Como funciona

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
| `LOVABLE_URL não está definida` | Falta o `.env.local`. | Crie-o com `LOVABLE_URL=...`. |
| `resposta não parece uma imagem (content-type: text/html)` | A URL exige login, o token expirou ou o projeto não está publicado. | Publique o projeto e use a URL publicada, sem `?__lovable_receipt=`. |
| `HTTP 404` | URL base errada, ou a imagem foi removida no Lovable. | Abra a `LOVABLE_URL` no navegador para conferir. |
| `HTTP 401` / `403` | Projeto privado. | Use um preview com `LOVABLE_RECEIPT`, ou torne o site público. |
| Imagens continuam quebradas depois do download | Cache do navegador, ou o servidor não percebeu os arquivos novos. | Ctrl+F5; se persistir, reinicie o `npm run dev`. |
| Imagem nova no Lovable não aparece local | Os ponteiros ainda não foram sincronizados. | `git pull` e depois `npm run dev`. |
| `Nenhum *.asset.json encontrado` | O projeto não usa ponteiros. | Nada a fazer: as imagens já são arquivos reais. |
| Já editei o código para apontar para `/images/...` | Correção manual anterior. | Reverta com `git checkout src/` e use o script. |

Para conferir que os arquivos baixados são imagens de verdade:

```bash
find public/__l5e -type f -exec file {} \;
```

Se algum aparecer como `HTML document`, apague `public/__l5e/` e rode de novo com a URL correta.

---

## Limitações

- **Depende do formato do Lovable.** O script espera ponteiros `*.asset.json` com o campo `url` iniciando por `/`. Se o formato mudar, ele avisa que não encontrou nada, em vez de quebrar.
- **Pasta `public/`.** Funciona com Vite e TanStack Start, que servem `public/` na raiz. Em outro framework, ajuste `PUBLIC_DIR` no início do script.
- **Precisa de internet** e do projeto publicado, ao menos na primeira execução.
- **Só cobre assets com ponteiro.** Imagens por URL externa (CDN, Unsplash etc.) já funcionam localmente.

## Boas práticas

- Faça `git pull` antes de rodar, para os ponteiros novos existirem localmente.
- **Não edite o código** para trocar `/__l5e/...` por outros caminhos. Isso desfaz a vantagem do script e gera conflitos na próxima sincronização.
- Não versione `.env.local` nem `public/__l5e/`.
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
