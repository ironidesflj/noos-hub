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

## Versão do sistema

Qualquer bump de versão deve atualizar **os três juntos**:
`noos.registry.json` (`version`), rodapé `pt/index.html` e rodapé
`en/index.html`; o CI (`sdd-lint`) falha se divergirem. Mantenha
`package.json` alinhado ao registry.
