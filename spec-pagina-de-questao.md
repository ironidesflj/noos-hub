# spec-pagina-de-questao

Especificação do hub (noos.study) · estado: **publicada na v10.2 — roteamento 100% estático (plano C)** · **v12 — gabarito por texto + assert de paridade** — conteúdo **no ar**: 731 questões (RAN 300 + SYN 431), 1.462 páginas canônicas, 731 redirects e sitemap com 733 entradas (números de `current-state.md`). Transporte automático dos manifestos segue pendente (F2 item 2).

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
   **alternativas** (`snapshot.options`) em lista ordenada de leitura na
   ordem canônica do snapshot — as letras A–D do `<ol type="A">` rotulam a
   ordem canônica, não o acerto; sem `input`, sem seleção, sem cronômetro,
   sem resultado.
3. **Gabarito e referência** em `<details>` ("Revelar gabarito") — revelar é
   um clique deliberado, não um resultado; a referência oficial acompanha.
   O gabarito é o **texto da alternativa correta** ("Resposta correta: …"),
   derivado de `snapshot.answer` (letra canônica A–D) + índice em
   `snapshot.options`; a letra isolada nunca é publicada — a letra do app
   embaralhado difere e exibi-la é o incidente A/C. Nada de certo/errado,
   pontuação ou progresso.
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
- O gabarito é derivado no build: `snapshot.answer` é a letra canônica
  (A–D) e o texto publicado é `snapshot.options[índice]`. Letra fora de A–D
  ou índice sem alternativa **aborta o build** com id e motivo — o hub
  nunca publica uma página com gabarito silenciosamente errado.
- `node build/gera-questoes.mjs --qa` inclui assert de **paridade** para
  cada record aceito e cada idioma: a página contém o texto de
  `options[índice]`, não exibe a letra isolada como gabarito e mantém as
  alternativas na ordem canônica; divergência falha com id e motivo.
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
- Gabarito por texto: para cada questão e idioma, a página mostra o texto
  de `snapshot.options[índice de snapshot.answer]`; o assert de paridade do
  `--qa` falha com id e motivo em divergência e o build falha com gabarito
  inválido (letra fora de A–D ou índice inexistente).
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

Rota publicada na v10.2 e os dois manifestos ingeridos: `manifestos/RAN.jsonl`
(300 questões DBDEA) e `manifestos/SYN.jsonl` (431 questões), zero rejeições
no build. As páginas estão no ar; o badge (fatia 5) deixou de estar bloqueado
pelo hub — ativação e conteúdo ficam no lado do app, onde os dois trilhos são
independentes e se encontram no build.

## Fora de escopo

Transporte dos manifestos até o repo (spec de ingestão, item 2 da F2);
ativação e conteúdo das Discussões (item 3); badge no app (fatia 5, lado do
app); listagem e busca de questões; JSON-LD; analytics; qualquer interação
de estudo.

## Revisão v10.2 — roteamento estático

O desenho original de função e rewrites foi substituído por arquivos gerados
no build. Páginas canônicas continuam estáticas. Aliases e URLs sem idioma
agora recebem páginas com resposta 200, `meta refresh` imediato, URL canônica
e `location.replace`; desconhecidas recebem o 404 estático do hub. Aliases
levam diretamente à canônica no mesmo idioma; URLs sem idioma levam à
canônica PT em um salto. O sitemap inclui somente as canônicas.

Esta revisão substitui as referências anteriores a 301/308, `api/q.js` e
rewrites nesta spec. O contrato de preservar IDs e aliases continua válido.

## Revisão v12 — gabarito por texto + assert de paridade (2026-11-06)

**D1 — gabarito por texto.** A página de questão deixa de exibir a LETRA do
gabarito e passa a exibir o **TEXTO da alternativa correta**, derivado do
índice canônico: `snapshot.answer` chega como letra A–D e o texto publicado
é `snapshot.options[índice]`. As letras A–D do `<ol type="A">` continuam
sendo rótulos da **ordem canônica** do snapshot — nunca do acerto. Isso
fecha o incidente A/C: a letra vista no app embaralhado não coincide com a
do hub, e o hub passa a publicar a alternativa por extenso. Gabarito
inválido (letra fora de A–D ou índice sem alternativa) **aborta o build**
com id e motivo — nunca uma página silenciosamente errada.

**D3 — assert de paridade.** O `--qa` ganha asserção para cada record
aceito e cada idioma: a página contém o texto de `options[índice]`, não
exibe a letra isolada como gabarito e mantém as alternativas na ordem
canônica. Divergência falha o QA com id e motivo. O fixture
`RAN-AZ900-00042` foi canonicalizado (answer `B`, checksum recalculado)
para exercitar o caminho letra → texto no QA.

Verificação com os manifestos reais: 731 aceitas, 0 rejeitadas, 1.462
páginas canônicas, 731 redirects, sitemap com 733 entradas; `npm run qa`
35/35 PASS.


## Epitáfio (v0.3, 2026-11-09)

Registro com `retired: true` (campo opcional do Axon 0.3.0) gera a mesma página canônica, com aviso "questão retirada do banco ativo — mantida por citação", **sem bloco de gabarito**, e permanece no sitemap. Alias continua 301 para a canônica. ID nunca é reciclada.
