# Noos — hub noos.study

O site-vitrine do ecossistema Noos (Fase 1): manifesto bilíngue, família de
apps, Contribua, Feedback e Contato — com a **Fig. 01 — Campo Noosférico**
girando no hero, exatamente como no Manual de Identidade.

Aplicação 1:1 do projeto de identidade entregue (`Noosfera.zip`): tokens,
símbolos, tipografia (Newsreader / Instrument Sans / IBM Plex Mono) e
componentes — sem redesenho.

---

## Por que HTML estático (e não Next.js)

Decisão documentada, alinhada à Carta do Projeto e SDD:

1. **Fig. 01 intocada.** O campo noosférico vive em `js/campo-noosferico.js`
   como transplante byte a byte do manual (`index.html` do Noosfera.zip,
   linhas 1941–2053). Engenharia sem framework é a única que preserva o globo
   *sem alterá-lo* — o algoritmo, as constantes e o comportamento são idênticos.
2. **Identidade sem tradução para outra stack.** O sistema veio pronto em
   HTML/CSS puro; reescrevê-lo em Tailwind/shadcn seria redesenho.
3. **Portabilidade total.** Sem build, o hub roda em qualquer hospedagem —
   Vercel, Cloudflare Pages, GitHub Pages, cPanel — e o plano B do domínio
   (Carta, cap. 12) exige exatamente isso: ressuscitar em horas em qualquer
   hospedagem gratuita.
4. **A Fase 1 não tem backend.** Estudar não exige conta; Contato é redirecionamento
   (formulário é backend); discussões ficam no GitHub até a Fase 3.

**Caminho de upgrade:** quando a Fase 2 pedir interação real (quadro nativo,
votação), os arquivos sobem para Next.js — o SDD (cap. 8) já prevê essa
arquitetura; os componentes e tokens entram como estão.

## Estrutura

```
noos-hub/
├── index.html              página-gateway: idioma do dispositivo → /pt/ | /en/ (fallback EN)
├── pt/index.html           versão português (língua fundadora)
├── en/index.html           versão inglês (fallback universal)
├── 404.html                página 404 bilíngue
├── assets/
│   ├── noos-tokens.css     tokens da identidade (fonte única de verdade)
│   ├── noos-mark.svg       símbolo positivo
│   ├── noos-mark-negative.svg
│   ├── noos-compact.svg    símbolo compacto
│   ├── favicon.svg         compacto + prefers-color-scheme (referenciado como /assets/favicon.svg)
│   ├── og-image-pt.png     imagem de compartilhamento 1200×630 (PT)
│   └── og-image-en.png     imagem de compartilhamento 1200×630 (EN)
├── css/noos.css            estilos (componentes do manual, breakpoints idênticos)
├── js/campo-noosferico.js  ⚠ Fig. 01 — NÃO EDITAR
├── js/noos.js              tema + idioma persistente + ano
├── .github/workflows/ci.yml  CI: gate de placeholders + integridade PT/EN
├── vercel.json             cleanUrls, trailingSlash, headers de segurança
├── robots.txt · sitemap.xml
├── LICENSE.md              CC BY-SA 4.0 (conteúdo) + MIT (código) — ver arquivo
├── README.md               este arquivo
└── DEPLOY.md               noos.study + Vercel (backup sempre atualizado)
```

## Regras da identidade aplicadas (Manual §11 — “Antes de publicar”)

- O nome do app vem antes do “by Noos”; a assinatura é endosso, nunca título.
- A abertura e o nó-luz continuam no lugar (símbolos usados sem variação).
- Uma coloração por app (`--synapse`, `--ranvier`, …); o accent Noos não vira
  cor genérica de interface.
- Sem gradiente, sombra ou contorno no símbolo; sem ícone dentro da esfera.
- “Noos” não recebe acento, trema, hífen ou tradução; “noosfera” é que flexiona.
- Nenhum anúncio entre o estudante e a resposta (nenhum anúncio em absoluto, na F1).

