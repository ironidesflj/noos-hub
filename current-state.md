# current-state — hub Noos (noos.study)

Última verificação: out/2026 · pacote v8 · sistema v1.1.1

## No ar (verificado)

- **Domínios funcionando:** `noos.study` (primário na Vercel),
  `www.noos.study` (308 → noos.study, path preservado),
  `noos-hub.vercel.app` (backup canônico). DNS GoDaddy → Vercel operacional
  desde 23/10.
- **Bordas verificadas (v8):** 320, 640 (200% zoom de 1280) e 1920 px,
  PT e EN — zero overflow horizontal, zero elementos fora da viewport.
- **Deploy no ar: pacote v7**, atualizado pelos commits `01a5927`, `3b44aba`
  e `e0867e6`, com o alinhamento posterior do registry em `639c4fb`.
  O pacote v7 acumulou as alterações da v6+v7.

## Estado do pacote (v8, este)

- **v8 (out/2026):** registro da biblioteca alinhado ao npm (`0.2.2`, fase
  "publicada") e verificação de bordas 320/640/1920 px fechada com evidência
  (zero overflow, PT e EN).

- **Família (seção 02), com domínios do Guia de aplicação nos apps:**
  - Synapse — QA · ISTQB · link `ctfl-app.vercel.app` · selo live
    "em constante atualização" ("mais de mil questões em revisão contínua")
  - Ranvier — Cloud · link `ranvier-seven.vercel.app/#/` · selo live
    "em produção"
  - Myelin — Segurança (Security+, CISSP, CEH, AZ-500) · "no horizonte"
  - Theta — Agile (PSM I, PSPO, SAFe) · "no horizonte"
  - Engram — Dados · AI (DP-900, AI-900, PL-300) · "no horizonte"
- **SDD no repositório (novo na v7):** `constitution.md` (assimetria da
  mãe), `current-state.md` (este), `plan.md`, `spec-rodape-versao.md`,
  `noos.registry.json` (fonte única do registro, sistema v1.1.1).
- **Rodapé com versão do sistema e data de build** (novo na v7, PT e EN) —
  exigência do item 18 do checklist do Guia de atualização.
- **CI com 3 jobs:** gate de placeholders, integridade/paridade PT-EN, e
  **sdd-lint** (novo: arquivos canônicos presentes + registro válido e em
  sincronia com as páginas PT/EN).
- **Axon:** referenciado como contrato (`@ironidesflj/axon` v0.2.2 publicada,
  repositório próprio); o hub **não consome o pacote em runtime** — é
  estático, sem build de aplicação.
- Stack: HTML/CSS/JS estático, sem framework — Fig. 01 transplantada byte a
  byte (`js/campo-noosferico.js`, NÃO EDITAR), tema claro/escuro
  (`noos-theme`), idioma persistente (`noos-lang`), og-images 1200×630 PT/EN.

## Limitações conhecidas (verdade atual, sem maquiagem)

- **A rota `/q/{ID}` ainda não existe** — deep-links de questão são entrega
  da Fase 2; nenhum manifesto foi ingerido ainda (nenhum app publica
  `manifest.jsonl` até agora).
- **Discussões (GitHub Discussions) são o quadro da Fase 2** — o link existe,
  o quadro depende de o mantenedor ativar a feature no repo.
- **Canonical:** `noos.study` é o domínio primário; `www.noos.study` redireciona
  para o domínio nu.
- Sem CSP com hashes, fontes self-hosted, CSS de impressão (backlog P2).
