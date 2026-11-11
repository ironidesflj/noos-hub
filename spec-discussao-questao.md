# 01 · spec-discussao-questao (Spec SDD v2 — implementada · Opção A · 10/nov/2026)

Especificação do hub (`noos.study`) · complementar à `spec-pagina-de-questao.md` (item 6: Slot Discussão, Fase 2).

---

## 1. Problema e Visão

A rota canônica `/pt/q/{ID}/` e `/en/q/{ID}/` existe e publica **1.031 questões reais** (`RAN` 600 + `SYN` 431). O item 6 da `spec-pagina-de-questao.md` (*Slot Discussão*) foi **implementado** como a Camada de Mielina v2 (F2.1 + F2.2) em 10/nov/2026.

Fóruns tradicionais de questões de certificação falham por quatro motivos:
1. **Mural de achismos:** comentários soltos dizendo *"acho que é a C"* sem citar a documentação oficial (violando o Inegociável 5 da Carta).
2. **Perda de contexto no scroll:** o estudante rola a página para ler o debate e perde de vista o enunciado e as alternativas `A, B, C, D`.
3. **Ruído entre chute e aprovação real:** comentários de quem está apenas chutando têm o mesmo peso visual de quem acabou de passar na prova.
4. **Gamificação infantil ou vaidade vazia:** rankings de "quem comenta mais" geram flood inútil, enquanto a ausência de reconhecimento visual desestimula os melhores explicadores.

Esta especificação resolve os quatro problemas com o conceito **"A Camada de Mielina"**, unindo:
- **Layout Dual-Column Ancorado** (Questão fixa à esquerda, Discussão à direita);
- **Matriz de Dissecção de Alternativas (*Distractor Matrix*)**;
- **Síntese Consolidada Wiki Reversível** (`CC BY-SA 4.0`, com histórico `diff`);
- **Fluxo Guiado do Ritual *"Passei na Prova!"***;
- **Sistema de Reputação Funcional + "O Abraço da Esfera Noos" (Bainha de Mielina Orbital)** nos avatares Identicon.

---

## 2. Leis da Constitution que Governam este Desenho

1. **Estudar mora no app (`constitution.md` § Nunca 1):** A coluna esquerda da questão permanece **100% leitura** — as âncoras `[Discutir A]`, `[Discutir B]` filtram o debate da comunidade à direita, **nunca** corrigem a questão nem dão nota ou progresso.
2. **Nada privado atravessa (`constitution.md` § Nunca 2):** O histórico local (`IndexedDB`) jamais sobe para o Hub. Mesmo quando o aluno vem pelo Ritual *"Passei na Prova!"*, a URL passa apenas parâmetros públicos (`?ritual=passed&trap=C`).
3. **Zero `"by Noos"` (`constitution.md` § Nunca 4):** Nenhuma superfície da discussão, badge ou avatar usa a assinatura `"by Noos"`.
4. **Cor de app apenas como dado (`constitution.md` § Nunca 6):** `--ranvier`, `--synapse`, `--myelin`, `--theta` e `--engram` aparecem exclusivamente como pontos de `7px–9px` identificando o app de origem da questão ou de uma questão irmã na *Barra de Gravidade Cross-App*. Botões e destaques funcionais usam `--accent` (`#066755` / `#69c1ae`) e `--signal` (`#d69643` / `#e0a95c`).
5. **Limite de `--accent` (`guia-noos.html` regra `cor-accent`):** No máximo **duas ações primárias sólidas** com `--accent` visíveis simultaneamente (1: *"Treinar esta prova no {App} →"* e 2: *"Publicar na Noosfera →"*).
6. **Degradação Graciosa e Anti-SPOF:** As páginas `/q/{ID}/` continuam sendo HTML estático gerado no build. Se o script cliente da discussão ou a API do GitHub Discussions estiverem offline, a questão, o gabarito, a proveniência e o último snapshot da Síntese Wiki continuam 100% legíveis sem JS.

---

## 3. Arquitetura de Layout e Componentes

