# Estado atual — Noos Hub

Revisão documental: 06/11/2026 · versão do sistema: **1.2.0**.

## Publicado no Hub

- `noos.study` é o endereço principal. `www.noos.study` redireciona para ele; `noos-hub.vercel.app` é outra URL do mesmo projeto Vercel.
- O Hub tem interface PT/EN e páginas estáticas de leitura para questões. O build consome `manifestos/*.jsonl`, valida cada linha pelo Axon `@ironidesflj/axon@0.2.2`, gera as páginas e atualiza o sitemap.
- `RAN.jsonl`: 300 questões DBDEA do Ranvier. `SYN.jsonl`: 431 questões de estudo do Synapse. No último build local: **731 aceitas, 0 rejeitadas, 1.462 páginas canônicas e 731 redirecionamentos sem idioma**.
- As páginas de questão publicam o gabarito como **texto da alternativa correta** (v12, decisões D1+D3), derivado de `snapshot.answer` (letra canônica A–D) e `snapshot.options`; a letra isolada não é publicada. O `npm run qa` tem assert de paridade página ↔ manifesto por questão e idioma, e o build falha com id/motivo se o gabarito for inválido.
- Synapse e Ranvier estão acessíveis e em constante atualização. “Em produção” não descreve o estágio comunicado pelo mantenedor para nenhum dos dois.
- O CI verifica placeholders, paridade PT/EN, referências locais, geração das páginas, sitemap e registro.

## Coordenação com os apps

- O manifesto do Synapse está integrado ao Hub. Os links de comunidade no app seguem no PR #15 do Synapse; sua ativação deve ser coordenada naquele repositório.
- O Ranvier já publica o manifesto. A URL canônica usada pelo botão do app depende de `NEXT_PUBLIC_NOOS_HUB_URL` no projeto Vercel do Ranvier; o repositório do Hub não controla essa configuração.
- Os manifestos são ingeridos por **PR automático** (F2): o app dispara o workflow, o hub confere o SHA-256 e abre o PR; merge continua manual. Questões retiradas seguem a política epitáfio (Axon 0.3.0): página canônica mantida com aviso, sem gabarito, no sitemap.

## Limites

O Hub não guarda progresso nem respostas e não hospeda provas jogáveis. O pacote Axon é dependência de build, sem código do pacote no navegador. A URL `vercel.app` não oferece redundância de hospedagem independente.


## Adendo 09/nov/2026 (v13)

- F2 implementado (`ingest-manifest.yml`) + política epitáfio (Axon 0.3.0) publicada; build 731 aceitas/0 rejeitadas, QA PASS, páginas com gabarito por texto (`7313f302…`).

## Adendo 2026-11-10 — A Camada de Mielina v2 (discussão por questão)

- Página `/q/{ID}/` agora é **dual-column** (≥1024px): questão sticky à esquerda; à direita a
  **Camada de Mielina**: matriz de dissecção das alternativas, Síntese Consolidada (wiki
  reversível em estado vazio orientador quando não há dump), filtros, contribuições dos pares
  (identicon + tiers 1–4 do Abraço da Esfera) e o fio dinâmico no giscus.
- Dados estáticos opcionais em `discussao/{PREFIX}.json` (contrato em `discussao/README.md`);
  sem dump, nada é inventado — estado vazio com a referência oficial do manifesto.
- Ritual "Passei na prova!" ativa com `?ritual=passed&trap=C` (JS progressivo; sem JS o
  conteúdo continua legível). Filtros por alternativa, aprovados e fontes.
- Guarda de layout: 320px sem overflow horizontal; sticky com scroll interno (kit pitfalls 8–9).
- Versão do sistema: **1.3.0** (registry + rodapés PT/EN).

## Adendo 2026-11-10 (2) — F2.2 parcial: sync do Discussions e compositor guiado

- **Sync real dos fios**: `scripts/sync-discussao.mjs` lê o GitHub Discussions (GraphQL) e gera
  `discussao/{PREFIX}.json`; workflow diário (`sync-discussao.yml`) abre PR com os dumps.
  Fora do build, sem fetch no gerador (armadilha #7). Já populado com os 2 fios existentes.
- **Compositor guiado** (3 perguntas do ritual): publica sem backend, abrindo a Discussion no
  GitHub (categoria Q&A, título = ID público) com corpo estruturado que o sync entende
  (`Alternativa`, `O que a documentação não conta`, `Fonte oficial`). giscus segue como fio
  ao vivo; a camada estática mostra os snapshots.
- Reputação: `discussao/authors.json` mapeia handle → tier 1–4 + `passed` (curadoria por PR).
- Versão **1.4.0**.
