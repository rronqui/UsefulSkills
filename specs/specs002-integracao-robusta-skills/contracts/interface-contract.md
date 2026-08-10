# Interface Contract: specs002-integracao-robusta-skills

> **Versão:** 0.1.0
> **Status:** DRAFT
> **Feature:** `specs002-integracao-robusta-skills`
> **Motivo do contrato:** a feature não cria uma API de produto, mas altera fronteiras
> persistentes e operacionais: `progress.json`, resultado normalizado de deep-review,
> payload/saída de `ship`, inventário do instalador e configuração de release/CI.

## Escopo

Este contrato cobre os dados que atravessam uma retomada do `tdd-orchestrator`, o
agregador `deep-review` e os comandos de instalação/deploy/release. Ele não substitui os
schemas das APIs do GitHub, `gh` ou release-please; esses provedores continuam sendo
resolvidos pelas ferramentas existentes e qualquer falha é representada como erro
fail-closed local.

As regras de comportamento estão ancoradas em [spec.md](../spec.md), especialmente
AC-001–AC-030, e a sequência de implementação está em [plan.md](../plan.md). A versão
0.1.0 é um contrato inicial de execução. Enquanto estiver `DRAFT`, nenhum agente pode
tratar um payload novo como compatível sem a validação do orchestrator.

## Schemas

### Request — estado persistido do TDD (`progress.json`)

O JSON é a fonte da verdade e usa `schema_version: "2.2"`. O exemplo mostra os campos
load-bearing; objetos de tarefa devem conter todos os dez gates e seus pares de
`gate_origins`/`gate_evidence`.

```json
{
  "schema_version": "2.2",
  "run_id": "<ISO-8601>",
  "task_source": "TASKS.md",
  "updated_at": "<ISO-8601>",
  "repo": {
    "branch_start": "main",
    "branch_work": "feat/example",
    "merge_target": "main",
    "delivery": "internal",
    "merge_status": "",
    "pr_url": "",
    "head_start": "<sha>",
    "head_current": "<sha>",
    "dirty_at_start": false
  },
  "baseline": {
    "status": "PASS",
    "tests": "PASS",
    "tests_evidence": "npm test — trecho PASS",
    "build": "NA",
    "build_evidence": "ship.config.json: buildCommand=null",
    "override_approved": false,
    "known_failures": []
  },
  "spec_kit": {
    "spec": "./specs/<feature>/spec.md",
    "plan": "./specs/<feature>/plan.md",
    "tasks": "./specs/<feature>/tasks.md",
    "status": "WRITTEN",
    "written_at": "<ISO-8601>",
    "mode": "created"
  },
  "contract": {
    "file": "./specs/<feature>/contracts/interface-contract.md",
    "version": "0.1.0",
    "status": "DRAFT",
    "na_reason": ""
  },
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "desc": "<descrição>",
      "source": "./specs/<feature>/spec.md#criterios-de-aceite",
      "tasks": ["T-001"],
      "status": "PENDING"
    }
  ],
  "waves": [
    {
      "wave": 1,
      "status": "in_progress",
      "integration": { "status": "pending", "evidence": "" },
      "tasks": [
        {
          "id": "T-001",
          "title": "<título>",
          "phase": "VALIDATE",
          "attempt": 0,
          "allowed_write_globs": ["ship/**"],
          "acceptance_criteria": ["AC-001"],
          "implemented_by": "backend-developer",
          "reviewed_by": "peer-reviewer",
          "red": {
            "status": "PASS",
            "failing_tests": [],
            "failure_reason_expected": true,
            "criteria_to_tests": {
              "AC-001": ["ship/bin/ship.test.mjs::default suja bloqueia deploy"]
            },
            "revision_delta": { "ac": "", "test": "", "evidence": "" },
            "revision_baseline_tests": {}
          },
          "green": {
            "status": "PASS",
            "reason_if_skipped": "",
            "changed_files": ["ship/bin/ship.mjs"],
            "tooling_evidence": "",
            "tooling_suite_evidence": ""
          },
          "refactor": { "status": "SKIPPED", "reason_if_skipped": "sem alteração" },
          "doc_impact": "none",
          "gates": {
            "tests": "PASS",
            "traceability": "PASS",
            "spec_kit": "PASS",
            "coverage": "PASS",
            "lint": "PASS",
            "type_check": "PASS",
            "build": "NA",
            "security": "PASS",
            "contract": "PASS",
            "git_sanity": "PASS"
          },
          "gate_origins": {
            "tests": "", "traceability": "", "spec_kit": "", "coverage": "",
            "lint": "", "type_check": "", "build": "", "security": "",
            "contract": "", "git_sanity": ""
          },
          "gate_evidence": {
            "tests": "comando + trecho PASS",
            "traceability": "AC-001 -> arquivo::teste",
            "spec_kit": "quatro arquivos encontrados",
            "coverage": "comando + trecho PASS",
            "lint": "comando + trecho PASS",
            "type_check": "comando + trecho PASS",
            "build": "buildCommand=null; NA justificado",
            "security": "comando + trecho PASS",
            "contract": "versão 0.1.0 respeitada",
            "git_sanity": "status/diff-check PASS"
          },
          "blockers": [],
          "evidence": "<evidência redigida>"
        }
      ]
    }
  ]
}
```

