# discussao/ — snapshots da Camada de Mielina (F2.2 / v3)

Contrato lido pelo `build/gera-questoes.mjs` **sem rede**. Arquivos por prefixo
(`discussao/RAN.json`, `discussao/SYN.json`), chaveados pelo ID público.

**Origem:** `scripts/sync-discussao.mjs` (workflow horário) lê o GitHub
Discussions via GraphQL com paginação completa e grava o snapshot abaixo.
**All-or-nothing:** qualquer falha na coleta aborta sem tocar nos JSONs.
`syncedAt` é a data de apuração exibida na página.

## Schema (v3)

```json
{
  "RAN-AZ900-00001": {
    "discussionId": "D_kwDO…",
    "discussionNumber": 14,
    "discussionUrl": "https://github.com/ironidesflj/noos-hub/discussions/14",
    "legacyDiscussionIds": [],
    "syncedAt": "2026-11-11T13:00:00Z",
    "approvedPassersCount": 2,
    "synthesis": {
      "version": 3,
      "body": "Texto consolidado atual…",
      "sourceUrl": "https://learn.microsoft.com/…",
      "sourceOfficial": true,
      "contributors": [{ "authorId": "U_…", "handle": "@marina" }],
      "revisions": [
        {
          "version": 1,
          "body": "Síntese inicial…",
          "sourceUrl": "https://learn.microsoft.com/…",
          "proposerId": "U_…",
          "proposerHandle": "@marina",
          "approverId": "U_…",
          "approverHandle": "@ironidesflj",
          "contentHash": "sha256:…",
          "createdAt": "2026-11-01T10:00:00Z",
          "originCommentId": "DC_…"
        }
      ],
      "pendingProposals": [
        {
          "proposalId": "DC_…",
          "baseVersion": 3,
          "proposerId": "U_…",
          "proposerHandle": "@marina",
          "body": "Proposta…",
          "sourceUrl": "https://…",
          "contentHash": "sha256:…",
          "createdAt": "2026-11-11T12:30:00Z"
        }
      ]
    },
    "comments": [
      {
        "subjectId": "DC_…",
        "subjectType": "DiscussionComment",
        "discussionId": "D_…",
        "url": "https://github.com/ironidesflj/noos-hub/discussions/14#discussioncomment-101",
        "authorId": "U_…",
        "handle": "@marina",
        "tier": 3,
        "passedSelfDeclared": true,
        "option": "B",
        "body": "A pegadinha está em…",
        "sourceUrl": "https://…",
        "sourceOfficial": true,
        "accelerations": 28,
        "createdAt": "2026-11-08T14:20:00Z",
        "updatedAt": "2026-11-08T14:20:00Z",
        "isRoot": false
      }
    ]
  }
}
```

- `subjectId`/`authorId` são IDs permanentes do GitHub; **nunca** índices.
- `accelerations` = união de contas humanas em ROCKET/THUMBS_UP/HEART
  (bots e auto-apoio excluídos).
- `synthesis` é **curadoria**; o sync **preserva** o bloco inteiro
  (`revisions`, `pendingProposals`) e nunca o reescreve.
- Sem síntese curada, o gerador publica a **baseline v1 automática** (gabarito
  + fonte oficial do manifesto).
- `discussao/reputation.json`: reputação por `authorId` (tiers/métricas) e
  `curators` explícitos; `discussao/official-sources.json`: allowlist de fontes.
- **Higiene:** comentários demonstrativos/sem procedência existem somente em
  `build/fixtures/discussao.json` (modo `--qa`); produção só recebe o que tem
  `subjectId`/`url` reais do GitHub.
- **Sem giscus:** a UI é nativa; a leitura é o snapshot e a escrita é a API
  `/api/mielina/*` (GitHub App OAuth).
