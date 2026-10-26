# manifestos/

Um arquivo `.jsonl` por app (namespace) — `RAN.jsonl`, `SYN.jsonl`, … —, uma
linha por questão, os 9 campos do contrato (constitution do Axon, §2;
spec-schema). O arquivo é substituído por inteiro a cada atualização e é
servido publicamente em `noos.study/manifestos/{PREFIXO}.jsonl` — a
proveniência de toda página `/q/{ID}` aponta para cá.

Como um manifesto chega até aqui (transporte, gate do emissor, retenção do
último build bom por ID) é o spec de ingestão — Fase 2, item 2 do `plan.md`.
Não editar à mão: o build valida cada linha com o mesmo parser que o app
usa para publicar (linha inválida é rejeitada com log e o build segue).
