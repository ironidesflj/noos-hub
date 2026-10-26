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

## Pendente (Fase 2 — engenharia do hub)

- **Página `/q/{ID}`** — renderização estática da questão a partir do
  snapshot do manifesto, com proveniência e link para o app (spec a escrever:
  `spec-pagina-de-questao.md`).
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
