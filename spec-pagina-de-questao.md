# spec-pagina-de-questao

Especificação do hub (noos.study) · estado: **implementada na v10** — rota, build e função no ar (routing de aliases corrigido na v10.1); conteúdo aguarda o primeiro manifesto (F2 item 2 para o transporte).

## Problema

A ID pública é a âncora permanente do ecossistema — a mesma URL para sempre,
porque circula em fóruns, mensagens e buscadores fora do alcance de qualquer
app (`spec-deep-link` do Axon). O contrato promete a cada questão uma página
canônica no hub (`noos.study/{pt|en}/q/{ID}`), mas a rota não existe: todo
deep-link apontado hoje cai no 404 — e por isso o badge "by Noos" (fatia 5
do guia de adoção) está travado ("link visível que dá 404 é UX ruim"). Esta
spec fecha o desenho da página e da sua geração para que a implementação
seja um lote mecânico, sem decisões em aberto.

Três leis da constitution governam o desenho: a ingestão acontece **no
build** (§ sempre 2); a ID publicada é **honrada para sempre** — alias
eterno com redirect 301, nunca 404 em ID publicada (§ sempre 3); e a prévia
de questão é **leitura** — sem seleção, cronômetro, resultado ou progresso
(§ nunca 1). Estudar mora nos apps; a página existe para citar, verificar e
discutir.

## Contrato de entrada

- **Fonte:** `manifestos/{PREFIXO}.jsonl` no repositório do hub — um
  arquivo por app (namespace), substituído por inteiro a cada atualização
  (ex.: `manifestos/RAN.jsonl`). Manifestos são commits do repo: revisáveis
  no diff, servidos publicamente (dado público por construção — o hub nunca
  guarda dado privado). Como o manifesto **chega** ao repo é o spec de
  ingestão (item 2 da F2); esta spec fixa apenas onde ele mora quando já
  chegou.
- **Parser:** `parseManifest` + `verifyChecksum` do `@ironidesflj/axon`,
  `devDependency` com pin exato. O hub passa a consumir o pacote **no
  build** — nunca em runtime; nada do Axon embarca no output servido.
- **Tolerância (constitution §2):** linha inválida rejeitada com log
  (número e motivo) e o build segue com as `ok`; o hub nunca corrige a
  origem; checksum divergente rejeita a linha; ID duplicada rejeita a
  segunda ocorrência. **Zero manifestos = build verde e site inalterado** —
  a mãe funciona com zero apps no ar.

## Rotas e resolução

| Pedido | Resposta | Mecanismo |
|---|---|---|
| `/{pt\|en}/q/{ID canônica}` | **200** — página da questão | arquivo estático gerado no build (`{lang}/q/{ID}/index.html`); filesystem sempre vence |
| `/{pt\|en}/q/{alias}` (ex. `GLI-…`) | **301** → canônica da mesma questão, mesmo idioma | `api/q.js` com o mapa de aliases gerado no build |
| `/q/{ID}` (sem idioma) | **308** → `/pt/q/{ID}` (alias resolvida antes: salto único) | `api/q.js` |
| `/{pt\|en}/q/{desconhecida}` | **404** com corpo equivalente ao `404.html` | `api/q.js` |

- `vercel.json` ganha **apenas** `rewrites` de fallback (`/q/*` e
  `/{lang}/q/*` → `/api/q`); `cleanUrls`, `trailingSlash` e `headers`
  atuais intocados. Rewrite só dispara em miss do filesystem: a página
  canônica é sempre o arquivo estático; a função é burra por desenho —
  regex de forma + mapa gerado, **zero Axon em runtime** (quem valida é o
  build).
- A URL de citação do Axon (sem barra final) resolve com um 308 permanente
  da Vercel para a forma com barra (`trailingSlash: true`); o
  `<link rel="canonical">` da página usa a forma servida. Citação e
  destino final, ambos permanentes e únicos.
- Idioma da forma sem segmento: PT (idioma de fundação), com a irmã EN a um
  clique no seletor — o header aponta para a **questão irmã**, não para a
  home (paridade de âncoras, § sempre 5).

## A página (leitura, não estudo)

Chrome da casa: header e footer de `index.html`, tokens `noos-tokens.css` +
`noos.css`, tema claro/escuro preservado; sem Campo Noosférico (hero é da
vitrine). O rodapé das páginas geradas traz a versão do sistema **lida de
`noos.registry.json` pelo gerador** — nestas páginas, registro e rodapé não
divergem por construção. Sem JS obrigatório para ler.

Conteúdo, em ordem:

