# current-state — hub Noos (noos.study)

Última verificação: out/2026 · pacote v9 · sistema v1.1.1

## No ar (verificado)

- **Domínios funcionando:** `noos.study` (primário na Vercel),
  `www.noos.study` (308 → noos.study, path preservado),
  `noos-hub.vercel.app` (backup canônico). DNS GoDaddy → Vercel operacional
  desde 23/10.
- **Bordas verificadas (v8):** 320, 640 (200% zoom de 1280) e 1920 px,
  PT e EN — zero overflow horizontal, zero elementos fora da viewport.
- **Deploy no ar: pacote v9**, sobre o v8 (`d57feea` — registry 0.2.2 +
  bordas 320/640/1920 verificadas) e o v7 (`01a5927`, `3b44aba`, `e0867e6`,
  com o registry alinhado em `639c4fb`). Da v7 para cá nenhuma página muda —
  v8 e v9 são registro e documentação.

## Estado do pacote (v9, este)

- **v9 (out/2026):** spec da página `/q/{ID}` escrita como proposta v1
  (`spec-pagina-de-questao.md`, F2 item 1) — rota, alias 301, geração no
  build com o parser do Axon, leitura com proveniência. Documentação apenas;
  implementação aguarda OK do mantenedor.

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
  da Fase 2 (spec escrita — proposta v1 em `spec-pagina-de-questao.md`;
  implementação em lote próprio); nenhum manifesto foi ingerido ainda
  (ninguém publica `manifest.jsonl` até agora).
- **Discussões (GitHub Discussions) são o quadro da Fase 2** — o link existe,
  o quadro depende de o mantenedor ativar a feature no repo.
- **Canonical:** `noos.study` é o domínio primário; `www.noos.study` redireciona
  para o domínio nu.
- Sem CSP com hashes, fontes self-hosted, CSS de impressão (backlog P2).
