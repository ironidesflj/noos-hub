# Configurar a participação da Mielina (GitHub App + Vercel)

Objetivo: sair do modo **somente leitura** (APIs `503 ENV_MISSING`) para voto,
comentário, proposta e curadoria reais. Leitura estática continua funcionando
em qualquer caso.

## 1. Criar a GitHub App

1. Abra <https://github.com/settings/apps/new> (conta `ironidesflj`) ou, para uma
   organização, Settings → Developer settings → GitHub Apps → New GitHub App.
2. Nome sugerido: `Noos Mielina`.
3. **Homepage URL:** `https://noos.study`
4. **Callback URL / User authorization callback URL:**
   `https://noos.study/api/mielina/auth/callback`
5. **Webhook:** deixe desmarcado ("Active" off) — o sync usa Actions, não webhook.
6. **Repository permissions:**
   - `Contents: Read` (ler dumps/reputação em `main`)
   - `Discussions: Read and write` (comentar, reagir, propostas)
   - `Metadata: Read` (obrigatório)
7. **Where can this GitHub App be installed?** apenas nesta conta (ou org).
8. Salve e guarde **Client ID**; gere **Client secret** e guarde com segurança.

## 2. Instalar a App no repositório

Na página da App → **Install App** → escolha `ironidesflj/noos-hub` →
**Install**. Sem a instalação, o token OAuth do usuário não enxerga as
Discussions do repositório.

## 3. Gerar o segredo de sessão

No terminal:

```bash
openssl rand -base64 48
```

Use o resultado como `MIELINA_SESSION_SECRET` (não reuse em outro serviço).

## 4. Criar o token de dispatch (curadoria)

A API dispara o workflow protegido `curadoria-sintese.yml` via
`repository_dispatch`. Crie um token com permissão de escrita:

- **Fine-grained PAT:** Settings → Developer settings → Personal access tokens
  → Fine-grained tokens → Generate new token; repositório `ironidesflj/noos-hub`;
  permission **Contents: Read and write** (necessária para `repository_dispatch`).
- Guarde como `MIELINA_DISPATCH_TOKEN`.

## 5. Configurar as variáveis na Vercel

Vercel → projeto `noos-hub` → Settings → Environment Variables.
Adicione em **Production** e **Preview** (sensíveis ficam encrypted):

| Variável | Valor |
|---|---|
| `MIELINA_GITHUB_CLIENT_ID` | Client ID da App |
| `MIELINA_GITHUB_CLIENT_SECRET` | Client secret (sensível) |
| `MIELINA_SESSION_SECRET` | saída do `openssl rand` (sensível) |
| `MIELINA_BASE_URL` | `https://noos.study` |
| `MIELINA_DISPATCH_TOKEN` | PAT com Contents write (sensível) |
| `MIELINA_ALLOWED_ORIGINS` *(opcional)* | previews, ex. `https://noos-hub-git-*.vercel.app` |
| `MIELINA_REPO` *(opcional)* | `ironidesflj/noos-hub` |
| `MIELINA_DISCUSSION_CATEGORY_ID` *(opcional)* | ID da categoria Q&A |

Depois de salvar, **faça um redeploy** (Deployments → ⋯ → Redeploy) para as
funções lerem as variáveis novas. Variável nova não afeta deploy antigo.

## 6. Validar

```bash
# sem segredo de sessão antes: 503; depois deve ser 200
curl -s https://noos.study/api/mielina/me/ | head -c 300

# esperado sem sessão:
# {"authenticated":false,"observedAt":"..."}
```

No navegador:

1. Abra `https://noos.study/pt/q/RAN-DBDEA-00001/`.
2. Clique em `▲ Acelerar`: deve redirecionar para o GitHub (autorizar a App) e,
   no retorno, o contador vir do GitHub.
3. DevTools → Application → Cookies: `mielina_session` deve ser
   `HttpOnly; Secure; SameSite=Lax`.
4. Faça uma contribuição; o workflow `sync-discussao.yml` (de hora em hora)
   leva o comentário para `discussao/{PREFIX}.json`.
5. Para curadoria, a conta precisa de Tier 3/4 em `discussao/reputation.json`
   (ou constar em `curators`); o botão `✦ Curadoria` só aparece para quem tem
   sessão/permissão.

## 7. Branch protection

O workflow de curadoria commita em `main` via `GITHUB_TOKEN`. Se a branch
protegida bloquear, habilite **Allow specified actors to bypass required pull
requests** para o GitHub Actions (ou use um token de App com bypass). Sem isso,
a aprovação fica registrada mas o commit é rejeitado.

## 8. Rollback

Remova as variáveis e faça redeploy: as APIs voltam a `503` (fail-closed), o
site estático continua, o clique em ▲ mostra tooltip de indisponibilidade e o
compositor cai no fallback GitHub Discussions.