**Invariantes do estado:**
 
Enumerações normativas:

| Campo | Valores aceitos |
|---|---|
| `repo.delivery` | `internal`, `external` |
| `spec_kit.status` | `PENDING`, `WRITTEN` |
| `spec_kit.mode` | `created`, `updated_in_place` |
| `contract.status` | `DRAFT`, `APPROVED`, `NA` (somente com `na_reason`) |
| `acceptance_criteria.status` | `PENDING`, `COVERED`, `IMPLEMENTED`, `VALIDATED` |
| `wave.status` | `pending`, `in_progress`, `integrating`, `completed` |
| `integration.status` | `pending`, `PASS`, `FAIL` |
| `task.phase` | `PENDING`, `RED`, `RED_REVISION`, `GREEN`, `GREEN_FIX`, `TOOLING_FIX`, `REFACTOR`, `REFACTOR_FIX`, `REVIEW`, `DOC`, `VALIDATE`, `DONE`, `BLOCKED` |
| `red.status` | `PENDING`, `PASS` |
| `green.status` | `PENDING`, `PASS`, `SKIPPED` |
| `refactor.status` | `PENDING`, `PASS`, `SKIPPED` |
| `doc_impact` | `none`, `applied` |
| cada gate | `pending`, `PASS`, `FAIL`, `NA` |

`gate_origins.<gate>` é vazio quando o gate não está `FAIL`; `gate_evidence.<gate>`
deve ser string não vazia para `PASS`, `FAIL` ou `NA`. `baseline.tests` e
`baseline.build` aceitam `PASS`, `FAIL`, `NA` e `NOT_RUN`; `baseline.status` aceita
`PASS`, `FAIL` e `NOT_RUN`. O validator deve rejeitar valores em caixa diferente,
campos ausentes ou combinações impossíveis, em vez de normalizá-los silenciosamente.


- `phase`, `status`, `gates`, `gate_origins` e `contract.status` aceitam somente os
enums definidos no schema do orchestrator; valores desconhecidos bloqueiam a retomada.
- Uma chave AC→teste deve ser exatamente um AC da tarefa e cada lista executável deve
  ser não vazia de strings `arquivo::teste`; `NA` exige motivo e evidence no artefato
  documental apontado.
- `DONE` só é válido com todos os gates `PASS`/`NA` e `gate_evidence` não vazia,
  review independente, integração `PASS`, blockers vazio e ACs em estado final.
- Migração/resume preserva evidências válidas; limpeza é limitada aos campos
  explicitamente invalidados pela transição. Divergência entre JSON e working tree
  bloqueia em vez de ser resolvida por inferência.

### Request — rodada de deep-review

```json
{
  "mode": "PR",
  "repository": "owner/repo",
  "pull_request": 30,
  "patch_source": {
    "kind": "gh-pr-diff|pr-uri",
    "uri": "pr://owner/repo/30/diff/all",
    "sha": "<head-sha>"
  },
  "consumer_context": {
    "revision": "<head-sha>",
    "files": ["src/consumer.mjs"]
  },
  "expected_reviewers": ["deep-reviewer"],
  "fallback_agent": "peer-reviewer"
}
```

No modo PR, `patch_source` é remoto e `consumer_context.revision` deve ser igual ao
SHA retornado pelos metadados da PR. O workspace local nunca substitui um patch remoto
vazio ou indisponível.

### Response — resultado normalizado de reviewer

```json
{
  "agent": "deep-reviewer",
  "reviewed_revision": "<head-sha>",
  "overall_correctness": "correct",
  "explanation": "<1–3 frases>",
  "confidence": 0.93,
  "findings": [
    {
      "title": "<imperativo>",
      "body": "<condição e impacto>",
      "priority": 2,
      "confidence": 0.81,
      "file_path": "src/file.mjs",
      "line_start": 10,
      "line_end": 12
    }
  ],
  "status": "VALID"
}
```

O agregador produz uma resposta de rodada:

```json
{
  "status": "APPROVED|BLOCKED",
  "reviewed_revision": "<head-sha>",
  "blockers": ["<finding P0/P1 validado>"],
  "findings": ["<todos os findings P0..P3 válidos>"],
  "counts": { "P0": 0, "P1": 0, "P2": 1, "P3": 0 },
  "reviewers": ["deep-reviewer"],
  "fallback_agent": ""
}
```

Somente P0/P1 válidos entram em `blockers`; P2/P3 permanecem em `findings` e
`counts`. Qualquer reviewer esperado ausente ou resultado inválido produz `BLOCKED`,
sem inferência de aprovação. O fallback `peer-reviewer` só é aceito se gerar o mesmo
schema e receber o protocolo integral; não pode reduzir a severidade ou mudar a revisão.

### Request — deploy/release e configuração

`ship.config.json` mantém os campos existentes e não ganha uma API externa nova:

