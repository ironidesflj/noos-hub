# Estado atual — Noos Hub

Revisão documental: **11/11/2026** · versão do sistema: **2.0.0** (arquitetura definitiva da Mielina).

## Publicado no Hub

- `noos.study` é o endereço principal. `www.noos.study` redireciona para ele; `noos-hub.vercel.app` é outra URL do mesmo projeto Vercel.
- Interface PT/EN e páginas estáticas de leitura de questões. O build consome `manifestos/*.jsonl`, valida cada linha pelo Axon `@ironidesflj/axon@0.3.0` (devDependency com pin exato, nada do pacote no output), gera as páginas e atualiza o sitemap.
- **1.031 questões publicadas:** `RAN.jsonl` 600 (Ranvier — DBDEA 300 + AZ-900 300) e `SYN.jsonl` 431 (Synapse — CTFL/CTAL-TA/CTAL-TM). No último build local: **1.031 aceitas, 0 rejeitadas, 2.062 páginas canônicas (PT+EN), 1.031 redirects sem idioma** e **sitemap com 1.033 entradas** (2 da base + 1.031 PT).
- As páginas publicam o gabarito como **texto da alternativa correta** (v12, decisões D1+D3), derivado de `snapshot.answer` (letra A–D **ou** texto, resolvido pelo gerador) e `snapshot.options`; a letra isolada não é publicada. `npm run qa` tem assert de paridade página ↔ manifesto por questão e idioma.
- **Questões retiradas seguem a política epitáfio (Axon 0.3.0):** página canônica mantida com aviso, sem bloco de gabarito, no sitemap; alias continua resolvendo.
- **Arquitetura Mielina v3 (2.0.0):** leitura 100% estática com `syncedAt` (UTC) visível; APIs `/api/mielina/*` (GitHub App OAuth + cookie cifrado) para apoio, comentário, proposta/aprovação/restauração; IDs permanentes (`subjectId`/`authorId`); apoio único por conta; allowlist de fontes oficiais; tiers 1–4 com E estrito; curadoria com `contentHash`/`baseVersion` em workflow protegido; sync horário all-or-nothing. Ver `spec-discussao-questao.md` §7 e `discussao/README.md`.
- **Headers de segurança:** CSP em **enforce** (`Content-Security-Policy`, sem `unsafe-inline` para scripts e sem domínios do giscus; Google Fonts liberado em `style-src`/`font-src` até o self-host) + `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (ver `vercel.json`).
- **CI:** placeholders, paridade PT/EN, referências locais, geração das páginas, `npm run qa` (**68 asserções**), sitemap e `sdd-lint` (registro ↔ rodapés PT/EN).
- **Monitoramento:** `.github/workflows/monitor.yml` checa hub/apps a cada 15 min e abre/fecha issue em falha.

## A Camada de Mielina v2 (F2.1 + F2.2 — Opção A)

Página `/q/{ID}/` dual-column (≥1024px), questão sticky à esquerda e discussão à direita:

- **Coluna da questão:** cabeçalho dentro de cartão com cantoneiras, botão **Citar ID**, alternativas em cartões clicáveis com âncoras de discussão (`✓` gabarito, `⚠️` pegadinha, `💬` debater), bloco de proveniência e **Gravidade Cross-App**.
- **Matriz de dissecção (A–D):** distribuição das contribuições; gabarito em `--accent`, pegadinha mais debatida em `--signal`; clicar filtra.
- **Síntese consolidada:** versão curada quando existe dump; caso contrário **baseline v1 automática** com o gabarito e a fonte oficial do manifesto. O dump aceita `synthesis.revisions[]`; quando há ≥2 revisões arquivadas, o botão **Diff** mostra o **histórico real** (`#n-1 → #n`) com o texto anterior e a fonte da revisão; sem histórico arquivado, a página informa “histórico a partir da próxima curadoria” (nunca inventa revisão).
- **Reputação/“Abraço da Esfera”:** identicon determinístico 5×5 + 4 níveis SVG; **tier derivado no sync** (reações, fontes, aprovação, respostas aceitas) com overrides em `discussao/authors.json`; botão **▲ Acelerar** com persistência local.
- **Ritual “Passei na prova!”:** `?ritual=passed&trap=C`, flair e compositor guiado; **publicação otimista** do card + abertura da Discussion pré-preenchida no GitHub.
- **Sem iframe do giscus (Opção A):** toda a UI é nativa. O **GitHub Discussions** (`ironidesflj/noos-hub`, categoria Q&A) é o back-end: o compositor publica com título = ID e corpo estruturado; o **sync horário** (`sync-discussao.yml`, `23 * * * *`) lê post raiz + comentários, calcula tiers, **preserva `synthesis`** e abre PR com `discussao/{PREFIX}.json`.
- **Degradação graciosa:** sem JS, questão, gabarito, síntese e contribuições seguem legíveis; sem dump, estado orientador (nada é inventado).

