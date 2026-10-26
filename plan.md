# plan — hub Noos

Out/2026 · três pistas: **hub**, **biblioteca (Axon)** e **apps** (esta
última mora nos repositórios dos apps — aqui só o que o hub espera deles).

## Autorizado (nesta v7 — feito)

- ✅ SDD no repositório: `constitution.md`, `current-state.md`, `plan.md`,
  `spec-rodape-versao.md`.
- ✅ `noos.registry.json` como fonte única do registro (sistema v1.1.1),
  validado pelo CI.
- ✅ Rodapé com versão do sistema e data de build em PT e EN.
- ✅ Job `sdd-lint` no CI (arquivos canônicos + registro em sincronia).

## Feito (mantenedor)

- **Push da v7** — concluído; a Vercel faz o deploy automático.
- **INPI** — cancelado pelo mantenedor em out/2026; não faz parte do plano.
- **Domínio primário** — `noos.study` configurado como primário; `www` faz
  redirect 308 para o domínio nu.

## Feito (v8 — out/2026)

- ✅ **Registro da biblioteca alinhado ao npm** — `library.version` →
  `0.2.2`, fase "publicada" (o pacote `@ironidesflj/axon` está público
  desde 26/out/2026, com o Ranvier como consumidor #1 — fatia 1).
- ✅ **Verificação de bordas 320 e 1920 px + 200% zoom** — item do
  checklist do Guia de atualização fechado com evidência: noos.study
  auditado ao vivo (PT e EN) em 320, 640 (equivalente a 200% zoom em 1280)
  e 1920 px — zero overflow horizontal e zero elementos fora da viewport.
  Cabeçalho em 2 linhas sem scroll interno a 320 px; conteúdo contido pelo
  `.wrap` (1160 px) a 1920 px.

## Feito (v9 — out/2026)

- ✅ **Spec da página `/q/{ID}` escrita (proposta v1)** —
  `spec-pagina-de-questao.md`: rotas e alias 301 (constitution §3), geração
  no build com o parser do Axon (§2), página de leitura com proveniência e
  volta ao app (§1), zero manifestos = site inalterado. Primeiro item de
  engenharia da Fase 2 desenhado; implementação em lote próprio após OK.

## Feito (v10 — out/2026)

- ✅ **Página `/q/{ID}` implementada (rota no ar)** — `spec-pagina-de-questao.md`
  v1: geração estática no build com o parser do Axon (devDependency com pin
  exato — zero Axon no output servido), alias 301 e forma sem idioma 308 via
  função burra (`api/q.js`), sitemap gerado, sistema v1.2.0 com campo `url`
  opcional por namespace no registro. Zero manifestos = site inalterado — as
  páginas acendem com o primeiro `manifestos/{PREFIXO}.jsonl`. Lote validado
  localmente: build zero-manifestos idêntico byte a byte, QA do fixture 20/20,
  função de rota 8/8.

## Pendente (Fase 2 — engenharia do hub)

- **Ingestão de manifestos no build** — consumir os `manifest.jsonl`
  publicados pelos apps conforme o contrato do Axon (linha inválida → log;
  último build bom segue servindo).
- **Discussões por questão** — ligar a página ao quadro (GitHub Discussions
  primeiro; ritual "Passei na prova!").

## Adiado (intencionalmente)

- Upgrade para Next.js (quando a F2 pedir interação real — desenho já
  previsto na Carta cap. 8; componentes e tokens entram como estão).
- CSP com hashes para scripts inline, self-host de fontes, CSS de impressão
  (backlog P2 da Revisão do Time).
- Cloudflare Pages como segundo espelho.

## Fora de escopo (deste repositório, para sempre)

- Prova jogável, progresso, conta, cronômetro — o hub nunca (constitution,
  "o hub nunca" 1–3).
- Emissão de ID — o hub registra e valida; nunca emite.
- Especificação dos apps e do pacote Axon — moram nos repositórios deles
  (o hub consome o contrato, não o define).
