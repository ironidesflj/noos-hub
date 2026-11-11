# Noos Hub

[noos.study](https://noos.study) é o ponto de entrada bilíngue do ecossistema Noos. Apresenta os apps, o manifesto e páginas públicas de questões em PT/EN. O estudo, o progresso e as respostas ficam nos apps.

## Estado atual

- **Synapse** e **Ranvier** estão acessíveis e em constante atualização. Os outros nomes da família estão no horizonte.
- O Hub publica páginas de leitura para **1.031 questões**: **600 do Ranvier** (DBDEA 300 + AZ-900 300) e **431 do Synapse**, a partir de `manifestos/RAN.jsonl` e `manifestos/SYN.jsonl`.
- O Axon (`@ironidesflj/axon@0.3.0`) é usado **apenas no build** para validar os manifestos; o Hub não depende dele no navegador.
- **A Camada de Mielina v3** (2.0.0): páginas dual-column com matriz de dissecção, síntese consolidada (baseline automática v1 + versões curadas), reputação/identicon em 4 níveis, filtros, ritual “Passei na prova!” e compositor guiado. A discussão é **100% UI nativa** (sem iframe do giscus); o **GitHub Discussions** é o back-end. Leitura estática com snapshot datado; escrita via `/api/mielina/*` (GitHub App OAuth) e sync horário gera `discussao/{PREFIX}.json`.
- O domínio principal é `noos.study`; `www.noos.study` redireciona para ele. A implantação é feita pela Vercel a partir da branch `main`.
- Versão do sistema: **2.0.0** — 63 testes Node + QA 68 asserções (fonte em `noos.registry.json`, replicada no rodapé PT/EN e verificada pelo CI).

O estado verificado e as pendências ficam em [current-state.md](current-state.md) e [plan.md](plan.md). A [constitution.md](constitution.md) define as regras permanentes; [spec-pagina-de-questao.md](spec-pagina-de-questao.md) descreve as páginas de questões e [spec-discussao-questao.md](spec-discussao-questao.md) a Camada de Mielina. O contrato dos dumps está em [discussao/README.md](discussao/README.md). O [noos.registry.json](noos.registry.json) é a fonte dos prefixos, status e versão do sistema.

## Desenvolvimento

O site usa HTML, CSS e JavaScript. O build gera páginas estáticas de questões e o sitemap; as páginas são apenas leitura.

```bash
npm ci
npm run build      # gera pt/q, en/q, redirects e sitemap
npm run qa         # valida a geração com o fixture local (61 asserções)
python3 -m http.server 8000
```

Abra `http://localhost:8000/`. O CI também verifica integridade PT/EN, placeholders, referências locais e a sincronia do registro (`sdd-lint`).

Consulte [DEPLOY.md](DEPLOY.md) para o fluxo de publicação. O conteúdo e o código seguem as condições em [LICENSE.md](LICENSE.md).
