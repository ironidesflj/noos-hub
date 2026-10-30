# Publicação do Noos Hub

O repositório GitHub `ironidesflj/noos-hub` é a fonte do projeto. A branch `main` está conectada ao projeto Vercel `noos-hub`; cada push inicia um deploy. `noos.study` é o domínio principal, `www.noos.study` redireciona para ele e `noos-hub.vercel.app` aponta para o mesmo projeto.

## Antes de publicar

```bash
npm ci
npm run build
npm run qa
```

Confira o diff, faça commit e push na `main`. Depois, confirme que o deploy terminou e abra `https://noos.study/pt/`, `https://noos.study/en/` e uma página de questão de cada manifesto. O build valida os manifestos e gera as páginas e o sitemap. Falhas de build impedem a publicação de um novo deploy.

## Domínio

Os registros DNS são administrados no GoDaddy. Use os valores mostrados em **Vercel → noos-hub → Domains**; eles podem mudar. Não altere o redirecionamento `www` → domínio nu sem atualizar os links canônicos e o sitemap.

O endereço `noos-hub.vercel.app` oferece uma URL alternativa do mesmo deploy. Ele não é uma cópia em hospedagem independente.
