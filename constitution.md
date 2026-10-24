# constitution — o hub Noos (noos.study)

Documento permanente · out/2026

O hub é a **marca-mãe** do ecossistema Noos. Ele não é um sexto app — não
compete com os filhos, não hospeda estudo, não guarda aluno. Este documento
trava o que o hub é e o que ele jamais faz, para que a mãe nunca vire
gargalo nem produto de si mesma. Regras de identidade visual vivem no Manual
de Identidade v1.0; regras de interface dos apps, no Guia de aplicação nos
apps; a governança da mãe, no Guia de atualização da marca-mãe; o contrato
técnico compartilhado (IDs, `manifest.jsonl`, deep-link), na `constitution.md`
do repositório do **Axon** (`@noos/axon`). Em conflito, vale a camada mais
específica do assunto — e conflito se resolve por RFC, não por silêncio.

## O hub nunca

1. **Nunca hospeda prova jogável.** Prévia de questão é leitura: sem seleção,
   cronômetro, resultado ou progresso. Estudar mora nos apps.
2. **Nunca guarda dado privado de estudo.** Respostas, erros, histórico e
   decks ficam no dispositivo, dentro do app. Nada privado atravessa a mãe.
3. **Nunca emite ID de questão.** O hub é o **registro**: reserva prefixos,
   valida formato, guarda aliases e lê IDs — quem emite é o app, dono do
   namespace (`SYN-*` só sai do Synapse, `RAN-*` só do Ranvier).
4. **Nunca se assina.** Zero ocorrências de "by Noos" em qualquer superfície
   da marca-mãe — site, OG, favicon, apresentação, rodapé. A assinatura é
   endosso do filho; a mãe não se endossa.
5. **Nunca é gargalo.** O hub funciona com **zero apps no ar** (domínios sem
   app ficam "no horizonte", sem cartão falso), e nenhum app depende dele em
   runtime: badge e deep-link são links, não dependências.
6. **Nunca usa cor de app como interface.** As cinco colorações são **dado do
   registro** (pontos e selos de status nos cartões da família); ação primária
   e seleção usam o accent Noos. Ink de app nunca vira botão do hub.

## O hub sempre

1. **Sempre devolve o usuário ao app.** Todo caminho de estudo termina em um
   app; a vitrine aponta para fora de si.
2. **Sempre ingere manifestos — nunca consulta apps.** A ingestão do
   `manifest.jsonl` acontece no build (agendado ou por hook), com as regras
   do contrato do Axon: **linha inválida é rejeitada com log e o build
   segue**; o hub nunca corrige o arquivo de origem; se o banco fica offline,
   o último build bom continua servindo.
3. **Sempre honra a ID publicada.** Dono da URL canônica
   (`noos.study/{pt|en}/q/{ID}`): alias eterno com redirect **301**, nunca
   404 em ID já publicada — nem para IDs legadas (`GLI-`).
4. **Sempre publica a fonte única.** O registro da família mora em
   `noos.registry.json` neste repositório — prefixos, status e a versão do
   sistema; o CI valida e mantém o site em sincronia com o arquivo. Guias
   referenciam; não duplicam.
5. **Sempre é bilíngue de nascença.** PT e EN como cidadãs de primeira
   classe (paridade de âncoras e metas verificada em CI); idioma do
   dispositivo primeiro, fallback EN; nomes de app e rótulos de status do
   registro não se traduzem.
6. **Sempre carrega a identidade na fonte.** Tokens nascem aqui
   (`assets/noos-tokens.css`); apps importam e estendem com a coloração do
   domínio — nunca redefinem `--bg`, `--fg` ou `--accent`.

## Invariantes de estudo (herdados da Carta, cap. 7)

- Estudar não exige conta — nem no app, muito menos na mãe.
- Offline é estado normal, não exceção: nos apps por desenho; no hub, a
  leitura continua com o último registro e a data do build no rodapé.
- O essencial de cada lado funciona sem o outro — a árvore perde qualquer
  galho sem perder os outros.

## Como esta constitution muda

Mudança aqui é RFC (modelo no Anexo A do Guia de atualização da marca-mãe),
commit neste repositório, entrada no changelog com nível semver do sistema e
motivo. A versão do sistema vive em `noos.registry.json` e aparece no rodapé
de cada página — o CI as mantém iguais.
