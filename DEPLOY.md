# Deploy — noos.study (primário) + Vercel (backup sempre atualizado)

> **Versão deste pacote: v7** — ela **acumula tudo da v6** (que nunca foi
> empurrada). Um único `git push` coloca v6+v7 no ar juntos. O rodapé passa
> a mostrar `Sistema Noos v1.1.1 · build out/2026` e o CI ganha o job
> `sdd-lint` (arquivos SDD + registro `noos.registry.json` em sincronia).
> Se o repo já recebeu versões anteriores, suba por cima (`--force` se
> necessário — ver seção 1).

Arquitetura pedida pelo mantenedor: o hub responde em **noos.study** como
endereço primário, e uma **cópia na Vercel** funciona como backup — sempre
atualizada a cada push. O repositório é estático (sem build), então as duas
hospedagens recebem exatamente os mesmos arquivos.

```
git push → GitHub (fonte da verdade)
              ├──→ Vercel: deploy automático  → noos-hub.vercel.app   (backup)
              └──→ Hospedagem primária       → noos.study             (domínio)
```

---

## 1. GitHub (fonte da verdade)

1. Crie o repositório — sugestão de nome: `noos-hub` (público ou privado,
   tanto faz para a Vercel).
2. Suba o conteúdo desta pasta:

```bash
cd noos-hub
git init
git add .
git commit -m "hub F1: manifesto bilíngue, família, Contribua, Feedback, Contato, Fig. 01"
git remote add origin git@github.com:ironidesflj/noos-hub.git
git push -u origin main
```

> Se o repositório `ironidesflj/noos-hub` já foi criado com conteúdo
> (README automático do GitHub, por exemplo), suba por cima:
> `git push -u origin main --force` na primeira vez, a partir desta pasta.

## 2. Vercel — o backup sempre atualizado

1. [vercel.com](https://vercel.com) → **Add New… → Project** → importe
   `noos-hub`.
2. Framework Preset: **Other** (é estático; zero configuração — o
   `vercel.json` já cuida de `cleanUrls`, `trailingSlash` e headers).
3. **Nomeie o projeto `noos-hub`** — a URL pública vira
   `noos-hub.vercel.app`, que é o **fallback canônico** previsto no plano B
   do domínio (Carta do Projeto, cap. 12) e citado no rodapé do site.
4. Deploy.

A partir daqui, **todo `git push` na `main` gera um novo deploy automático**
na Vercel — o backup nunca fica dessincronizado. É isso que o mantém
“sempre atualizado”: não há passo manual nenhum.

> **Termo de uso (importante).** O plano **Hobby** (gratuito) da Vercel é
> **não-comercial**. Enquanto o hub não tem anúncios, Hobby está correto.
> Quando os anúncios éticos entrarem (F2+), são duas saídas: **Vercel Pro**
> (US$ 20/mês) ou mover o espelho para **Cloudflare Pages** (gratuito,
> banda ilimitada, comercial por padrão — Carta, cap. 12). O repositório
> funciona nas duas sem mudança alguma.

## 3. noos.study — o domínio primário

O domínio já é do mantenedor. Duas maneiras de apontá-lo, escolha uma:

### Opção A (recomendada para começar): domínio na própria Vercel

O `noos.study` aponta para o mesmo projeto, e `noos-hub.vercel.app` continua
existindo como URL de redundância — o backup e o primário passam a ser o
mesmo deploy, atualizado no mesmo push.

1. No painel da Vercel: **Settings → Domains → Add** → `noos.study`.
2. No registrador do domínio, crie os registros que a Vercel mostrar
   (normalmente):
   - `A` `@` → `76.76.21.21`
   - `CNAME` `www` → `cname.vercel-dns.com`
3. Aguarde o certificado (TLS automático, Let's Encrypt).

### Opção B: hospedagem primária separada (Vercel só como espelho)

Use esta se quiser o site principal em outra hospedagem (cPanel, SFTP,
GitHub Pages…). Como não há build, basta subir os arquivos:

- **GitHub Pages**: Settings → Pages → Deploy from branch → `main` / root;
  depois adicione `noos.study` como custom domain (CNAME no DNS do
  registrador apontando para `ironidesflj.github.io`).
- **cPanel/SFTP**: arraste o conteúdo desta pasta para `public_html`.
- **Rsync**:
  `rsync -av --delete ./ user@host:/var/www/noos/`

Nesta opção, lembre-se de repetir o upload a cada mudança — o primário só
atualiza quando você sobe; a Vercel, sozinha, continua atualizando o backup
a cada push. Se quiser sincronia total sem pensar, prefira a Opção A.

## 4. Sempre que mudar algo no site

```bash
git add .
git commit -m "descreva a mudança"
git push
```

- Vercel: atualiza sozinha (produção + backup vercel.app na Opção A).
- Opção B: repita o upload para a hospedagem primária.

## 5. Se o domínio não puder ser renovado um dia (plano B)

Já desenhado (Carta, cap. 12):

1. **O domínio é verniz, não fundação** — o hub continua respondendo em
   `noos-hub.vercel.app`; o rodapé de cada página e o badge “by Noos” nos
   apps apontam para lá.
2. **Nenhum conteúdo é refém** — dumps públicos periódicos em JSON no
   repositório permitem ressuscitar o hub em qualquer hospedagem gratuita
   em horas.
3. No pior caso, os apps continuam 100% funcionais: nunca dependeram do hub
   para estudar. O ecossistema não quebra — emagrece.
