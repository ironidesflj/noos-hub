# discussao/ — dumps estáticos da Camada de Mielina (F2.1)

Contrato opcional lido pelo `build/gera-questoes.mjs` **sem rede** (pitfall #7 do kit):
um arquivo por prefixo (`discussao/RAN.json`, `discussao/SYN.json`), chaveado pelo ID público.

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
        "accepted": true
      }
    ]
  }
}
```

- **Todo texto é não confiável**: o gerador passa por `escapeHtml()`; o cliente
  hidrata só atributos e `textContent` (pitfall #11).
- `sourceUrl` só é renderizado se o protocolo for **https:**.
- `tier` 1–4 segue os gates de reputação da `spec-discussao-questao.md` §4.
- Sem dump para um ID: a página mostra o **estado vazio orientador** com a referência
  oficial do manifesto e convida a primeira contribuição (nada é inventado).
- O fio dinâmico continua no **giscus** (`#discussao-dinamica`); este arquivo é o
  snapshot estático revisável (indexável), não substitui a conversa ao vivo.
