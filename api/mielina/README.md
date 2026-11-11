# API da Camada de Mielina (Fases 3–4)

Functions Node da Vercel em `/api/mielina/*` para participação autenticada
(apoio, comentário, proposta e curadoria da Síntese Wiki). A página continua
100% estática: nada aqui é chamado no carregamento; só após interação do
visitante ou quando existe sessão ativa.

Precisa das variáveis descritas em [`../../.env.example`](../../.env.example).
Sem a variável exigida pela rota, a resposta é `503 ENV_MISSING` (fail-closed).
Nenhum token, segredo ou `client_secret` aparece em resposta, log ou URL.

## Contrato de endpoints

Todas as respostas usam `Cache-Control: private, no-store`. Erros seguem
`{ ok: false, error: "<CODIGO>", message: "<texto>", errors?: [...] }`.

### `GET /api/mielina/me`

Identidade leve para a UI (Fase 5). Lê a sessão do cookie e
`discussao/reputation.json` de `main`.

```json
{ "authenticated": true, "authorId": "MDQ6…", "handle": "@fulano",
  "tier": 3, "isCurator": false, "csrfToken": "…",
  "observedAt": "2026-11-11T13:00:00.000Z" }
```

- Sem sessão: `200 { "authenticated": false, "observedAt": "…" }`.
- `csrfToken` é acréscimo documentado ao contrato mínimo: o cookie de sessão é
  `HttpOnly`, então o cliente precisa do token para enviar `X-Mielina-CSRF`.
- `degraded: true` (com `tier: 1`) quando a reputação não pôde ser lida — nunca
  concede privilégio.

### `GET /api/mielina/auth/login?returnTo=/pt/q/ID/#comment-DC_…`

Redireciona para o OAuth da GitHub App (`state` + PKCE S256). Grava o cookie
temporário `mielina_oauth` (cifrado, `HttpOnly; Secure; SameSite=Lax; Max-Age=600`).
`returnTo` só aceita caminho same-origin (começa com `/`, nunca `//`).

### `GET /api/mielina/auth/callback`

Confere `state`, troca `code` + `code_verifier` pelo user token e grava a sessão
cifrada em `mielina_session` (`HttpOnly; Secure; SameSite=Lax`, até 8 h).
Redireciona para o `returnTo` validado. Falhas redirecionam para
`/?mielina=erro&motivo=<codigo>` — sem token nem detalhe sensível.

### `POST /api/mielina/auth/logout`

Sem corpo. Exige sessão + Origin + `X-Mielina-CSRF`; limpa os cookies.
`200 { "ok": true }`.

### `GET /api/mielina/support?subjectId=DC_…` (reconciliação)

Exige sessão (sem CSRF; é leitura).

```json
{ "ok": true, "subjectId": "DC_…", "questionId": "RAN-DBDEA-00001",
  "count": 27, "viewerSupported": true, "observedAt": "…" }
```

### `POST /api/mielina/support`

Corpo: `{ "subjectId": "DC_…", "desiredState": true|false,
"questionId": "RAN-DBDEA-00001" }`.

- `desiredState: true` → `addReaction(ROCKET)`.
- `desiredState: false` → remove `ROCKET`/`THUMBS_UP`/`HEART` da própria conta.
- O servidor **reconsulta** as reações e devolve a contagem real; o cliente nunca
  soma localmente. União de contas humanas, sem bots e sem auto-apoio (policy
  única `build/lib/mielina-policy.mjs`).
- Resposta: `{ ok, subjectId, questionId, count, viewerSupported, observedAt }`.
- Erros: `400 SUBJECT_QUESTION_MISMATCH`/`SUBJECT_FOREIGN_REPO`,
  `401 UNAUTHENTICATED`, `403 CSRF_INVALID`, `429 RATE_LIMITED` (30/min).

### `POST /api/mielina/comment`

Corpo: `{ "questionId": "RAN-DBDEA-00001", "option": "A|B|C|D|Geral",
"selfDeclaredPassed": true|false, "body": "…", "sourceUrl": "https://…"|"" }`.

- `body` 15–5000 chars; `sourceUrl` opcional, somente `https`.
- Formata `<!-- mielina:v2 {json} -->` + texto legível e publica na Discussion
  canônica (cria pelo título = ID público se necessário).
- Resposta `201`: `{ ok, questionId, subjectId, url, createdAt, authorId, handle,
  discussionId, discussionUrl, observedAt }`.
- Erros: `404 QUESTION_NOT_FOUND`, `503 DATA_UNAVAILABLE` (manifesto
  indisponível), `403 GITHUB_FORBIDDEN` (App sem permissão de discussões).

### `POST /api/mielina/synthesis/propose`

