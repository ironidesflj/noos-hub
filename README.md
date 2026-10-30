# Noos Hub

[noos.study](https://noos.study) é o ponto de entrada bilíngue do ecossistema Noos. Apresenta os apps, o manifesto e páginas públicas de questões. O estudo, o progresso e as respostas ficam nos apps.

## Estado atual

- **Synapse** e **Ranvier** estão acessíveis e em constante atualização. Os outros nomes da família estão no horizonte.
- O Hub publica páginas de leitura para 431 questões do Synapse e 300 do Ranvier a partir de `manifestos/SYN.jsonl` e `manifestos/RAN.jsonl`.
- O Axon (`@ironidesflj/axon@0.2.2`) é usado no build para validar os manifestos. O Hub não depende dele no navegador.
- O domínio principal é `noos.study`; `www.noos.study` redireciona para ele. A implantação é feita pela Vercel a partir da branch `main`.

O estado verificado e as pendências ficam em [current-state.md](current-state.md) e [plan.md](plan.md). A [constitution.md](constitution.md) define as regras permanentes; [spec-pagina-de-questao.md](spec-pagina-de-questao.md) descreve as páginas de questões. O [noos.registry.json](noos.registry.json) é a fonte dos prefixos, status e versão do sistema.

## Desenvolvimento

O site usa HTML, CSS e JavaScript. O build gera páginas estáticas de questões e o sitemap. As páginas são apenas leitura; o retorno ao app usa a URL registrada para cada namespace.

```bash
npm ci
npm run build
python3 -m http.server 8000
```

Abra `http://localhost:8000/`. `npm run qa` valida a geração com o fixture local. O CI também verifica a integridade PT/EN, os placeholders e o registro.

Consulte [DEPLOY.md](DEPLOY.md) para o fluxo de publicação. O conteúdo e o código seguem as condições em [LICENSE.md](LICENSE.md).
