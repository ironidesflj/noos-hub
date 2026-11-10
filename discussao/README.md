# discussao/ — dumps estáticos da Camada de Mielina (F2.2)

Contrato lido pelo `build/gera-questoes.mjs` **sem rede** (o gerador nunca faz
fetch). Arquivos por prefixo (`discussao/RAN.json`, `discussao/SYN.json`),
chaveados pelo ID público.

**Origem:** os dumps são gerados por `scripts/sync-discussao.mjs` a partir do
GitHub Discussions (`ironidesflj/noos-hub`, categoria Q&A; título = ID público):
o script lê o **post raiz + comentários**, parseia o corpo estruturado do
Compositor Guiado e escreve o JSON. O workflow `sync-discussao.yml` roda
diariamente (06:23 UTC) e abre PR. O build **não** acessa a rede.

```json
{
  "RAN-AZ900-00042": {
    "synthesis": {
      "summary": "Resumo de 10 segundos…",
      "sourceUrl": "https://learn.microsoft.com/…",
      "sourceTitle": "Fonte oficial",
      "authors": ["@handle-1", "@handle-2"],
      "version": 3
    },
    "comments": [
      {
        "handle": "@handle-1",
        "tier": 3,
        "passed": true,
        "option": "B",
        "body": "Explicação com fonte…",
        "sourceUrl": "https://learn.microsoft.com/…",
        "accelerations": 27,
        "accepted": true,
        "createdAt": "2026-11-10T18:56:35Z"
      }
    ]
  }
}
```

- `synthesis` é **curadoria** e o sync **preserva** o bloco existente; sem
  síntese curada, o gerador publica a **baseline v1 automática** (gabarito +
  fonte oficial do manifesto).
- `tier` 1–4 é derivado no sync (reações, fontes, respostas aceitas,
  aprovação) com overrides em `discussao/authors.json`; segue os gates da
  `spec-discussao-questao.md` §4.
- **Todo texto é não confiável:** o gerador passa por `escapeHtml()` e o
  cliente só usa `textContent`; `sourceUrl` só é renderizado se `https:`.
- Sem dump para um ID: estado orientador com a referência oficial do
  manifesto — nada é inventado.
- **Sem giscus:** o fio ao vivo é o GitHub Discussions; a página é a UI
  nativa (Opção A) e o dump é o snapshot estático revisável/indexável.
