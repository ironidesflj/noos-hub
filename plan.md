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
- **Sync (`scripts/sync-discussao.mjs` + workflow diário 06:23 UTC):** lê post
  raiz e comentários, parseia alternativa/status/fonte, calcula tier 1–4,
  preserva `synthesis` e abre PR com os dumps. Fora do build (zero fetch no
  gerador).
- **QA ampliado:** **61 asserções** (paridade PT/EN, cantoneiras, matriz,
  síntese, avatares, diff, compositor, zero giscus).
- **Números do último build local:** 1.031 aceitas (RAN 600 + SYN 431),
  2.062 páginas canônicas, 1.031 redirects, sitemap 1.033.
- **Versão do sistema 1.5.0** (registry + rodapés PT/EN) e
  `library.version` 0.3.0; `package.json` alinhado a 1.5.0.

## Pendente

- **Reconciliar o checkout local** com `origin/main` (o working tree estava 33
  commits atrás) antes de publicar; rodar `npm ci && npm run build && npm run qa`
  e commit na `main`.
- **Curadoria da síntese:** fluxo editorial para transformar contribuições
  aprovadas em versão consolidada (hoje o dump permite síntese manual, e o
  baseline v1 cobre o resto).
- **Histórico de revisões real:** o diff atual compara as duas últimas versões;
  falta dump de revisões anteriores e reversão auditável.
- **Promoção automática de “resposta aceita”** e gates de reputação completos
  (o tier já é derivado; falta vínculo com resposta aceita).
- **CSP em enforce** (hoje Report-Only); monitor do GitHub (workflow agendado é
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
