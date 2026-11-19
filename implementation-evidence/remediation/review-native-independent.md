# Revisão independente — B/native-release congelado

Data: 2026-11-19. Base HEAD: `0da9310ef8753782869b0aa38975ccfd5368d2f1`, incluindo os diffs locais solicitados. **Parecer: alterações B ainda não aprovadas; dois achados concretos abaixo.**

Escopo: `implementation-evidence/native-release/{profiles,review-context,fallback,technical-retry-scenario,lifecycle,lifecycle-validator,alignment,route-matrix}.mjs` e `scripts/native-evidence.test.mjs`. Lidos `implementation-evidence/release-governance/remediation-native.md` e o plano `implementation-evidence/remediation/plan.md`, B/Review07-01. `alignment.mjs` não tem diff local. C/D/E/root não foram reavaliados. Nenhuma edição de produção, rede, modelo, suíte completa ou subagente.

## Achados

### B-IND-01 — P1 — Root TASK END contraditório ainda autoriza progress em profiles

Referências: `implementation-evidence/native-release/profiles.mjs:1987` e `:2599`; comparação com `implementation-evidence/native-release/review-context.mjs:1398` e `:1437`.

O guard aceita `frame.isError === false` desde que `frame.aborted` e `frame.result.isError` não sejam verdadeiros. Ele não rejeita `frame.error`, `frame.failed === true`, `frame.success === false`, nem `result.aborted/failed === true` ou `result.success === false`. Os detalhes desse END entram como `origin: tool_execution_end`; `assertTerminalDispatch` usa sua presença como prova de END bem-sucedido. Assim um progress `completed`, com `exitCode:null`, papel/project e parent corretos, passa mesmo com essas contradições no END que o autoriza.

Reprodução pequena no código real, exportado temporariamente sem executar `main`: instanciar `RpcSession`, alimentar START de `task` com `toolCallId:dispatch` e assignment `PeerPositive/peer-reviewer`; alimentar END correlacionado com `isError:false`, `result.details:{results:[],async:true}` e uma contradição por vez; construir progress por `safeSubagentPayload` + `nativeProgressTerminalRecord`; chamar `observedSuccessfulTerminal` e `assertTerminalDispatch`. Controle limpo e os sete casos abaixo retornaram aceitação:

```text
{}                            accepted:true
{error:"failed Root"}          accepted:true
{failed:true}                  accepted:true
{success:false}                accepted:true
{result:{aborted:true}}        accepted:true
{result:{failed:true}}         accepted:true
{result:{success:false}}       accepted:true
```

Impacto: viola a condição de Root END bem-sucedido com flags consistentes exigida para aceitar AgentProgress sem exitCode. Os campos usados são os que os consumidores existentes já tratam; não se propõe novo campo SDK. Correção necessária: validar contradições do envelope antes de conceder autoridade aos detalhes e cobrir essa entrada real de `RpcSession` em uma tabela curta. Os testes atuais de profiles exercitam helpers e detalhes já montados, sem este guard de captura.

### B-IND-02 — P2 — Replay offline continua exigindo o zero que o produtor deixou de fabricar

Referências: `implementation-evidence/native-release/profiles.mjs:1103`, `:1116`, `:414`, `:1189` e `:2833`.

`nativeProgressTerminalRecord` agora preserva ausência de exitCode como `null`, e `assertPeerCase` publica esse mesmo valor em `peerCase.actual.exitCode`. Porém `extractOfflinePeerFrame` ainda exige `terminal.exitCode === 0` e `peerCase.actual.exitCode === 0`. Portanto uma captura válida pelo contrato AgentProgress 18.18.6, com os demais vínculos atendidos, não pode atravessar o replay offline. A atualização de `loadOfflinePeerProgress` para o consumer específico do canal não resolve isso: a extração falha antes.

Reprodução: chamar o `extractOfflinePeerFrame` real, exportado temporariamente, com fixture/revisões/diff correspondentes, caller único `PeerPositive/peer-reviewer` com solutionSpace/hash válidos, terminal `completed` e caso APROVADO com consumer aceito, ambos com `exitCode:null`. Resultado: `offline full evidence PeerPositive terminal was not a completed native progress record`. Mesmo corrigindo apenas esse primeiro guard, o segundo em `:1116` continua bloqueando o caso publicado pelo produtor atual.

Correção necessária: alinhar a extração offline ao contrato do canal, mantendo o `null` e exigindo Root END/binding/flags consistentes; SingleResult continua exigindo zero observado. Não restaurar a fabricação de zero para viabilizar replay.

## Verificação delimitada dos demais controles

- Dispatch/papel: profiles exige assignment Root único, parent exato e `agentSource:project`; review-context retém toolCallId e parent reais, exige START correlacionado e bloqueia seus ENDs contraditórios. A exceção é B-IND-01.
- Canal: progress exige exatamente `completed`, não fabrica zero e rejeita erro/abort/exit inválido; SingleResult exige inteiro zero observado. Regra e fonte SDK v18.18.6 consideradas conforme o ledger `remediation-native.md` (`packages/tui/src/tools/task.ts` e `packages/coding-agent/src/task/index.ts`); sem consulta de rede ou certificação nova do SDK.
- READ: fallback exige texto retornado e START aberto com mesmo call/tool, rejeitando END órfão (`fallback.mjs:847`, `:1152`).
- Findings: sanitização/assembly preservam placeholders inválidos e impedem que terminal masque findings tipados malformados (`fallback.mjs:453`, `:1679`, `:1693`).
- Offline bounded: abertura única, `fstat`, limite regular-file de 64 MiB e leitura limitada antes de JSON (`profiles.mjs:1139`).
- Retry: papel first/second validator e origem project são exigidos; binding de host mantém Root/session/dispatch/job/instance/tool/ordinais, e elegibilidade inclui `firstHost.ok/secondHost.ok` (`technical-retry-scenario.mjs:936`, `:1118`, `:2322`). Nenhum novo achado nesses diffs.
- Review07-01: reexecuta o consumer Ship file-backed e compara proof digest imediatamente antes de `evaluateLifecycle`; o gate revalidado participa da decisão final (`lifecycle.mjs:1320`, `:7341`, `:7359`). O teste real cobre substituição de contexto e fonte de receipt. Aprovação delimitada desta integração B, sem reabrir a implementação compartilhada de quality.
- Os seis pins atuais de `route-matrix.mjs` coincidem com bytes e SHA-256 dos arquivos reais. O diff de `lifecycle-validator.mjs` exige `nlink === 1`; nenhum novo achado no diff.

## Evidência executada e limites

`node node_modules/vitest/vitest.mjs run scripts/native-evidence.test.mjs`: **32/32 passaram**, Node 22.23.2 / Vitest 4.1.12, Windows. Reproduções acima executaram somente consumidores exportados em cópia temporária; diretório temporário removido ao final. Verificação dos seis pins: 6/6 correspondentes. Esses testes verdes não cobrem os dois caminhos apontados.

Não é aprovação Native OMP, de OS completo ou de integração global. Somente este parecer foi adicionado ao working tree; produção e testes permaneceram congelados.