```json
{
  "dbPath": "data/app.db",
  "backupDir": "data/backup",
  "schemaWatchPaths": ["src/lib/db.ts"],
  "buildCommand": null,
  "stopCommand": "npm run stop:server",
  "startCommand": "npm run start:server",
  "versionCheckUrl": "http://localhost:3000"
}
```

Invariantes operacionais:

- `dbPath` configurado exige snapshot comprovadamente consistente antes do pull; sem
  quiescência/mecanismo equivalente o comando falha e não reinicia o servidor.
- `buildCommand: null` é `NA`, nunca sucesso silencioso; o relatório deve explicar a
  ausência de build configurado.
- A resposta de PR contém `Closes #N`, a descrição e o complemento não vazio, sem
  remover o corpo já publicado ou marcadores de breaking change.
- Um monorepo release-please só é aceito se cada unidade declarada em `packages` tiver
  fonte de versão que `ship` consiga resolver; caso contrário, a validação falha cedo.

### Response — instalador e drift

```json
{
  "mode": "install|check",
  "scope": "user-profile",
  "status": "equal|created|updated|drift",
  "inventory": "skills|agents",
  "path": "<destino>",
  "detail": "<mensagem sem segredo>",
  "exit_code": 0
}
```

A saída textual atual pode continuar sendo usada, desde que preserve a semântica: modo
`--check` nunca escreve, `drift` retorna exit code 1 e nenhum modo remove arquivo
extra/stale ou substitui symlink/especial/conflito de tipo. A descoberta de agentes usa
projeto antes de perfil de usuário e informa duplicatas em vez de escolher uma cópia
ambígua.

## Erros

Os identificadores abaixo são categorias locais estáveis para logs/testes; não são
códigos de uma API GitHub nova.

| Código | Descrição | Quando | Efeito |
|---|---|---|---|
| `E_DIRTY_DEFAULT` | Branch default ou working tree não limpo | Antes de deploy/new/publish | Abort non-zero, sem efeito remoto |
| `E_PREREQUISITE` | `gh`, auth, remote ou label ausente | Preflight Ship/bootstrap | Abort non-zero, sem issue/PR parcial |
| `E_BACKUP_UNSAFE` | Snapshot não pode ser provado consistente | `dbPath` ativo sem quiescência/mecanismo | Abort antes de pull/build/restart |
| `E_REVIEW_INVALID` | Reviewer ausente, schema inválido ou SHA inconsistente | Consolidação deep-review | `BLOCKED`, sem entrega |
| `E_STATE_INVALID` | Schema/status/gate/evidência inválidos | Migração ou resume TDD | Reabre/preserva diagnóstico ou escala |
| `E_TRACE_SECRET` | Trace contém segredo/probe não limpo | Validator de diagnóstico/security | Gate FAIL, sem publicação |
| `E_CONFLICT_STATE` | Operação Git ou hunk não resolvido | Merge/rebase | Mantém BLOCKED com resume evidence |
| `E_INSTALL_DRIFT` | Inventário, tipo, especial ou extra divergente | Installer `--check`/install | Exit 1; não destrói destino |
| `E_UNSUPPORTED_NODE` | Runtime abaixo de Node 20 | Preflight do instalador/skills | Abort antes de escrever |
| `E_RULESET_SCOPE` | Ruleset ou status context fora do escopo | Bootstrap/validator | Gate security FAIL |
| `E_VERSION_SOURCE` | Fonte release/ship incompatível | Release config/monorepo | Gate contract FAIL; não publica |
| `E_GATE_EVIDENCE` | Gate sem evidência ou NA sem razão | DONE/entrega | Bloqueia transição |

Mensagens podem ser traduzidas, mas devem incluir causa, caminho/branch quando aplicável
e ação corretiva sem imprimir segredos ou tokens.

## Estados de UI

NA — não existe UI de produto nesta feature. Estados observáveis são estados de CLI,
revisão e pipeline (`PASS`, `BLOCKED`, `DRIFT`, `NA` justificado), descritos acima.

## Versionamento e impacto

- **0.1.0:** contrato inicial DRAFT para estado TDD 2.2, resultados de review e
  payloads/saídas operacionais desta feature.
- **Patch (0.1.x):** esclarecimento textual que não altera schema, enum, transição,
  fonte de patch, marker ou exit code.
- **Minor (0.x+1.0):** campo opcional compatível, novo diagnóstico não obrigatório ou
  novo finding que consumidores antigos podem ignorar; exige migração documentada.
- **Major (1.0.0+):** alteração de `progress.json` que invalide resume, mudança de
  enum/semântica de gate, retirada de marker/retorno, mudança da precedência de agente,
  ou alteração que faça um consumidor comparar outra revisão/fonte de versão.
- `schema_version` do estado permanece `2.2` durante esta implementação; qualquer
  mudança estrutural deve trazer migração explícita antes de atualizar a versão do
  contrato.

## Changelog

| Versão | Data | Mudança |
|---|---|---|
| 0.1.0 | 2026-08-10 | Contrato inicial para estado TDD persistido, deep-review, Ship/deploy, instalador e bootstrap/CI; status DRAFT aguardando implementação e validação consolidada. |