## Idioma (Carta, cap. 7)

- O idioma do dispositivo manda; **inglês é o fallback universal**.
- Troca manual sempre visível (PT/EN no cabeçalho e rodapé) e persiste
  (`localStorage: noos-lang`).
- URLs bilíngues `/pt/` e `/en/` com `hreflang` — o link compartilhado abre no
  idioma de quem o recebeu.

## Tema

Claro/escuro com a mesma chave do manual (`localStorage: noos-theme`,
`data-theme="dark"`). Ao trocar, o Campo Noosférico é re-colorido via
`window.__noosField.refresh()` — mesmo comportamento do manual.

## ✅ Dados do mantenedor — preenchidos (out/2026)

Todos os placeholders `EDITAR`/`EDIT` foram preenchidos e os comentários
removidos. Onde cada dado mora (para trocar no futuro):

| Dado | Valor | Onde (PT e EN) |
|---|---|---|
| GitHub (repo) | `github.com/ironidesflj/noos-hub` | seção Contribua — Código |
| Chave Pix | `c8cf26ac-db17-4d7d-a268-1bdb5c4f6b5c` (aleatória) | seção Contribua — Sustento |
| GitHub Sponsors | `github.com/sponsors/ironidesflj` | seção Contribua — Sustento |
| Quadro de Feedback | `github.com/ironidesflj/noos-hub/discussions` | seção Feedback |
| E-mail | `noos.study@gmail.com` | seção Contato |
| LinkedIn | `linkedin.com/in/ironjunior` | seção Contato |
| GitHub (perfil) | `github.com/ironidesflj` | seção Contato |

Licença de código **decidida: MIT** (justificativa e nota de marca em
`LICENSE.md`); rodapés PT/EN já diziam “Código MIT” — nada a mudar.

> **Ativar o Discussions:** o quadro de Feedback aponta para
> `/discussions` do repo. Ative em GitHub → **Settings → General →
> Features → Discussions** (um clique) para o link responder em vez de 404.
> O rodapé do site avisa “chegando com a Fase 2”, mas o quadro em si é
> gratuito e pode abrir antes.

## CI — o gate de placeholders

O GitHub Actions (`.github/workflows/ci.yml`) roda a cada push com dois jobs:

- **Gate de placeholders** — falha se algum `EDITAR`/`EDIT` voltar a aparecer
  em qualquer página (o gate protege o estado preenchido; se você adicionar
  um dado novo no futuro, entra o valor de uma vez — nunca placeholder).
- **Integridade e paridade PT/EN** — âncoras/seções idênticas nas duas línguas,
  mesmo número de metas sociais, toda referência local (`href`/`src`)
  apontando para arquivo existente e sitemap cobrindo `/pt/` e `/en/`.

> O job de integridade já pegou um bug real na v1: o favicon era referenciado
> como `/favicon.svg` mas vivia em `assets/` — corrigido para
> `/assets/favicon.svg`.

## Pré-visualização local

```bash
cd noos-hub
python3 -m http.server 8000
# http://localhost:8000/  → redireciona para /pt/ ou /en/
```

(E o mesmo comando serve a pasta em qualquer hospedagem estática.)

## Deploy

Ver **DEPLOY.md** — domínio `noos.study` (primário) + **Vercel como backup
sempre atualizado** (deploy automático a cada push).

## Backlog conhecido (não bloqueia o ir ao ar)

- **Link no cartão Ranvier** (seção 02 Família): adicionar quando o app
  tiver URL pública — decisão do mantenedor: fica para depois.
- Self-host das fontes (hoje: Google Fonts via CDN), CSS de impressão,
  CSP mais estrita, segundo espelho no Cloudflare Pages (P2/F3 — ver
  relatório *Revisão do Time — Estado Atual*, Tabelas 8–9).
