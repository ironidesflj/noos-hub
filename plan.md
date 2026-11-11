# plan — hub Noos

Revisado em **10/11/2026**. Este plano registra entregas do Hub e dependências
com os apps; o estado operacional fica em `current-state.md`.

## Feito (resumo histórico v7–v13 — out/nov 2026)

- **v7:** SDD no repositório (`constitution.md`, `current-state.md`, `plan.md`,
  `spec-rodape-versao.md`), `noos.registry.json` como fonte única, rodapé com
  versão/build e job `sdd-lint` no CI.
- **v8:** registro da biblioteca alinhado ao npm; verificação de bordas
  320/640/1920 px e 200% zoom.
- **v9–v10:** `spec-pagina-de-questao.md`; implementação de `/q/{ID}` com Axon
  no build; v10.2 com roteamento 100% estático (alias/redirect + 404).
- **v11:** primeiro manifesto real (Ranvier DBDEA, 300) e Synapse (431) com
  zero rejeições; remoção de páginas antigas antes de reconstruir.
- **v13:** transporte automático de manifestos (F2 item 2) via
  `ingest-manifest.yml` + SHA-256; política epitáfio no Axon 0.3.0; monitor de
  disponibilidade.

## Feito — 2026-11-10 · A Camada de Mielina v2 (F2.1 + F2.2, Opção A)

- **Layout dual-column** com coluna da questão sticky (cantoneiras, `Citar ID`,
  alternativas em cartões com âncoras, Gravidade Cross-App) e coluna de
  discussão.
- **Matriz de dissecção A–D**, **Síntese consolidada** (baseline v1 automática
  + versões curadas, diff inline), **reputação/identicon 1–4** (“O Abraço da
  Esfera”), filtros, **ritual “Passei na prova!”** e **compositor guiado** com
  publicação otimista.
- **Opção A:** iframe do giscus **removido**; UI 100% nativa. GitHub
  Discussions (categoria Q&A) é o back-end; o compositor publica e o sync
  periódico gera `discussao/{PREFIX}.json`.
- **Sync (`scripts/sync-discussao.mjs` + workflow horário (`23 * * * *`)):** lê post
  raiz e comentários, parseia alternativa/status/fonte, calcula tier 1–4,
  preserva `synthesis` e abre PR com os dumps. Fora do build (zero fetch no
  gerador).
- **QA ampliado:** **68 asserções** (paridade PT/EN, cantoneiras, matriz,
  síntese, avatares, diff, compositor, zero giscus).
- **Números do último build local:** 1.031 aceitas (RAN 600 + SYN 431),
  2.062 páginas canônicas, 1.031 redirects, sitemap 1.033.
- **Versão do sistema 1.6.0** (registry + rodapés PT/EN) e
  `library.version` 0.3.0; `package.json` alinhado a 1.6.0.

## Feito — 2026-11-10 (2) · hardening e histórico real

- **CSP em enforce:** `Content-Security-Policy` sem `unsafe-inline` para scripts
  e sem `giscus.app`; scripts inline externalizados (`theme-boot`, `lang-redirect`,
  `redirect`); testado localmente com 0 violações em home/questão/redirect/404.
- **Histórico real de síntese:** `synthesis.revisions[]` com diff `#n-1 → #n`
  usando o texto anterior real; dumps sem histórico mostram estado honesto.
- **QA 68 asserções** (fixture); build 1.031/2.062/1.031; versão **1.6.0** (base; a arquitetura v3 sobe para **2.0.0**).

## Em execução — 2026-11-11 · Arquitetura definitiva da Mielina (v3)

- **Fase 1:** política única (`build/lib/mielina-policy.mjs`) com apoiadores
  únicos, allowlist de fonte oficial e tiers E-estrito + testes unitários.
- **Fase 2:** sync reescrito com paginação completa (discussions/comments/
  replies/reactions), all-or-nothing, dedupe de discussões, IDs permanentes,
  higiene de procedência, `reputation.json` e preservação de `synthesis`.
  Workflow horário.
- **Fase 3/4:** APIs `/api/mielina/*` + workflow `curadoria-sintese.yml`
  (GitHub App OAuth/PKCE, cookie cifrado, gates/hashes/idempotência).
- **Fase 5:** UI com snapshot datado, voto via API (sem localStorage),
  propostas/aprovação/restauração inline, rótulos de fonte/tier.
- **Versão 2.0.0**; checklist de aceite em
  `noos-orquestra/relatorios/mielina-checklist.md`.
- **Bloqueio externo:** configurar GitHub App + segredos (`GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
  `MIELINA_SESSION_SECRET`) na Vercel para validar auth/API em produção.

## Feito — 2026-11-11 · Arquitetura Mielina v3 (2.0.0)

- Five phases implementadas e mergeadas (#22 `aa16394`, #23 `d7c2506`);
  produção 2.0.0; 63 testes Node + QA 68; CSP enforce.
- Checkout local reconciliado em `d7c2506`; guia de credenciais criado.
- Hotfixes pós-checklist (mesmo dia): replies do sync deixaram de ser
  descartadas (`replies { totalCount }` + `fetchAllReplies`), custo GraphQL
  ajustado ao limite de nós do GitHub real (validação `--dry` exit 0) e timeout
  real nas chamadas ao GitHub (`504 GITHUB_TIMEOUT` + reconciliação do cliente).
  74 testes Node verdes.

## Pendente

- **Configuração externa:** GitHub App + `MIELINA_*` na Vercel + redeploy, e
  validação de OAuth/dispatch (`docs/configurar-mielina.md`).
- **Curadoria da síntese:** fluxo editorial para transformar contribuições
  aprovadas em versão consolidada (hoje o dump permite síntese manual, e o
  baseline v1 cobre o resto).
- **Histórico de revisões:** mecanismo implementado (`synthesis.revisions[]`,
  diff real quando há ≥2 revisões); falta a **curadoria preencher** os dumps
  atuais e definir a reversão auditável (gate Nível 4).
- **Promoção automática de “resposta aceita”** e gates de reputação completos
  (o tier já é derivado; falta vínculo com resposta aceita).
- **Self-host das Google Fonts** (a CSP enforce libera `fonts.googleapis.com`/
  `fonts.gstatic.com` por enquanto); monitor do GitHub (workflow agendado é
  desativado após ~60 dias sem atividade); avaliar Next.js só se a F2 pedir
  mais interação.

## Adiado (intencionalmente)

- Upgrade para Next.js (desenho já previsto; componentes/tokens entram como estão).
- CSP com hashes, self-host de fontes, CSS de impressão.
- Cloudflare Pages como segundo espelho.

## Fora de escopo (deste repositório, para sempre)

- Prova jogável, progresso, conta, cronômetro — o hub nunca (constitution,
  "o hub nunca" 1–3).
- Emissão de ID — o hub registra e valida; nunca emite.
- Especificação dos apps e do pacote Axon — moram nos repositórios deles.
