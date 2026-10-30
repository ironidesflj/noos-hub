# Estado atual — Noos Hub

Revisão documental: 30/10/2026 · versão do sistema: **1.2.0**.

## Publicado no Hub

- `noos.study` é o endereço principal. `www.noos.study` redireciona para ele; `noos-hub.vercel.app` é outra URL do mesmo projeto Vercel.
- O Hub tem interface PT/EN e páginas estáticas de leitura para questões. O build consome `manifestos/*.jsonl`, valida cada linha pelo Axon `@ironidesflj/axon@0.2.2`, gera as páginas e atualiza o sitemap.
- `RAN.jsonl`: 300 questões DBDEA do Ranvier. `SYN.jsonl`: 431 questões de estudo do Synapse. No último build local: **731 aceitas, 0 rejeitadas, 1.462 páginas canônicas e 731 redirecionamentos sem idioma**.
- Synapse e Ranvier estão acessíveis e em constante atualização. “Em produção” não descreve o estágio comunicado pelo mantenedor para nenhum dos dois.
- O CI verifica placeholders, paridade PT/EN, referências locais, geração das páginas, sitemap e registro.

## Coordenação com os apps

- O manifesto do Synapse está integrado ao Hub. Os links de comunidade no app seguem no PR #15 do Synapse; sua ativação deve ser coordenada naquele repositório.
- O Ranvier já publica o manifesto. A URL canônica usada pelo botão do app depende de `NEXT_PUBLIC_NOOS_HUB_URL` no projeto Vercel do Ranvier; o repositório do Hub não controla essa configuração.
- Os manifestos ainda são copiados para este repositório. O transporte automático e a política para IDs retiradas continuam pendentes em [plan.md](plan.md).

## Limites

O Hub não guarda progresso nem respostas e não hospeda provas jogáveis. O pacote Axon é dependência de build, sem código do pacote no navegador. A URL `vercel.app` não oferece redundância de hospedagem independente.
