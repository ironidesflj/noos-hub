# current-state — hub Noos (noos.study)

Última verificação: out/2026 · pacote v11 · sistema v1.2.0

## No ar (verificado)

- **Domínios funcionando:** `noos.study` (primário na Vercel),
  `www.noos.study` (308 → noos.study, path preservado),
  `noos-hub.vercel.app` (backup canônico). DNS GoDaddy → Vercel operacional
  desde 23/10.
- **Bordas verificadas (v8):** 320, 640 (200% zoom de 1280) e 1920 px,
  PT e EN — zero overflow horizontal, zero elementos fora da viewport.
- **Deploy v10.2:** roteamento estático para questões e aliases, sem função
  ou rewrites. Com zero manifestos, o conteúdo permanece igual ao da v9,
  exceto registro e rodapé em v1.2.0.

## Estado do pacote (v11, este)

- **v11 (out/2026):** primeiro manifesto real em `manifestos/RAN.jsonl`:
  300 questões DBDEA do Ranvier, 0 rejeições, 0 aliases e checksums válidos.
  O build gera 600 páginas canônicas, 300 redirects sem idioma e sitemap com
  302 entradas. A saída real passou no QA local. O gerador também descarta
  páginas geradas em builds anteriores para não servir IDs ausentes no
  manifesto atual.
- **Synapse, preparado localmente:** `manifestos/SYN.jsonl` tem 431 questões
  de estudo CTFL/CTAL-TA/CTAL-TM após a revisão das 50 retenções. Duas questões
  CTFL de casos de uso estão identificadas como conteúdo complementar fora do
  exame CTFL v4.0.1. O build local aceitou 731 questões nos dois manifestos e
  gerou 1.462 páginas canônicas, sem rejeições. Git e deploy ainda pendem.

- **v10.2 (out/2026):** o build gera páginas canônicas e páginas de
  redirecionamento para aliases e URLs sem idioma. Desconhecidas recebem
  404 estático; redirects usam 200, refresh e canonical.

- **v10.1 (out/2026):** tentativa de routing por rewrites `:id`; o campo
  `handle: filesystem` foi rejeitado pela Vercel e removido. Fixture local
  excluído do deploy por `.vercelignore`.

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

- **Ranvier é o primeiro emissor de manifesto** — as 300 questões DBDEA
  estão no build da v11. O Synapse ainda aguarda seu próprio manifesto;
  as páginas públicas devem ser verificadas após o deploy.
- **Discussões (GitHub Discussions) são o quadro da Fase 2** — o link existe,
  o quadro depende de o mantenedor ativar a feature no repo.
- **Canonical:** `noos.study` é o domínio primário; `www.noos.study` redireciona
  para o domínio nu.
- Sem CSP com hashes, fontes self-hosted, CSS de impressão (backlog P2).