### 3.1 Grid Dual-Column (`≥ 1024px`) e Coluna Única (`< 1024px`)
- O container `.wrap` nas páginas `/q/{ID}/` expande de `1160px` para `1240px` em telas largas, abrigando `.q-grid`:
  - **Coluna Esquerda (`.q-col-problem`, `42%` / `5fr`, `position: sticky; top: 88px`):**
    - Breadcrumb, Cabeçalho da ID (`RAN-AZ900-00042`), metadados da prova.
    - Enunciado (`.q-statement`) e Alternativas (`.q-options`) com botões de âncora (`[💬 Discutir A]`, `[⚠️ Discutir C]`).
    - `<details class="q-answer">` com Gabarito e Referência Oficial.
    - Bloco de Proveniência (`<aside class="q-prov">`) e CTA de volta ao app (`.q-cta`).
    - **Barra de Gravidade Cross-App (`.q-gravity`):** sugere 1 questão de outro app da família com tópico correlato (gerada no build por interseção de `topics` ou mapa temático).
  - **Coluna Direita (`.q-col-mielina`, `58%` / `7fr`):**
    - Cabeçalho da Camada de Mielina + Contador público de **Aprovados que contribuíram nesta questão**.
    - Matriz de Dissecção de Alternativas (`A, B, C, D`).
    - Card Pinned: **Síntese Consolidada (Wiki Reversível)** com cantoneiras ópticas (`.corner`).
    - Compositor Guiado de Contribuição / Ritual *"Passei na Prova!"*.
    - Barra de Filtros (`Todas`, `✦ Só Aprovados`, `Alternativa A..D`, `Fontes Oficiais`).
    - Lista de Contribuições dos Pares (`.mielina-thread`).

### 3.2 Matriz de Dissecção de Alternativas (*Distractor Matrix*)
- Exibe uma grade de 4 colunas (`A, B, C, D`) mostrando a distribuição percentual das dúvidas/comentários ancorados naquela questão:
  - A alternativa correspondente ao `record.snapshot.answer` recebe borda e barra em `--accent` (`Gabarito ✓`).
  - A alternativa incorreta que acumula mais dúvidas recebe borda e barra em `--signal` (`⚠️ Pegadinha mais debatida`).
  - Clicar em qualquer célula da matriz filtra os comentários abaixo para exibir apenas quem debateu aquela alternativa.

### 3.3 Síntese Consolidada (Wiki Reversível sob `CC BY-SA 4.0`)
- Card fixado no topo da discussão, emoldurado com as 4 cantoneiras `.corner.tl/.tr/.bl/.br` herdadas da Fig. 01 do Manual de Identidade.
- Estrutura interna obrigatória:
  1. **Resumo de 10 segundos:** Por que o gabarito está certo e por que os distratores estão errados.
  2. **Âncora na Documentação Oficial (Inegociável 5):** Bloco com filete esquerdo `3px solid var(--accent)` apontando para a URL oficial (`learn.microsoft.com`, `istqb.org`, `docs.databricks.com`, etc.).
  3. **Rodapé de Co-autoria e Histórico Diff:** Lista os handles dos co-autores.
   O dump pode arquivar `synthesis.revisions[]` (`{version, summary, sourceUrl,
   sourceTitle, authors, updatedAt}`); com ≥2 revisões o botão `↺ Histórico /
   Diff` mostra o **texto real da revisão anterior** (`#n-1 → #n`). Sem
   histórico arquivado, a página declara “histórico a partir da próxima
   curadoria” (nunca inventa uma revisão). A reversão auditável com Gate Nível 4
   continua pendente de definição de fluxo (ver §6).

### 3.4 O Ritual *"Passei na Prova!"* (Mielinização Pós-Exame)
- Quando a página `/q/{ID}/` é aberta com `?ritual=passed` (ou `?ritual=passed&trap=C&step=1of3`), um banner discreto no topo da discussão é ativado:
  - Cita a terceira linha do manifesto: *"Quem passou vira mielina para quem vem."*
  - Pré-seleciona a alternativa onde o aluno tropeçou (`trap=C`) e o flair `✦ Passei na prova!`.
  - Oferece um botão `Dispensar` que limpa o estado e respeita a regra de **zero nag** (Cap. 10 da Carta).
- O compositor substitui o campo de comentário livre por **3 perguntas estruturadas**:
  1. *Qual alternativa te confundiu no simulado?* (`Select: A, B, C, D ou Geral`)
  2. *O que a documentação oficial não te conta de primeira?* (`Textarea`)
  3. *Âncora verificada na fonte oficial (URL ou seção do guia)* (`Input url/text`)

---

## 4. Sistema de Reputação Funcional e “O Abraço da Esfera Noos”

Em conformidade com o Capítulo 9 da Carta (*"identidade estilo Reddit: handle genérico, avatar por identicon, sem foto pessoal; gates de reputação estilo Stack Overflow"*), o Noos **não possui ranking de vaidade por volume de postagens**.

Toda reputação deriva de **três sinais de qualidade**:
- `aceleracoes`: votos recebidos no botão `[▲ Acelerou meu estudo]`;
- `fontes_verificadas`: comentários que incluem link válido para documentação oficial da certificação;
- `sinteses_aceitas`: explicações promovidas/incorporadas na Síntese Wiki da questão (*"Resposta Aceita"*).

