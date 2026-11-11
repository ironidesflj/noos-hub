# Publicação do Noos Hub

O repositório GitHub `ironidesflj/noos-hub` é a fonte do projeto. A branch `main` está conectada ao projeto Vercel `noos-hub`; cada push inicia um deploy. `noos.study` é o domínio principal, `www.noos.study` redireciona para ele e `noos-hub.vercel.app` aponta para o mesmo projeto.

## Antes de publicar

```bash
npm ci
npm run build   # 1.031 questões → 2.062 páginas + 1.031 redirects + sitemap
npm run qa      # 61 asserções (fixture; não acende páginas no ar)
```

Confira o diff, faça commit e push na `main`. Depois, confirme que o deploy terminou e abra `https://noos.study/pt/`, `https://noos.study/en/` e uma página de questão de cada manifesto. O build valida os manifestos e gera as páginas e o sitemap. Falhas de build impedem a publicação de um novo deploy.

## Domínio

Os registros DNS são administrados no GoDaddy. Use os valores mostrados em **Vercel → noos-hub → Domains**; eles podem mudar. Não altere o redirecionamento `www` → domínio nu sem atualizar os links canônicos e o sitemap.

O endereço `noos-hub.vercel.app` oferece uma URL alternativa do mesmo deploy. Ele não é uma cópia em hospedagem independente.


## Discussões (Camada de Mielina)

- A UI é nativa; o **GitHub Discussions** (`ironidesflj/noos-hub`, categoria
  Q&A) é o back-end. O compositor da página abre a Discussion com título = ID.
- O job **Sync discussões → dumps** (`.github/workflows/sync-discussao.yml`, diário 06:23 UTC)
  abre PR com `discussao/{PREFIX}.json`. Merge manual.
- Manual: `GITHUB_TOKEN=... node scripts/sync-discussao.mjs` (fora do build).
- Nunca coloque fetch de rede no `build/gera-questoes.mjs`.
- Antes de publicar mudanças da Camada de Mielina, confira `npm run qa`
  (inclui zero iframe do giscus) e o build completo.

## Headers/CSP

A CSP está em **enforce** (`Content-Security-Policy`) desde a 1.6.0: sem
`unsafe-inline` para scripts e sem `giscus.app`. Scripts inline foram
externalizados (`/js/theme-boot.js`, `/js/lang-redirect.js`, `/js/redirect.js`).
Google Fonts segue liberado em `style-src`/`font-src` até o self-host. Antes de
alterar templates, rode o build e teste com um servidor enviando o header.

## Versão do sistema

Qualquer bump de versão deve atualizar **os três juntos**:
`noos.registry.json` (`version`), rodapé `pt/index.html` e rodapé
`en/index.html`; o CI (`sdd-lint`) falha se divergirem. Mantenha
`package.json` alinhado ao registry.


## GitHub App / APIs da Mielina (v2.0.0)

As APIs em `api/mielina/*` usam OAuth de GitHub App (state+PKCE, cookie cifrado).
Configure na Vercel (Production/Preview) — nomes exatos em `.env.example`:

- `MIELINA_GITHUB_CLIENT_ID` (público)
- `MIELINA_GITHUB_CLIENT_SECRET` (nunca commitar)
- `MIELINA_SESSION_SECRET` (32+ bytes aleatórios; rotacionar invalida sessões)
- `MIELINA_BASE_URL=https://noos.study`
- `MIELINA_DISPATCH_TOKEN` (PAT fine-grained com `contents: write` para disparar
  `repository_dispatch`; alternativa: `MIELINA_GITHUB_TOKEN`)
- opcionais: `MIELINA_ALLOWED_ORIGINS` (previews), `MIELINA_REPO`,
  `MIELINA_DISCUSSION_CATEGORY_ID`, `MIELINA_RAW_BASE`

Sem essas variáveis as APIs respondem falha fechada (503/401) e a leitura
estática continua funcionando. O workflow `curadoria-sintese.yml` usa o token
do próprio GitHub Actions (sem segredo extra) e é disparado por
`repository_dispatch` após aprovação/reversão.

## Sync da Mielina

`sync-discussao.yml` roda **de hora em hora** (`23 * * * *`) e é all-or-nothing:
qualquer falha de GraphQL aborta sem alterar `discussao/*.json`. Para rodar
manualmente: `GITHUB_TOKEN=... node scripts/sync-discussao.mjs` (nunca no build).
