# Memória do projeto — Noos Hub (noos.study)

**Atualizado:** 2026-11-11 · **checkout:** `main` @ `d7c2506` · **versão:** 2.0.0.

## Estado verificado (11/11/2026)

- Sistema **2.0.0** (`package.json`, `noos.registry.json`, rodapés PT/EN).
- **1.031 questões:** RAN.jsonl 600 (DBDEA 300 + AZ-900 300) + SYN.jsonl 431.
  Build: 1.031 aceitas / 0 rejeitadas; 2.062 páginas (PT+EN); 1.031 redirects;
  sitemap 1.033.
- **QA:** `npm run qa` PASS (68 asserções no gerador); `node --test` **63/63**
  (política, sync, lib/API, curadoria). Build/QA usam fixture; não acendem o ar.
- **Camada de Mielina v3 (2.0.0):** leitura estática com snapshot datado
  (`syncedAt` UTC); APIs `/api/mielina/*` (OAuth GitHub App state+PKCE, cookie
  AES-256-GCM HttpOnly/Secure/Lax, Origin/CSRF, rate limit, fail-closed);
  apoio único por conta; allowlist de fonte oficial; tiers 1–4 E-estrito;
  curadoria Nível 3 propõe/Nível 4 aprova com `contentHash`+`baseVersion`;
  `revisions[]` append-only; sync horário all-or-nothing com IDs permanentes
  (`subjectId`/`authorId`) e `pendingProposals`.
- **Merges:** #22 (`aa16394`, 5 fases) e #23 (`d7c2506`, degradação graciosa).
  PRs de app: Ranvier #17 e ctfl-app #41 também mergeados.
- **Produção:** noos.study em 2.0.0, CSP enforce; 0 chamadas `/api/mielina/*`
  no load; `▲` sem localStorage; APIs hoje `503 ENV_MISSING` até configurar
  segredos (fail-closed). Guia: `docs/configurar-mielina.md`.
- **Sync:** `sync-discussao.yml` horário (`23 * * * *`), all-or-nothing;
  `discussao/{PREFIX}.json` + `reputation.json` + `official-sources.json`.
- **Ingestão:** `ingest-manifest.yml` valida SHA-256 e abre PR; monitor 15 min.
- **Checklist de aceite:** `noos-orquestra/relatorios/mielina-checklist.md`
  (7 PASS, 2 PARCIAL por dependerem de credenciais/fixture de carga).

## Próximo passo (para nova sessão)

1. **Configurar a participação:** seguir `docs/configurar-mielina.md`
   (GitHub App + `MIELINA_*` na Vercel + redeploy) e validar OAuth/support.
2. Rodar um `repository_dispatch` real para o workflow de curadoria e verificar
   bypass de branch protection.
3. Criar fixture de paginação profunda (>50 comentários, >100 reações) e simular
   timeout real de `/support` para fechar os 2 PARCIAIS.
4. Curadoria editorial: preencher `synthesis.revisions[]` e `pendingProposals`
   reais; o mecanismo já renderiza diff/restauração.
5. Qualquer bump: `package.json` × `noos.registry.json` × rodapés PT/EN iguais.

## Regras que não se quebram (`constitution.md`)

- **Nunca:** hospedar prova jogável; guardar dado privado; emitir ID; assinar
  “by Noos”; ser gargalo (zero manifestos = build verde); usar cor de app como
  interface.
- **Sempre:** devolver ao app; ingerir manifesto no build (nunca runtime);
  alias eterno; fonte única no `noos.registry.json`; PT/EN; tokens de marca.
- Alias eterno e sem reciclagem; `SYN-*` só Synapse, `RAN-*` só Ranvier.
- Mudança de constitution = RFC + semver; versão registry = rodapés (CI).

## Dívidas abertas

- Autenticação/dispatch reais (configuração externa) e os 2 PARCIAIS do checklist.
- Self-host das Google Fonts (CSP libera domínios Google até lá).
- Workflow agendado pode ser desativado após ~60 dias sem atividade.
- Curadoria: conteúdo real de sínteses (mecanismo pronto).
