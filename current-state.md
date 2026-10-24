# current-state — hub Noos (noos.study)

Última verificação: out/2026 · pacote v7 · sistema v1.1.1

## No ar (verificado)

- **Domínios funcionando:** `www.noos.study` (primário na Vercel),
  `noos.study` (308 → www, path preservado), `noos-hub.vercel.app` (backup
  canônico). DNS GoDaddy → Vercel operacional desde 23/10.
- **Deploy no ar: versão do repo anterior à v6** (v6 ainda não sofreu push —
  este pacote v7 **acumula v6+v7**; um push aplica tudo).

## Estado do pacote (v7, este)

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
- **Axon:** referenciado como contrato (`@noos/axon` v0.1.0 spec-first,
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
- **`noos.study` nu redireciona para www** — canonical/og:url/sitemap apontam
  para `noos.study`; alinhar (tornar o nu primário na Vercel) é ajuste
  opcional de 1 clique do mantenedor.
- **Testes de viewport cobrem 390/768/1440 px** — o Guia de atualização pede
  320 e 1920 px na próxima verificação de bordas.
- Sem CSP com hashes, fontes self-hosted, CSS de impressão (backlog P2).