1. **Cabeçalho da questão** — ID canônica em corpo mono (é o que o aluno
   copia para citar), app emissor (nome + ponto de cor do registro — dado,
   nunca botão, § nunca 6), prova (`exam`), tópicos, dificuldade
   (vocabulário do app emissor, agregado) e idioma da questão quando difere
   do idioma da página.
2. **Enunciado** (`snapshot.statement`, quebras preservadas) e
   **alternativas** (`snapshot.options`) em lista ordenada de leitura — sem
   `input`, sem seleção, sem cronômetro, sem resultado.
3. **Gabarito e referência** em `<details>` ("Revelar gabarito") — revelar é
   um clique deliberado, não um resultado; a referência oficial acompanha.
   Nada de certo/errado, pontuação ou progresso.
4. **Proveniência** — `version`, `checksum` completo em corpo mono, aliases
   legadas, número da linha no manifesto e link direto para
   `manifestos/{PREFIXO}.jsonl` servido público; data do build no rodapé
   (invariante da Carta, cap. 7).
5. **Volta ao app** — "Treinar esta prova no {app}" aponta para o campo
   `url` do namespace no registro (campo novo, opcional; sem o campo, o
   link não renderiza e a página segue válida). Todo caminho devolve ao
   app.
6. **Slot Discussão** — seção reservada que renderiza somente quando o
   registro ganhar a chave de ativação (item 3 da F2). Hoje: omitida.

Todo texto do manifesto é HTML-escapado (o snapshot é texto arbitrário).

## Geração (build)

- `build/gera-questoes.mjs` (commitado): lê `noos.registry.json` +
  `manifestos/*.jsonl`, valida com o Axon, emite `pt/q/{ID}/index.html` e
  `en/q/{ID}/index.html` a partir de `build/templates/` (PT e EN), gera
  `api/q-data.mjs` (mapa de aliases + corpo do 404 embutido) e escreve
  `sitemap.xml` (base de `build/templates/sitemap-base.xml` + uma entrada
  por questão, hreflang pt/en/x-default).
- Saídas geradas **não são commitadas** (`.gitignore`: `pt/q/`, `en/q/`,
  `api/q-data.mjs`, `sitemap.xml`).
- Vercel: framework "Other", `buildCommand: node build/gera-questoes.mjs`,
  output `./` (a raiz, como hoje); `api/q.js` vira função automaticamente.
- O hub ganha `package.json` (novo): `devDependencies` com o
  `@ironidesflj/axon` em pin exato + `scripts.build`. É a "fatia 1 do
  hub": dependência de build, zero runtime.
- `noos.registry.json` ganha o campo opcional `url` por namespace (bump da
  versão do sistema no lote de implementação, conforme o Guia).

## Aceitação (checklist do lote de implementação)

- Zero manifestos → build verde, site byte a byte igual, `/q/{qualquer}` →
  404 do hub (a rota existe; o conteúdo acende com o primeiro manifesto).
- Fixture de teste (o exemplo trabalhado do guia: `RAN-AZ900-00042` ↔
  `GLI-AZ900-00012`) → páginas PT e EN geradas sempre em par (build falha
  se faltar uma); `curl -I` na alias → 301 para a canônica no mesmo
  idioma; forma sem barra → 308.
- Linha suja no fixture → build segue, log com linha/motivo, página
  correspondente ausente; checksum divergente → linha rejeitada.
- Páginas geradas: escape correto, `<details>` fechado por padrão,
  canonical/hreflang/OG presentes, rodapé = registry, link do app quando
  `url` existir, header e rodapé sem overflow a 320 px (o QA de bordas da
  v8 vale para as páginas novas).
- Nada do pacote Axon no output servido (é só devDependency de build).

## Efeito no manifesto

Nenhum — a página LÊ o contrato vigente (9 campos, `spec-schema`); nada no
formato muda.

## Efeito no hub

Primeiro build step da mãe — previsto na constitution (§ sempre 2) desde a
fundação. Registry ganha `url` opcional; sitemap passa a ser gerado; o
rodapé das páginas geradas sai do registro por construção.

## Efeito no Axon

Nenhum no pacote. O guia de adoção (fatia 5) passa a citar esta spec como o
"Fase 2 do hub" que destrava o badge.

## Efeito no Ranvier

Com a rota implementada e o primeiro `manifestos/RAN.jsonl` ingerido, as
páginas acendem e a fatia 5 (badge) sai da espera — os dois trilhos são
independentes e se encontram no build.

## Fora de escopo

Transporte dos manifestos até o repo (spec de ingestão, item 2 da F2);
ativação e conteúdo das Discussões (item 3); badge no app (fatia 5, lado do
app); listagem e busca de questões; JSON-LD; analytics; qualquer interação
de estudo.
