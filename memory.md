# Memória do projeto — Noos Hub (noos.study)

**Atualizado:** 2026-11-06 · **base:** `main` @ 57d14ba
**O que é:** a marca-mãe do ecossistema Noos — vitrine bilíngue PT/EN e páginas
públicas de leitura `/q/{ID}`. Não é sexto app, não hospeda estudo, não guarda
aluno (`constitution.md`). Não repete o que já está em `current-state.md`,
`plan.md` e `noos.registry.json` — referencia.

## Estado verificado (2026-11-06, por comando)

- Sistema **v1.2.0** (`package.json`, `noos.registry.json`).
- **731 questões publicadas:** `manifestos/RAN.jsonl` 300 (DBDEA) +
  `manifestos/SYN.jsonl` 431. `npm run build` → 731 aceitas, 0 rejeitadas,
  **1.462 páginas canônicas** (731 PT + 731 EN) e **731 redirects** sem idioma
  (os manifestos reais não têm alias); `.gitignore` exclui as saídas.
- `sitemap.xml` gerado = **733 entradas** (2 da base + 731 canônicas PT).
- **Gabarito por texto (v12, D1+D3):** as páginas exibem "Resposta correta:
  <texto>" / "Correct answer: <texto>" — texto de `snapshot.options[índice]`
  da letra canônica A–D, nunca a letra isolada (incidente A/C). Build falha
  com id/motivo se o gabarito for inválido; `--qa` tem assert de paridade
  por record aceito e idioma, e as alternativas seguem na ordem canônica.
- `npm run qa` → **35/35 PASS** (fixture da spec, não acende páginas no ar).
- Axon `@ironidesflj/axon@0.2.2` como devDependency com pin exato; nada do
  pacote no output servido (paridade PT/EN do rodapé lida do registro).
- Rotas v10.2: canônica = arquivo estático; alias e forma sem idioma = página
  de redirect (200 + meta refresh + canonical); desconhecida = `404.html`
  estático. Sem função, sem rewrites.
- Aplicativos no registro: Synapse e Ranvier "em constante atualização";
  Myelin, Theta, Engram "no horizonte" (sem cartão falso).
- CI: placeholders, paridade PT/EN, refs locais, geração das páginas, sitemap e
  registro (`sdd-lint`) — ver `.github/workflows/`.

## Regras que não se quebram (`constitution.md`)

- **Nunca:** hospedar prova jogável; guardar dado privado de estudo; emitir ID
  (o hub é registro, não emissor); assinar "by Noos"; ser gargalo (funciona com
  zero apps — zero manifestos = build verde e site inalterado); usar cor de app
  como interface.
- **Sempre:** devolver o usuário ao app; ingerir manifesto no build (nunca
  consultar app em runtime; linha inválida rejeitada com log e build segue);
  honrar ID publicada (alias eterno, nunca 404); publicar a fonte única em
  `noos.registry.json`; bilíngue PT/EN de nascença; identidade em
  `assets/noos-tokens.css` (apps importam, não redefinem `--bg/--fg/--accent`).
- Alias é eterno e sem reciclagem; prefixo é a marca pública do app; só o app
  dono emite o seu namespace (`SYN-*` só do Synapse, `RAN-*` só do Ranvier).
- Mudança de constitution = RFC + `CHANGELOG`/registro com semver do sistema.

## Dívidas abertas

- **Transporte e retenção dos manifestos** (F2 item 2): RAN/SYN ainda são
  copiados para o repo; falta automação e política para ID retirada (epitáfio)
  — `plan.md`.
- **Discussões por questão** (F2 item 3): slot reservado na página, omitido.
- **Badge/deep-link no app** (fatia 5 do guia do Axon): hub já serve as
  páginas; ativação é do lado do app. PR #15 do Synapse (links de comunidade)
  mora no repo do Synapse.
- **Drift interno da spec:** `spec-pagina-de-questao.md` — seções "Rotas e
  resolução"/"Geração" ainda descrevem `api/q.js` e 301/308, superadas pela
  revisão v10.2 no fim do arquivo; unificar na próxima passada.
- Adiado: CSP com hashes, self-host de fontes, CSS de impressão; Cloudflare
  Pages como espelho; Next.js só se a F2 pedir interação real.

## Próximo passo

1. F2 item 2 — spec de ingestão + transporte automático (CI do app → hub) e
   comportamento para ID retirada; só então remover a cópia manual.
2. Antes de editar: `npm ci && npm run build && npm run qa` (cache:
   `npm_config_cache="$PWD/.npm-cache"`) e conferir os números acima.
3. Qualquer bump: `package.json` × `noos.registry.json` × rodapé iguais.

- **CI:** o job `Integridade e paridade PT/EN` passou a rodar `npm run qa` — o assert de paridade gabarito × `options` (incidente A/C) agora é gate de PR, além do build.

- **Monitoramento:** `.github/workflows/monitor.yml` checa a cada 15 min hub (registry, páginas, sitemap 733), Synapse (app + `/manifest.jsonl` 431 linhas) e Ranvier (`/api/health`); falha abre/atualiza issue "(Monitor: falha de disponibilidade)" e o GitHub notifica por e-mail; sucesso fecha.

- **2026-11-09:** Axon pin 0.3.0; página `/q/{ID}` suporta `retired` (política epitáfio, MINOR): questão retirada mantém a página canônica com aviso e **sem gabarito interativo**; sitemap permanece. QA cobre ativa + retirada no fixture.
