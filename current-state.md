# Estado atual — Noos Hub

Revisão documental: **10/11/2026** · versão do sistema: **1.5.0**.

> **Nota operacional (10/11/2026):** este checkout está **33 commits atrás de `origin/main`** e recebeu a implementação da Camada de Mielina v2 como mudanças não commitadas. Antes de publicar: reconciliar com `origin/main`, rodar `npm ci && npm run build && npm run qa` e só então commit/push (ver `memory.md`).

## Publicado no Hub

- `noos.study` é o endereço principal. `www.noos.study` redireciona para ele; `noos-hub.vercel.app` é outra URL do mesmo projeto Vercel.
- Interface PT/EN e páginas estáticas de leitura de questões. O build consome `manifestos/*.jsonl`, valida cada linha pelo Axon `@ironidesflj/axon@0.3.0` (devDependency com pin exato, nada do pacote no output), gera as páginas e atualiza o sitemap.
- **1.031 questões publicadas:** `RAN.jsonl` 600 (Ranvier — DBDEA 300 + AZ-900 300) e `SYN.jsonl` 431 (Synapse — CTFL/CTAL-TA/CTAL-TM). No último build local: **1.031 aceitas, 0 rejeitadas, 2.062 páginas canônicas (PT+EN), 1.031 redirects sem idioma** e **sitemap com 1.033 entradas** (2 da base + 1.031 PT).
- As páginas publicam o gabarito como **texto da alternativa correta** (v12, decisões D1+D3), derivado de `snapshot.answer` (letra A–D **ou** texto, resolvido pelo gerador) e `snapshot.options`; a letra isolada não é publicada. `npm run qa` tem assert de paridade página ↔ manifesto por questão e idioma.
- **Questões retiradas seguem a política epitáfio (Axon 0.3.0):** página canônica mantida com aviso, sem bloco de gabarito, no sitemap; alias continua resolvendo.
- **Headers de segurança:** CSP em `Content-Security-Policy-Report-Only` + `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (ver `vercel.json`).
- **CI:** placeholders, paridade PT/EN, referências locais, geração das páginas, `npm run qa` (**61 asserções**), sitemap e `sdd-lint` (registro ↔ rodapés PT/EN).
- **Monitoramento:** `.github/workflows/monitor.yml` checa hub/apps a cada 15 min e abre/fecha issue em falha.

## A Camada de Mielina v2 (F2.1 + F2.2 — Opção A)

Página `/q/{ID}/` dual-column (≥1024px), questão sticky à esquerda e discussão à direita:

- **Coluna da questão:** cabeçalho dentro de cartão com cantoneiras, botão **Citar ID**, alternativas em cartões clicáveis com âncoras de discussão (`✓` gabarito, `⚠️` pegadinha, `💬` debater), bloco de proveniência e **Gravidade Cross-App**.
- **Matriz de dissecção (A–D):** distribuição das contribuições; gabarito em `--accent`, pegadinha mais debatida em `--signal`; clicar filtra.
- **Síntese consolidada:** versão curada quando existe dump; caso contrário **baseline v1 automática** com o gabarito e a fonte oficial do manifesto; botão de **Diff inline** (`v(n-1) → v(n)`) com gate de reputação.
- **Reputação/“Abraço da Esfera”:** identicon determinístico 5×5 + 4 níveis SVG; **tier derivado no sync** (reações, fontes, aprovação, respostas aceitas) com overrides em `discussao/authors.json`; botão **▲ Acelerar** com persistência local.
- **Ritual “Passei na prova!”:** `?ritual=passed&trap=C`, flair e compositor guiado; **publicação otimista** do card + abertura da Discussion pré-preenchida no GitHub.
- **Sem iframe do giscus (Opção A):** toda a UI é nativa. O **GitHub Discussions** (`ironidesflj/noos-hub`, categoria Q&A) é o back-end: o compositor publica com título = ID e corpo estruturado; o **sync diário** (`sync-discussao.yml`, 06:23 UTC) lê post raiz + comentários, calcula tiers, **preserva `synthesis`** e abre PR com `discussao/{PREFIX}.json`.
- **Degradação graciosa:** sem JS, questão, gabarito, síntese e contribuições seguem legíveis; sem dump, estado orientador (nada é inventado).

## Coordenação com apps

- O Hub ingere manifestos por **PR automático (F2)**: `.github/workflows/ingest-manifest.yml` baixa o `manifest.jsonl` do app, confere o SHA-256 e abre PR idempotente; merge manual. Cópia manual continua como fallback. Token `HUB_SYNC_TOKEN` nos apps.
- Ranvier publica o manifesto (DBDEA + AZ-900); a URL do hub usada pelo app depende de `NEXT_PUBLIC_NOOS_HUB_URL` no projeto Vercel do Ranvier — fora deste repositório.
- Synapse publica 431 questões de estudo; links de comunidade no app são responsabilidade do repositório do Synapse.
- Axon `0.3.0` publicado (`retired`/`isRetired`); ver `library.version` em `noos.registry.json`.

## Verificação (10/11/2026)

- `npm run qa` → **61/61 PASS** (fixture; inclui paridade PT/EN, cantoneiras, 4 níveis de avatar, diff, compositor e zero iframe do giscus).
- `npm run build` → **1.031 aceitas / 0 rejeitadas**, 2.062 páginas canônicas, 1.031 redirects, sitemap com 1.033 entradas.
- Layout verificado em 320 px, 640 px (200% zoom em 1280) e 1920 px sem overflow horizontal; sticky com scroll interno.
- **Pendências conhecidas:** histórico de revisões real (o diff atual compara as duas últimas versões do dump), fluxo de curadoria da síntese, promoção automática de “resposta aceita”, CSP em enforce e reconciliação do checkout com `origin/main`.

## Limites

O Hub não guarda progresso nem respostas e não hospeda provas jogáveis. O pacote Axon é dependência de build, sem código no navegador. A URL `vercel.app` não oferece redundância de hospedagem independente. O GitHub Discussions é serviço externo: se estiver offline, a leitura estática e o último dump continuam servindo.