### Os 4 Níveis Visuais do Avatar Identicon ("Bainha de Mielina Orbital")

Inspirado na neurobiologia (onde a célula glial abraça o axônio com camadas de mielina) e na gramática óptica do símbolo Noos (`assets/noos-mark.svg`), o Identicon `5×5` do usuário evolui visualmente em 4 níveis:

| Nível | Nome | Critério de Ativação | Geometria SVG ao Redor do Identicon | Permissão Desbloqueada (Gate Funcional) |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Sinapse** | `≥ 1` contribuição via OAuth leve | Moldura quadrada de `1px` (`--border-strong`) ao redor da grade `5×5` do Identicon. | Comentar em alternativas e votar em `[▲ Acelerou meu estudo]`. |
| **2** | **Aprovado (`✦ Passed`)** | Concluir o Ritual *"Passei na Prova!"* | Anel orbital circular (`stroke-dasharray="4 3"`) em `--accent` + **1 nó polar luminoso** (`r="4"`) no ápice superior direito (`45°`). | Entra no filtro `[✦ Só Aprovados]` e soma no contador público de aprovados da questão/app. |
| **3** | **Mielina Ativa** *(Super Comentador)* | `≥ 25` acelerações + `≥ 3` fontes oficiais citadas | **Duas elipses keplerianas coaxiais (`±35°`)** em `--accent` envolvendo o Identicon + **2 nós tangentes laterais**. | **Gate Stack Overflow:** libera edição direta da **Síntese Consolidada (Wiki)** da questão. |
| **4** | **Nó da Noosfera** *(O Abraço da Esfera)* | `≥ 100` acelerações + `≥ 3` Sínteses Wiki aceitas | **O Abraço da Esfera Noos:** O arco aberto superior do símbolo Noos (`240°`) envolve o topo do Identicon como um capuz protetor, cruzado por 2 elipses orbitais, apoiando **dois nós quânticos luminosos (`--accent-bright` e `--signal`) nos "ombros" esquerdo e direito do avatar**. | **Guardião da Noosfera:** aprovar/reverter revisões no Histórico Diff (`v3 → v4`), selo fixo `[✓ Co-autor da Síntese]` e curadoria Cross-App. |

---

## 5. Estratégia de Persistência e Evolução (F2.1 → F2.2 → F3)

1. **Camada Estática de Build (`discussao/{PREFIXO}.json` — opcional no repositório):**
   - Segue a mesma lei dos manifestos (`constitution.md` § Sempre 2 e Carta cap. 12: *"discussões e manifesto têm dumps públicos periódicos em JSON no repositório"*).
   - No build (`build/gera-questoes.mjs`), se existir um dump de discussões para aquela `ID`, a Síntese Wiki e os comentários principais já saem **pré-renderizados no HTML estático** (indexáveis pelo Google — o motor de crescimento orgânico descrito no Cap. 9 da Carta!).
   - Se a questão ainda tiver zero comentários no dump, a página renderiza o **Estado Vazio Orientador** (regra `estado-vazio` do `guia-noos.html`): mostra a referência oficial do manifesto como ponto de partida e convida o primeiro aprovado a inaugurar a Síntese Wiki.
