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

## Feito (v10.1 — out/2026)

- ✅ **Fix de routing da rota `/q/{ID}`** — rewrites por `:id` de segmento
  único, com e sem barra final, e `handle: filesystem` para preservar as
  páginas canônicas estáticas. O fixture de QA fica fora do deploy via
  `.vercelignore`.

## Feito (v10.2 — out/2026)

- ✅ **Roteamento `/q/{ID}` 100% estático** — o build gera páginas canônicas
  e páginas de redirecionamento para aliases e URLs sem idioma (200 com
  refresh e canonical). Função e rewrites removidos; desconhecidas recebem
  o 404 estático. Sistema permanece v1.2.0.

## Feito (v11 — out/2026)

- **Primeiro manifesto real ingerido:** Ranvier DBDEA, 300 questões em
  `manifestos/RAN.jsonl`, zero rejeições no build. O QA da saída real passou;
  o gerador agora remove páginas antigas antes de reconstruí-las.
- **Manifesto Synapse integrado:** 431 questões dos pools de estudo
  CTFL/CTAL-TA/CTAL-TM em `manifestos/SYN.jsonl`, com zero rejeições no build.
  Ativar links no app somente após verificar as URLs públicas (PR #15).

## Pendente (Fase 2 — engenharia do hub)

- **Transporte e retenção dos manifestos:** automatizar a atualização dos
  arquivos publicados pelos apps e definir o comportamento para questões
  retiradas do manifesto (F2 item 2). Hoje RAN e SYN são copiados e
  validados no build; o último deploy bem-sucedido permanece no ar se um
  build falhar.
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
