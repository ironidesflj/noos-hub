# spec-rodape-versao

Especificação do hub (noos.study) · estado: **implementada na v7**

## Problema

O Guia de atualização da marca-mãe (checklist, item "Publicação") exige que
o rodapé mostre **a versão do sistema e a data do build** — a versão da mãe
é um contrato público, "não um número de rodapé" que ninguém vê. O hub
violava o próprio guia no dia em que ele nasceu: o rodapé tinha licença,
domínio de fallback e copyright, mas nenhuma versão. Sem versão publicada,
não há como saber qual build está no ar nem qual changelog reivindicar.

## Contrato

- O rodapé de **cada página** (PT e EN) exibe uma linha adicional:
  - PT: `Sistema Noos v2.0.0 · build nov/2026`
  - EN: `Noos system v2.0.0 · build Nov/2026`
- **Fonte única:** a versão vem de `noos.registry.json` (`version`). Como o
  hub é estático (sem build de aplicação), a string é editada no HTML junto
  com o registro — e o **CI (`sdd-lint`) garante que não divergem**: o job
  falha se PT ou EN não contiverem a versão do registro.
- Formato da data: mês/ano (out/2026), o mesmo granularity do changelog dos
  guias — o hub é editado à mão, e uma data de dia viraria mentira na
  primeira semana.

## Aceitação (evidência de conclusão)

- String presente em `pt/index.html` e `en/index.html`. ✅
- `sdd-lint` local verde: versão do registro = versão nos dois rodapés. ✅
- Rodapé continua `flex-wrap` — sem overflow horizontal em 390 px. ✅
  (verificado no QA da v7)

## Efeito no manifesto

Nenhum — mudança de superfície da mãe.

## Efeito no hub

O rodapé passa a responder "qual sistema está no ar"; a partir da v7, todo
changelog de sistema precisa atualizar três lugares juntos (registry, PT,
EN) — e o CI pega quem esquecer.

## Efeito no Axon

Nenhum.

## Fora de escopo

Build timestamp automático (exigiria pipeline de build — o hub é estático);
histórico de versões no rodapé (isso é papel do changelog do sistema).