Exige `tier >= 3` (ou curador) em `main`. Corpo:
`{ "questionId", "body": "…", "sourceUrl": "https://…" }` (body 30–4000;
`sourceUrl` obrigatória e `https`).

Publica proposta estruturada na discussion canônica. Resposta `201`:
`{ ok, questionId, proposalId, contentHash, baseVersion, url, createdAt,
proposerId, proposerHandle, tier, discussionId, observedAt }`.

`contentHash = "sha256:" + sha256(baseVersion + "\n" + body.trim() + "\n" +
sourceUrl.trim())`.

### `POST /api/mielina/synthesis/approve`

Exige `tier === 4` ou curador. Corpo:
`{ "questionId", "proposalId": "DC_…", "baseVersion": 3,
"contentHash": "sha256:…" }`.

- Bloqueia auto-aprovação (`approverId == proposerId` → `403 SELF_APPROVAL_FORBIDDEN`).
- `baseVersion` diferente da versão atual → `409 VERSION_CONFLICT`.
- Hash diferente do texto/fonte atuais da proposta → `409 CONTENT_HASH_MISMATCH`.
- Proposta já publicada → `200 { ok: true, alreadyApplied: true }`.
- Sucesso **não** publica: devolve `202 { ok, dispatched: true, … }` e dispara
  `repository_dispatch` `mielina-curadoria`; o workflow publica a revisão.

### `POST /api/mielina/synthesis/revert`

Exige `tier === 4` ou curador. Corpo:
`{ "questionId", "baseVersion": 5, "targetVersion": 2, "reason": "…" }`
(`reason` 10–500 chars; `targetVersion < baseVersion`).

Resposta `202 { ok, dispatched: true, … }` — o workflow anexa `v(N+1)` com o
texto da versão alvo e preserva as revisões anteriores.

## Alinhamento com o cliente (`js/mielina.js`)

O cliente da Fase 5 já usa os mesmos paths/payloads; para as mutações, precisa
enviar o token CSRF do `/me`:

```js
const me = await fetch("/api/mielina/me", { credentials: "same-origin" }).then((r) => r.json());
await fetch("/api/mielina/support", {
  method: "POST",
  credentials: "same-origin",
  headers: { "content-type": "application/json", "X-Mielina-CSRF": me.csrfToken },
  body: JSON.stringify({ subjectId, desiredState: true, questionId }),
});
```

- `X-Mielina-CSRF` é obrigatório em **todos** os POST (`support`, `comment`,
  `propose`, `approve`, `revert`, `logout`); sem ele a resposta é
  `403 CSRF_INVALID`. O valor vem de `GET /api/mielina/me.csrfToken`.
- `GET /api/mielina/support?subjectId=…` não exige CSRF (é leitura), mas exige
  sessão.
- O `Origin` é enviado automaticamente pelo navegador em POST same-origin.
- Após `202` de approve/revert o conteúdo muda em `main`; a página estática só
  reflete depois do sync/build (recarregar/pollar, nunca somar localmente).
- Limites de texto alinhados ao cliente: comentário 15–5000; proposta 30–4000
  (proposta exige fonte `https`, comentário aceita fonte vazia).

## Segurança

- Sessão: AES-256-GCM (`MIELINA_SESSION_SECRET`) em cookie `HttpOnly; Secure;
  SameSite=Lax`; nenhum token em `localStorage`.
- CSRF: `Origin` obrigatório em POST (mesma origem de `MIELINA_BASE_URL` ou
  `MIELINA_ALLOWED_ORIGINS`) + header `X-Mielina-CSRF` com o token de `/me`.
- OAuth: `state` + PKCE S256; `returnTo` limitado a caminho same-origin.
- IDs: `subjectId` validado como node ID do GitHub e **verificado via API** como
  pertencente a uma discussion de `MIELINA_REPO` com o título da questão.
- Rate limit em memória por conta/IP (melhor esforço por instância): support
  30/min, comment 5/min, propose 3/min, approve/revert 5/min.
- Erros do GitHub são traduzidos para códigos genéricos; mensagem crua do GitHub
  não vaza token.
- A API nunca escreve em `main`: aprovação/reversão só disparam o workflow
  protegido, que revalida permissões e hashes antes do commit assinado via API.

## Dados lidos (somente leitura, fail-safe)

- `discussao/reputation.json` e `discussao/{PREFIX}.json` de `main`, via raw do
  GitHub (cache curto por instância).
- `manifestos/{PREFIX}.jsonl` para validar `questionId` (fail-closed: 503 se
  indisponível; 404 se a questão não existe).

## Testes

```bash
node --test tests/
```

Os testes são offline (fetch dublado) e cobrem blocos/hashes/gates, cripto de
sessão, CSRF/Origin, rate limit e todos os handlers (inclusive dispatch).