2. **Camada Dinâmica Leve (Opção A — GitHub Discussions como back-end, sem iframe):**
   - Cada questão mapeia por `title = ID` (`RAN-AZ900-00042`) para uma thread na categoria `Q&A` do repositório `ironidesflj/noos-hub` no GitHub Discussions.
   - **Escrita:** o Compositor Guiado monta a Discussion (título = ID) e abre o GitHub; não há backend próprio no hub.
   - **Leitura:** `scripts/sync-discussao.mjs` (fora do build, workflow diário 06:23 UTC) lê post raiz + comentários e grava `discussao/{PREFIX}.json`; o build lê apenas o arquivo local (zero rede, pitfall #7).
   - **Sem giscus:** o iframe foi removido (Opção A); a página é a UI nativa e o dump é o snapshot estático indexável.

---

## 6. Registro de implementação (10/nov/2026 — Opção A, aprovada)

**Decisão:** a interface é **100% nativa da Camada de Mielina**; o iframe do
giscus foi **removido** das páginas de questão. O GitHub Discussions
(`ironidesflj/noos-hub`, categoria Q&A) é o back-end gratuito de escrita/leitura,
consumido em duas etapas:

1. **Escrita:** o Compositor Guiado monta a Discussion (título = ID público;
   corpo estruturado com alternativa, status/flair e fonte https) e abre o
   GitHub — sem backend próprio e sem guardar dado privado no hub.
2. **Leitura:** `scripts/sync-discussao.mjs` roda **fora do build** (workflow
   diário 06:23 UTC, abre PR), lê **post raiz + comentários**, parseia
   `**Alternativa que confundiu:**`, `**Status:** ✦ Passei na prova!`,
   explicação e `**Fonte oficial:**`, **deriva o tier 1–4** por atividade
   (reações 🚀/👍/❤, fontes, respostas aceitas, aprovação) com overrides em
   `discussao/authors.json`, **preserva `synthesis`** curadas e escreve
   `discussao/{PREFIX}.json`.

**Entregue também:** coluna esquerda em cartão com cantoneiras + `Citar ID`;
alternativas em cartões com âncoras; **Gravidade Cross-App**; gaveta dos 4
níveis (botão “Reputação & Abraço da Esfera”); síntese com **baseline v1
automática** (gabarito + fonte oficial do manifesto) e **diff inline**; upvote
persistente em `localStorage`; card otimista ao publicar; filtros cruzados;
QA com **61 asserções** (zero iframe giscus incluído).

**Pendências desta spec:** curadoria editorial preencher `revisions[]` nos
dumps existentes; fluxo de reversão auditável (Gate Nível 4); promoção
automática de “resposta aceita”. A CSP das páginas está em **enforce** desde a
1.6.0 (scripts inline externalizados; Google Fonts liberado até o self-host).



---

## 7. Arquitetura definitiva v3 (2026-11-11) — contrato consolidado

A versão 2.0.0 implementa o handoff `handoff-arquitetura-definitiva-mielina.md`.
Regras vinculantes:

- **Leitura 100% estática:** a página publica o snapshot com data de apuração
  (`syncedAt`/`observedAt` em UTC) e **não chama `/api/mielina/*` no load**;
  APIs só são acionadas por ação participativa ou sessão autenticada.
- **Sessão:** GitHub App com OAuth (state + PKCE), cookie cifrado
  AES-256-GCM (`MIELINA_SESSION_SECRET`), `HttpOnly; Secure; SameSite=Lax`,
  `Cache-Control: private, no-store`; **nada em localStorage**.
- **Identidade de dados:** `subjectId` = node ID GraphQL (`D_…`/`DC_…`),
  `authorId` = ID da conta; índices posicionais nunca identificam voto.
- **Apoio (`▲ Acelerar`):** 1 conta humana = 1 apoio; união de `ROCKET`,
  `THUMBS_UP`, `HEART`, sem bots e sem auto-apoio. O cliente envia o desejo e
  substitui o número pelo `count` confirmado pela API; em timeout reconcilia
  via GET, sem soma local fantasma. O voto legado em localStorage é limpo.
- **Fonte oficial:** allowlist por prefixo em `discussao/official-sources.json`
  (só `https:`, domínio/subdomínio oficial) → selo **“Fonte oficial citada”**.
  “Fonte verificada” fica reservado à síntese aprovada.
- **Tiers (E estrito):** 1 = participação autenticada; 2 = aprovação
  autodeclarada; 3 = ≥25 apoios **E** ≥3 contribuições com fonte oficial;
  4 = ≥100 apoios **E** ≥3 sínteses distintas aprovadas (ou curador explícito).
- **Curadoria:** Nível 3 **propõe** revisão; Nível 4/curador **aprova** ou
  **restaura**, sempre com `contentHash` + `baseVersion`, sem autoaprovação
  (`approverId ≠ proposerId`) e com revisões **append-only** (`revisions[]`
  nunca é reescrito; restaurar cria `v(N+1)`).
- **Execução:** aprovações disparam `repository_dispatch` para o workflow
  `curadoria-sintese.yml`, que revalida permissões, hash, versão e idempotência
  antes de commitar em `main`.
- **Sync:** paginação completa de discussions/comments/replies/reactions,
  all-or-nothing (falha = nenhum arquivo alterado), dedupe por título (mais
  antiga canônica), registros sem procedência só existem no fixture de QA.
  Roda a cada hora (workflow) e nunca dentro do build.
- **APIs (Vercel Functions):** `/api/mielina/auth/login|callback`,
  `/api/mielina/me`, `/api/mielina/support`, `/api/mielina/comment`,
  `/api/mielina/synthesis/propose|approve|revert`.

O checklist de aceite vive em `noos-orquestra/relatorios/mielina-checklist.md`
(fora do repositório) e é reproduzido em cada release.