## Coordenação com apps

- O Hub ingere manifestos por **PR automático (F2)**: `.github/workflows/ingest-manifest.yml` baixa o `manifest.jsonl` do app, confere o SHA-256 e abre PR idempotente; merge manual. Cópia manual continua como fallback. Token `HUB_SYNC_TOKEN` nos apps.
- Ranvier publica o manifesto (DBDEA + AZ-900); a URL do hub usada pelo app depende de `NEXT_PUBLIC_NOOS_HUB_URL` no projeto Vercel do Ranvier — fora deste repositório.
- Synapse publica 431 questões de estudo; links de comunidade no app são responsabilidade do repositório do Synapse.
- Axon `0.3.0` publicado (`retired`/`isRetired`); ver `library.version` em `noos.registry.json`.

## Verificação (11/11/2026)

- `npm run qa` → **PASS** (68 asserções no gerador); `node --test build/lib/mielina-policy.test.mjs scripts/sync-discussao.test.mjs tests/*.test.mjs` → **74/74** (63 de base + 4 de paginação profunda/replies + 7 de timeout do apoio; fixture cobre paridade PT/EN, cantoneiras, 4 níveis de avatar, diff, compositor e zero iframe do giscus).
- `npm run build` → **1.031 aceitas / 0 rejeitadas**, 2.062 páginas canônicas, 1.031 redirects, sitemap com 1.033 entradas.
- **Sync real (`--dry`, 11/11/2026):** `[dry] 2 questões; 1 autores`, exit 0 — a `Q_DISCUSSIONS` nova (comments + `replies { totalCount }` + reactions inline) foi aceita pelo GitHub real.

### Correções de 11/11/2026

- **Replies silenciosamente descartadas:** `COMMENT_FIELDS` não pedia `replies`; `completeReplies()` recebia `undefined`, devolvia `[]` e TODO autor de resposta ficava fora da reputação/tiers. Agora `COMMENT_FIELDS` pede `replies { totalCount }` e `fetchAllReplies()` pagina `Q_REPLIES` do cursor nulo **só** para comentários com respostas (`tests/sync-pagination.test.mjs`).
- **Limite de nós do GraphQL:** a 1ª tentativa de fix inlinava `replies(first:50)` sob `comments(first:50)`; o GitHub real rejeitou com `MAX_NODE_LIMIT_EXCEEDED` (50×50×50×100 = 12,5M nós > 500k). Custo atual: comments(50)×reactions(100) = 250k; replies(50)×reactions(100) = 5k por página. O fixture offline modela esse erro (`rejected`).
- **Timeout real do apoio:** `GitHubClient.graphql()/rest()` usam `AbortController` + `setTimeout` (`MIELINA_GITHUB_TIMEOUT_MS`, default 10 s, teto 60 s) e devolvem `504 GITHUB_TIMEOUT`; o POST de apoio no cliente aborta em 12 s e reconcilia por `GET /support` (contador autoritativo, sem soma local) — `tests/mielina-timeout.test.mjs`.
- Layout verificado em 320 px, 640 px (200% zoom em 1280) e 1920 px sem overflow horizontal; sticky com scroll interno.
- **CSP enforce testado localmente** com servidor enviando o header: 0 violações em home, questão, redirect e 404; tema e filtros funcionando; scripts inline eliminados (`js/theme-boot.js`, `js/lang-redirect.js`, `js/redirect.js`).
- **Pendências conhecidas:** configurar GitHub App/segredos na Vercel (`docs/configurar-mielina.md`) e validar o checklist (auth/API dependem de credenciais); curadoria editorial das sínteses (o schema de `revisions` está pronto, mas os dumps atuais ainda não têm histórico arquivado), promoção automática de “resposta aceita”, self-host das Google Fonts (hoje liberadas na CSP) e testes de CSP no preview. Cruzamento de reputação com upvote local segue em estudo (documentado no `plan.md`).

## Limites

O Hub não guarda progresso nem respostas e não hospeda provas jogáveis. O pacote Axon é dependência de build, sem código no navegador. A URL `vercel.app` não oferece redundância de hospedagem independente. O GitHub Discussions é serviço externo: se estiver offline, a leitura estática e o último dump continuam servindo.
