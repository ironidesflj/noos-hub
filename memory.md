# Memória do projeto — Noos Hub (noos.study)

**Atualizado:** 2026-11-10 · **checkout:** `main` @ c418b7b + implementação F2.2 no working tree (não commitada; 33 commits atrás de `origin/main`).
**O que é:** a marca-mãe do ecossistema Noos — vitrine bilíngue PT/EN e páginas públicas de leitura `/q/{ID}`. Não é sexto app, não hospeda estudo, não guarda aluno (`constitution.md`). Não repete o que já está em `current-state.md`, `plan.md` e `noos.registry.json` — referencia.

## Estado verificado (10/11/2026)

- Sistema **v1.6.0** (`package.json`, `noos.registry.json`, rodapés PT/EN).
- **1.031 questões publicadas:** `RAN.jsonl` 600 (DBDEA 300 + AZ-900 300) + `SYN.jsonl` 431. Build → 1.031 aceitas, 0 rejeitadas, **2.062 páginas canônicas** e **1.031 redirects**; `sitemap.xml` com **1.033 entradas** (2 base + 1.031 PT).
- `npm run qa` → **61/61 PASS** (fixture; não acende páginas no ar).
- Axon `@ironidesflj/axon@0.3.0` como devDependency com pin exato; nada do pacote no output servido.
- **Camada de Mielina v2 (F2.1+F2.2, Opção A):** dual-column, matriz de dissecção, síntese baseline/curada + diff inline, reputação/identicon 1–4, filtros, ritual `?ritual=passed`, compositor guiado com card otimista. **Sem iframe do giscus**; GitHub Discussions é o back-end via compositor + sync diário (`sync-discussao.yml`, 06:23 UTC), que gera `discussao/{PREFIX}.json`, calcula tiers, preserva `synthesis` e abre PR. O build **nunca** faz fetch.
- **Ingestão F2:** `ingest-manifest.yml` baixa manifesto do app, confere SHA-256 e abre PR; monitor a cada 15 min.
- **Epitáfio:** Axon 0.3.0; questão retirada mantém página com aviso, sem gabarito, no sitemap.

## Nota operacional (importante antes de publicar)

Este checkout **não está sincronizado**: `HEAD` local = `c418b7b` (33 commits atrás de `origin/main`) e a implementação da Camada de Mielina está no working tree sem commit. Antes de qualquer deploy: `git fetch origin && git rebase/merge origin/main` (resolver conflitos), `npm ci && npm run build && npm run qa`, revisar `git diff` e só então commit/push. Não publicar direto deste working tree.

## Regras que não se quebram (`constitution.md`)

- **Nunca:** hospedar prova jogável; guardar dado privado de estudo; emitir ID (o hub é registro, não emissor); assinar "by Noos"; ser gargalo (zero manifestos = build verde e site inalterado); usar cor de app como interface.
- **Sempre:** devolver o usuário ao app; ingerir manifesto no build (nunca consultar app em runtime; linha inválida rejeitada com log e build segue); honrar ID publicada (alias eterno, nunca 404); publicar a fonte única em `noos.registry.json`; bilíngue PT/EN de nascença; identidade em `assets/noos-tokens.css`.
- Alias é eterno e sem reciclagem; prefixo é a marca pública do app; só o app dono emite o seu namespace (`SYN-*` só do Synapse, `RAN-*` só do Ranvier).
- Mudança de constitution = RFC + entrada com semver do sistema; versão do registry = versão nos rodapés (CI `sdd-lint`).

## Dívidas abertas

- **Curadoria da síntese** (hoje baseline v1 automática + edição manual do dump) e **histórico de revisões real** (diff compara as duas últimas).
- **Promoção automática de “resposta aceita”** e gates completos de reputação (tier já derivado no sync).
- **Self-host das Google Fonts** (CSP enforce libera os domínios do Google até lá); workflow agendado pode ser desativado pelo GitHub após ~60 dias sem atividade.
- **Reputação/upvote:** `▲ Acelerar` é local e não entra no tier (que deriva de reações do GitHub); decisão de produto pendente — proposta de manter a UI e separar os contadores (não desfazer a Mielina v2).
- **Hardening/histórico (10/11, 1.6.0):** CSP enforce com scripts inline externalizados; `synthesis.revisions[]` renderiza diff real quando há ≥2 revisões; QA 61; documentação atualizada.
- **Specs reconciliadas (10/11):** `spec-pagina-de-questao.md` atualizada para a v10.2/v12 + item 6 (Mielina) e `spec-discussao-questao.md` marcada como implementada (Opção A); rotas antigas (`api/q.js`, 301/308 de função) agora têm nota de superação explícita.

## Próximo passo

1. Reconciliar com `origin/main` (ver nota operacional) e publicar a versão 1.5.0.
2. Rodar `npm ci && npm run build && npm run qa` (cache: `npm_config_cache="$PWD/.npm-cache"`).
3. Curadoria: transformar contribuições reais em `synthesis` versionada e inaugurar a Camada de Mielina nas questões-âncora.
4. Qualquer bump: `package.json` × `noos.registry.json` × rodapé PT/EN iguais.
