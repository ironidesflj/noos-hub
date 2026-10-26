# current-state — hub Noos (noos.study)

Última verificação: out/2026 · pacote v10 · sistema v1.2.0

## No ar (verificado)

- **Domínios funcionando:** `noos.study` (primário na Vercel),
  `www.noos.study` (308 → noos.study, path preservado),
  `noos-hub.vercel.app` (backup canônico). DNS GoDaddy → Vercel operacional
  desde 23/10.
- **Bordas verificadas (v8):** 320, 640 (200% zoom de 1280) e 1920 px,
  PT e EN — zero overflow horizontal, zero elementos fora da viewport.
- **Deploy no ar: pacote v10**, sobre o v9 (`a5001e1` — spec da página de
  questão) e o v8 (`d57feea` — registry 0.2.2 + bordas 320/640/1920
  verificadas). Primeira versão com build step e função de rota; com zero
  manifestos as páginas são idênticas às da v9 — mudança visível: rodapé e
  registro em v1.2.0.

## Estado do pacote (v10, este)

- **v10 (out/2026):** rota `/q/{ID}` implementada (`spec-pagina-de-questao.md`
  v1): o build gera páginas, mapa de aliases e sitemap a partir de
  `manifestos/*.jsonl`; sistema sobe para v1.2.0 (campo `url` opcional por
  namespace). Conteúdo aguarda o primeiro manifesto — com zero manifestos o
  site fica idêntico ao da v9, exceto registro/rodapé em v1.2.0.

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

- **A rota `/q/{ID}` existe, mas nenhuma questão está publicada** — página
  canônica, redirect de alias (301) e forma sem idioma (308) no ar; o
  conteúdo acende com o primeiro `manifestos/{PREFIXO}.jsonl` (nenhum app
  publica `manifest.jsonl` até agora — Ranvier segue na fatia 1).
- **Discussões (GitHub Discussions) são o quadro da Fase 2** — o link existe,
  o quadro depende de o mantenedor ativar a feature no repo.
- **Canonical:** `noos.study` é o domínio primário; `www.noos.study` redireciona
  para o domínio nu.
- Sem CSP com hashes, fontes self-hosted, CSS de impressão (backlog P2).
