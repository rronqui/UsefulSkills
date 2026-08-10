# Interface Contract: specs003-convivencia-robusta-skills

> **Versão:** 0.1.0
> **Status:** APPROVED
> **Feature:** `specs003-convivencia-robusta-skills`
> **Spec:** [../spec.md](../spec.md)
> **Plan:** [../plan.md](../plan.md)
> **Issue:** #36 · **Branch:** `fix/36-corrigir-integracao-robusta-das-skills`

## Escopo

Este contrato descreve as fronteiras persistentes e operacionais efetivamente
implementadas: `deep-review/lib/protocol.mjs`, estado TDD em schema 2.2,
Ship/deploy/release-please, hooks/installer, HITL/redaction, governança de branch/CI
e distribuição de `NOTICE`. Não cria API de produto, endpoint, agente, comando
`release` no CLI ou substituto para schemas de GitHub, Git, `gh`, Actions ou
release-please. Falhas dos provedores viram diagnóstico local fail-closed.

Os requisitos normativos são AC-001..AC-021 de [spec.md](../spec.md). Os quatro
paths canônicos são somente:

```json
{
  "spec": "specs/specs003-convivencia-robusta-skills/spec.md",
  "plan": "specs/specs003-convivencia-robusta-skills/plan.md",
  "tasks": "specs/specs003-convivencia-robusta-skills/tasks.md",
  "contract": "specs/specs003-convivencia-robusta-skills/contracts/interface-contract.md"
}
```

## Metadados normativos

```json
{
  "feature": "specs003-convivencia-robusta-skills",
  "version": "0.1.0",
  "status": "APPROVED",
  "progress_schema_version": "2.2",
  "result_envelope": "{ok, errors, value?}",
  "redaction_replacement": "<REDACTED>",
  "canonical_reviewer_set_required_by": "aggregateReview(results, expectedRevision, expectedReviewers)"
}
```

## Convenções, enums e unions

A grafia e a caixa são significativas. Os tipos refletem o runtime; campos opcionais
só podem ser omitidos onde indicado pelo schema da operação.

```ts
type ReviewMode = "PR" | "BRANCH_BASE" | "COMMIT" | "CUSTOM" | "UNCOMMITTED";
type ProtocolMode = "DEEP_REVIEW" | "DEEP_REVIEW_FALLBACK" | "TDD_PEER_REVIEW";
type ReviewerAgent = "deep-reviewer" | "peer-reviewer";
type ReviewerPair =
  | { agent: "deep-reviewer"; protocol_mode: "DEEP_REVIEW" }
  | { agent: "peer-reviewer"; protocol_mode: "DEEP_REVIEW_FALLBACK" };
type ReviewerStatus = "VALID";
type Correctness = "correct" | "incorrect";
type AggregateStatus = "APPROVED" | "BLOCKED";
type FindingPriority = 0 | 1 | 2 | 3;
type TaskPhase =
  | "PENDING" | "RED" | "RED_REVISION" | "GREEN" | "GREEN_FIX"
  | "TOOLING_FIX" | "REFACTOR" | "REFACTOR_FIX" | "REVIEW"
  | "DOC" | "VALIDATE" | "DONE" | "BLOCKED";
type GateName =
  | "tests" | "traceability" | "spec_kit" | "coverage" | "lint"
  | "type_check" | "build" | "security" | "contract" | "git_sanity";
type GateStatus = "pending" | "PASS" | "FAIL" | "NA";
type ResolvedGateStatus = "PASS" | "FAIL" | "NA";
type IntegrationStatus = "pending" | "PASS" | "FAIL";
type WaveStatus = "pending" | "in_progress" | "integrating" | "completed";
type ReviewEvidenceStatus = "PENDING" | "APPROVED" | "BLOCKED";
type AcceptanceStatus = "PENDING" | "COVERED" | "IMPLEMENTED" | "VALIDATED";
type BuildStatus = "PASS" | "FAIL" | "NA" | "NOT_RUN";
type GateOrigin = "" | "TESTE" | "CODIGO" | "TOOLING" | "REFACTOR" | "SPEC-CONTRATO";
type ShipCommand = "setup" | "new" | "ship" | "deploy";
type InstallerMode = "install" | "check";
type InstallerStatus = "equal" | "created" | "updated" | "drift";
type InstallerExit = 0 | 1;
type BashStatus = "PASS" | "SKIPPED" | "BLOCKED";
type Delivery = "internal" | "external";
type MergeStatus = "" | "PR" | "DONE" | "SKIPPED" | "NOT_NEEDED";
type SpecKitStatus = "PENDING" | "WRITTEN";
type SpecKitMode = "created" | "updated_in_place";
type CanonicalContractStatus = "APPROVED" | "DRAFT" | "NA";
```

`TDD_PEER_REVIEW` continua sendo um valor de protocolo reconhecido pelo enum geral,
mas não é um pairing válido para o resultado desta fronteira deep-review. O pairing
válido é exatamente o tipo `ReviewerPair` acima.

Uma referência de teste tem o formato `arquivo::teste`, sem lado vazio:

```ts
type TestRef = string; // deve casar com ^[^:\r\n]+::[^:\r\n]+$
```

## Envelope de resultado e preservação de erros

Todas as funções do protocolo retornam um envelope. O JSON enumerável é este:

```json
{
  "ok": true,
  "errors": [],
  "value": {
    "status": "VALID"
  }
}
```

Um bloqueio é serializado assim:

```json
{
  "ok": false,
  "errors": ["causa localizada e acionável"]
}
```

A implementação também expõe projeções não enumeráveis do `value` (`status`,
`findings`, `reviewed_revision`, etc.) para compatibilidade com consumidores atuais;
essas projeções não são chaves adicionais do envelope e não alteram o JSON. O campo
`errors` sempre permanece no envelope. Um envelope `ok: true` com `errors` não vazios,
um envelope `ok: false`, erro de envelope malformado ou `value` ausente nunca é
normalizado como reviewer válido.

Assinaturas públicas existentes:

```ts
function validateRequest(request: ReviewRequest): Result<ValidatedReviewRequest>;
function validateReviewerResult(
  result: ReviewerResult | Result<ReviewerResult>,
  expected: ExpectedReviewer,
): Result<ReviewerResult>;
function aggregateReview(
  results: Array<ReviewerResult | Result<ReviewerResult>>,
  expectedRevision: string,
  expectedReviewers: ReviewerAgent[],
): Result<AggregateReview>;
function resolveReviewer(input: {
  projectCandidates: string[];
  userCandidates: string[];
}): Result<ResolvedReviewer>;
```

O terceiro parâmetro de `aggregateReview` é obrigatório em runtime. Não há valor
padrão, inferência de reviewers, sobrecarga sem `expectedReviewers` ou aprovação por
lista vazia.

## Schemas de deep-review

### Request — PR

```json
{
  "mode": "PR",
  "protocol_mode": "DEEP_REVIEW",
  "repository": "owner/repo",
  "pull_request": 36,
  "patch_source": {
    "kind": "pr-uri",
    "uri": "pr://owner/repo/36/diff/all",
    "sha": "sha-review-36",
    "content": "diff --git a/ship/bin/ship.mjs b/ship/bin/ship.mjs"
  },
  "consumer_context": {
    "revision": "sha-review-36",
    "files": ["ship/bin/ship.mjs"]
  },
  "expected_reviewers": ["deep-reviewer"],
  "fallback_agent": "peer-reviewer"
}
```

`expected_reviewers` e `fallback_agent` são opcionais no request validado, mas, quando
presentes, são arrays/agente nomeados. O agregador sempre exige o seu terceiro
argumento explícito. `patch_source.kind` é `gh-pr-diff` ou `pr-uri`; `content` e uma
revisão não vazia são obrigatórios. URI, `repository`, `pull_request` e
`consumer_context.revision` devem referir a mesma revisão. Os aliases de SHA
`sha`, `head_sha` e `head-sha` podem aparecer no input, mas, se mais de um aparecer,
todos devem ser strings não vazias com o mesmo valor; o output normalizado usa
`sha`.

### Request — modos locais

Os requests locais não aceitam `repository`, `pull_request`, `patch_source` ou
`consumer_context`:

```ts
type LocalRevisionContext =
  | {
      mode: "BRANCH_BASE";
      revision: string; base_ref: string; head_ref: string;
      base_revision: string; head_revision: string; diff: string;
    }
  | {
      mode: "COMMIT";
      revision: string; commit_ref: string; commit_revision: string; diff: string;
    }
  | {
      mode: "CUSTOM";
      revision: string; instructions: string; files: string[];
      diff: string; restrictions?: string[]; excluded?: string[];
    }
  | {
      mode: "UNCOMMITTED";
      revision: string; staged: string; unstaged: string; untracked: string[];
    };

type LocalReviewRequest = {
  mode: Exclude<ReviewMode, "PR">;
  protocol_mode: "DEEP_REVIEW";
  local_revision_context: LocalRevisionContext;
  expected_reviewers?: ReviewerAgent[];
  fallback_agent?: "peer-reviewer";
};
```

`BRANCH_BASE` e `COMMIT` exigem diff não vazio e revisão coerente com o head/commit.
`UNCOMMITTED` exige mudança staged, unstaged ou untracked. `CUSTOM` exige
`instructions` e inventário não vazio; `diff` pode ser `""` para a análise restrita
aos arquivos listados. A validação retorna BLOCKED em fonte vazia, revisão
incoerente, campo extra ou contaminação por patch remoto.

### Expected reviewer e resultado

```json
{
  "agent": "deep-reviewer",
  "protocol_mode": "DEEP_REVIEW",
  "reviewed_revision": "sha-review-36",
  "status": "VALID",
  "overall_correctness": "correct",
  "explanation": "Resumo curto e acionável.",
  "confidence": 0.93,
  "findings": [
    {
      "title": "Bloquear publicação sem preflight",
      "body": "Condição, impacto e correção em texto não vazio.",
      "priority": 1,
      "confidence": 0.88,
      "file_path": "ship/bin/ship.mjs",
      "line_start": 120,
      "line_end": 125
    }
  ]
}
```

```ts
type ExpectedReviewer = {
  agent: ReviewerAgent;
  protocol_mode: ProtocolMode;
  reviewed_revision: string;
};
```

Na entrada do agente normalizado (`DEEP_REVIEW_FALLBACK`), `findings` é opcional:

```ts
type NormalizedReviewerInput = {
  agent: ReviewerAgent;
  protocol_mode: ProtocolMode;
  reviewed_revision: string;
  status: "VALID";
  overall_correctness: Correctness;
  explanation: string;
  confidence: number;
  findings?: Array<Record<string, unknown>>;
};
```

O adaptador normaliza a ausência de `findings` para `[]` antes de chamar
`validateReviewerResult`; quando fornecidos, os achados são validados e
preservados. A forma canônica entregue ao agregador sempre contém um array, e
`aggregateReview` não descarta achados válidos: P0/P1 permanecem em `blockers` e
também no conjunto consolidado, enquanto P2/P3 permanecem em `findings` e
`counts`.

`validateReviewerResult` exige `protocol_mode` presente (não assume valor default),
identidade igual a `expected.agent`, protocolo igual a `expected.protocol_mode`,
revisão igual a `expected.reviewed_revision`, status `VALID`, correctness
`correct|incorrect`, explanation não vazia, confidence em `[0,1]` e findings array.
Cada finding é objeto com as chaves exatas `title`, `body`, `priority`, `confidence`,
`file_path`, `line_start`, `line_end`; título tem no máximo 80 caracteres, linhas são
inteiras positivas, `line_end >= line_start` e o intervalo tem no máximo dez linhas.

### Pairing, resolução e agregação

A resolução segue os candidatos nomeados disponíveis, priorizando `deep-reviewer` e
usando somente depois `peer-reviewer` como fallback nomeado. O resultado de resolução
contém o protocolo que o consumidor deve passar:

```json
{
  "ok": true,
  "errors": [],
  "value": {
    "agent": "peer-reviewer",
    "protocol_mode": "DEEP_REVIEW_FALLBACK",
    "schema": "deep-review",
    "blockingPriorities": [0, 1]
  }
}
```

A tabela de pairing é fechada:

| `agent` | `protocol_mode` aceito |
|---|---|
| `deep-reviewer` | `DEEP_REVIEW` |
| `peer-reviewer` | `DEEP_REVIEW_FALLBACK` |

`aggregateReview` valida e normaliza todos os resultados, inclusive envelopes. O
`expectedReviewers` deve ser array não vazio, sem duplicatas e conter somente os dois
agentes nomeados. O conjunto dos reviewers reais deve ser **exatamente** o conjunto
esperado: todo esperado aparece uma vez, nenhum inesperado aparece e um duplicado
bloqueia. Cada resultado deve usar a mesma `expectedRevision` e o pairing da tabela.
Qualquer `errors` de envelope é copiado para o diagnóstico do aggregate.

O valor agregado válido tem este schema:

```json
{
  "status": "APPROVED",
  "protocol_mode": "DEEP_REVIEW",
  "reviewed_revision": "sha-review-36",
  "blockers": [],
  "findings": [],
  "counts": { "P0": 0, "P1": 0, "P2": 0, "P3": 0 },
  "reviewers": ["deep-reviewer"],
  "fallback_agent": ""
}
```

`blockers` e `findings` contêm objetos, nunca strings. Prioridades 0/1 entram em
`blockers`; prioridades 2/3 continuam em `findings` e `counts`. Se houver blocker, o
valor tem `status: "BLOCKED"`, porém o envelope continua `ok: true` porque todos os
reviewers/finding eram válidos. Com apenas P2/P3, o valor pode ser `APPROVED`, mas os
findings não são apagados. Falha de schema, identidade, fonte, revisão, conjunto ou
envelope retorna `ok:false` e não fabrica valor agregado.

## Schemas de estado TDD (`progress.json`)

A forma canônica persistida é `schema_version: "2.2"`. Os tipos abaixo são uma
representação machine-readable dos campos obrigatórios validados por
`tdd-orchestrator/lib/state.mjs`.

```ts
type NonEmpty = string;
type GateMap<T> = {
  tests: T; traceability: T; spec_kit: T; coverage: T; lint: T;
  type_check: T; build: T; security: T; contract: T; git_sanity: T;
};

type Repo = {
  branch_start: NonEmpty; branch_work: NonEmpty; merge_target: NonEmpty;
  delivery: Delivery; merge_status: MergeStatus; pr_url: string;
  head_start: NonEmpty; head_current: NonEmpty; dirty_at_start: boolean;
};

type Baseline = {
  status: "PASS" | "FAIL" | "NOT_RUN";
  tests: BuildStatus; tests_evidence: string;
  build: BuildStatus; build_evidence: string;
  override_approved: boolean;
  known_failures: Array<{ gate: "tests" | "build"; reason: NonEmpty; evidence: NonEmpty }>;
};

type SpecKitState = {
  spec: string; plan: string; tasks: string; status: SpecKitStatus;
  written_at: string; mode: SpecKitMode;
};

type ContractState = {
  file: NonEmpty; version: NonEmpty; status: CanonicalContractStatus; na_reason: string;
};

type AcceptanceCriterion = {
  id: string; desc: NonEmpty; source: NonEmpty; tasks: NonEmpty[];
  status: AcceptanceStatus;
};

type ReviewProof = {
  status: ReviewEvidenceStatus; agent: string; independent: boolean;
  revision: string; evidence: string;
};

type NormativeNA = {
  status: "NA";
  reason: NonEmpty;
  validator: "spec-kit-validator";
  evidence: NonEmpty;
  reference: NonEmpty;
};

type CriteriaMatrix = Record<string, TestRef[] | NormativeNA>;

type RedState = {
  status: "PENDING" | "PASS";
  failing_tests: TestRef[];
  failure_reason_expected: boolean;
  criteria_to_tests: CriteriaMatrix;
  revision_delta: { ac: string; test: string; evidence: string };
  revision_baseline_tests: Record<string, TestRef[]>;
};

type GreenState = {
  status: "PENDING" | "PASS" | "SKIPPED";
  reason_if_skipped: string; changed_files: string[];
  tooling_evidence: string; tooling_suite_evidence: string;
};

type RefactorState = {
  status: "PENDING" | "PASS" | "SKIPPED";
  reason_if_skipped: string;
};

type Task = {
  id: NonEmpty; title: NonEmpty; phase: TaskPhase; attempt: 0 | 1 | 2 | 3;
  allowed_write_globs: NonEmpty[]; acceptance_criteria: NonEmpty[];
  implemented_by: NonEmpty; reviewed_by: NonEmpty; review: ReviewProof;
  red: RedState; green: GreenState; refactor: RefactorState; doc_impact: NonEmpty;
  gates: GateMap<GateStatus>; gate_origins: GateMap<GateOrigin>;
  gate_evidence: GateMap<string>; blockers: NonEmpty[]; evidence: string;
};

type Wave = {
  wave: number; status: WaveStatus;
  integration: { status: IntegrationStatus; attempt: 0 | 1 | 2 | 3; evidence: string };
  tasks: Task[];
};

type Progress = {
  schema_version: "2.2"; run_id: NonEmpty; task_source: NonEmpty; updated_at: NonEmpty;
  repo: Repo; baseline: Baseline; spec_kit: SpecKitState; contract: ContractState;
  acceptance_criteria: AcceptanceCriterion[]; waves: Wave[];
};
```

`progress.waves[*]` usa as chaves exatas `wave`, `status`, `integration`, `tasks`.
A forma de input de `canPromoteWave` é uma extensão transitória com `review` e
`validation`; esses dois objetos não são acrescentados silenciosamente ao schema
persistido de `progress.json`. `integration.attempt` e `Task.review` são metadados de
compatibilidade/orquestração do TDD, não payload de produto; consumidores de produto
devem ignorá-los.

### Matriz e NA normativo

Cada tarefa deve ter uma matriz com exatamente os ACs declarados em
`acceptance_criteria`. Para AC executável, cada valor é uma lista não vazia de
`arquivo::teste`. A única exceção é AC-019, com este objeto exato (sem campos extras):

```json
{
  "status": "NA",
  "reason": "AC exclusivamente normativo; não há comportamento executável",
  "validator": "spec-kit-validator",
  "evidence": "leitura local dos quatro paths e matriz AC→tarefa→costura",
  "reference": "specs/specs003-convivencia-robusta-skills/spec.md#AC-019"
}
```

`spec-kit-validator` é literal canônico. `validator`, valor vazio, campo extra, AC
faltante, AC desconhecido ou `NA` em qualquer AC executável é inválido.

### Invariantes

1. O validator rejeita chaves extras, campos obrigatórios ausentes, caixa divergente,
   enums desconhecidos e combinações impossíveis. `gate_origins.<gate>` só pode ser
   preenchido em `FAIL`; gate resolvido exige `gate_evidence.<gate>` não vazia.
2. A ponte aceita apenas `schema_version: "2.1"` ou a validação canônica `"2.2"`.
   Para 2.1, somente estes aliases são copiados e removidos antes da validação:
   `repo.branch` → `repo.branch_work`, `task.reviewer` → `task.reviewed_by` e
   `task.gates.rastreabilidade` → `task.gates.traceability`. Colisão, alias
   desconhecido, chave extra ou valor incompatível falha fechada e preserva os
   diagnósticos disponíveis (`blockers`, `evidence` e erros de migração).
3. A migração clona o input; o objeto original não é mutado. Inicializa
   `waves[*].integration.attempt` em zero somente quando ausente, preserva inteiro
   existente `0..3`, converte `READY` legado para `REVIEW`, converte matriz textual
   válida para mapa e completa campos de compatibilidade documentados. Matriz textual
   malformada, wave/task inválida ou status não suportado retorna `ok:false`.
4. Wave `BLOCKED` legada é convertida para `in_progress` com integração `FAIL` e
   evidência não vazia; o task continua BLOCKED. Attempt `3` preserva blockers/evidence
   e impede nova delegação até decisão explícita. Resume de 2.2 normaliza review
   incompleto para `{status:"PENDING",agent:"",independent:false,revision:"",evidence:""}`
   e reabre `REVIEW`; nunca deriva aprovação de `reviewed_by` sozinho.
5. `DONE` exige ACs vinculados em estado final `IMPLEMENTED` ou `VALIDATED`, blockers
   vazios, review `APPROVED` independente com agente/revisão/evidência não vazios e
   todos os gates `PASS` ou `NA` com evidência específica. Com integração `pending`,
   `DONE` não autoriza commit, promoção, release ou deploy.
6. `RED` normal exige falha de asserção esperada e teste falhando. Para
   `implemented_by: "existing-code"`, a tarefa segue para REVIEW somente com RED PASS,
   `failure_reason_expected:false`, `failing_tests:[]`, GREEN SKIPPED e REFACTOR
   SKIPPED, ambos com motivo. `RED_REVISION` exige delta novo, pertencente ao AC,
   ausente da baseline, presente na matriz e em `failing_tests`, com evidência da
   falha de asserção.
7. `validateGateReport` exige exatamente os dez gates abaixo; cada entrada tem
   `status`, `command` e `output` não vazios. `status` é `PASS`, `FAIL` ou `NA` (não
   `pending`), boilerplate `not applicable`/`run gate:` não é evidência real e `NA`
   sempre exige `reason`. Para o gate `build`, command/output/reason devem conter
   `buildCommand=null`.
8. `canPromoteWave` exige `wave.status:"integrating"`, integration PASS com
   `attempt` `1..3` e evidence, todas as tasks DONE sem blockers e com gates
   completos, `wave.review` APPROVED/independent por `peer-reviewer` que não seja
   implementador nem integrator, e `wave.validation` PASS por `validator` com suite
   command/output e relatório completo dos dez gates PASS/NA. Qualquer falha conserva
   diagnóstico e impede promoção.

## Relatório de gates

O relatório consolidado tem exatamente estas chaves:

```json
{
  "tests": { "status": "PASS", "command": "npx vitest run ...", "output": "tests: PASS" },
  "traceability": { "status": "PASS", "command": "npx vitest run ...", "output": "traceability: PASS" },
  "spec_kit": { "status": "PASS", "command": "node --check ...", "output": "spec_kit: PASS" },
  "coverage": { "status": "PASS", "command": "npx vitest run ...", "output": "coverage: PASS" },
  "lint": { "status": "PASS", "command": "node --check ...", "output": "lint: PASS" },
  "type_check": { "status": "PASS", "command": "node --check ...", "output": "type_check: PASS" },
  "build": {
    "status": "NA",
    "command": "ship.config.json: buildCommand=null",
    "output": "build: NA; buildCommand=null",
    "reason": "O projeto não declara buildCommand"
  },
  "security": { "status": "PASS", "command": "git diff --check", "output": "security: PASS" },
  "contract": { "status": "PASS", "command": "node --check ...", "output": "contract: PASS" },
  "git_sanity": { "status": "PASS", "command": "git diff --check", "output": "git_sanity: PASS" }
}
```

Comandos e saídas acima são forma do schema; cada execução deve registrar o comando
real completo e trecho de saída não vazio. `NA` não equivale a PASS implícito. A
validação desta atualização documental não executa a suíte completa, lint, formatter
ou build; a evidência GREEN/integration e directed suites vem do briefing do
orquestrador.

## Ship, deploy e release

### Configuração de deploy

`ship.config.json` é um objeto JSON com estes campos existentes:

```json
{
  "dbPath": null,
  "backupDir": null,
  "schemaWatchPaths": null,
  "buildCommand": null,
  "stopCommand": null,
  "startCommand": null,
  "versionCheckUrl": null,
  "versionCheckUnit": ".",
  "versionCheckTimeoutMs": 10000
}
```

`backupDir`, commands e URLs podem ser `null`/omitidos quando a operação não exige
essa etapa. `dbPath` exige `stopCommand`; `stopCommand` exige `startCommand`; uma URL
de version check deve ser HTTP(S). `schemaWatchPaths` omitido/nulo usa o default
legado `src/lib/db.ts`; array vazio desliga o aviso. A configuração presente no repo
é mínima e usa `buildCommand: null`.

### Preflight e branch default

- `new` valida título, árvore limpa, fontes SemVer, `gh auth status`, remote de push,
  label e branch antes de criar issue/branch; falha restaura a branch original quando
  possível e não deixa issue órfã sem diagnóstico.
- `ship` valida descrição/body-file antes de commit/push/PR, resolve o repositório e
  branch default via `gh api repos/{owner}/{repo} -q .default_branch`, preserva retry
  de body e só aceita URL de PR válida. O runtime pode tentar auto-merge do PR comum e
  reporta quando o provedor não permite; isso não altera o contrato de validação.
- `deploy` exige branch default descoberta, árvore limpa, alinhamento com
  `origin/<default>`, configuração e fontes válidas. Para `dbPath`, stop bem-sucedido
  precede backup; pull é `--ff-only`; config/fontes são revalidadas depois do pull;
  build/start/version check ocorrem nessa ordem. Falha após stop tenta restaurar
  revisão/configuração anterior.
- A proteção `pre-push` descobre a default nesta ordem: `refs/remotes/origin/HEAD`,
  `init.defaultBranch` local, fallback somente quando ambas não existem. Lê stdin no
  formato Git `<local ref> <local sha> <remote ref> <remote sha>` e bloqueia local ou
  remoto em `refs/heads/<default>`.

### SemVer e release-please

`release-please-config.json` e `.release-please-manifest.json` devem ter as mesmas
unidades. Na configuração atual a única unidade é `"."`, `release-type:"node"`,
`include-component-in-tag:false`, `initial-version:"0.1.0"` e a versão resolvida do
manifest/package é `0.3.2`. `ship` rejeita `release-as`, package inexistente,
manifesto divergente, unidade não Node, SemVer inválido ou `versionCheckUnit`
desconhecida com `E_VERSION_SOURCE`; não compara apenas a raiz quando há várias
unidades.

O workflow release-please existente aceita `push` e `workflow_dispatch`, executa
somente quando `ref_type` é branch e `ref_name` é a default do evento, e usa
exatamente `secrets.RELEASE_PLEASE_TOKEN`. Permissões declaradas são
`contents: write`, `pull-requests: write`, `issues: write`; CI usa apenas
`contents: read` e produz o contexto `quality`.

## Hooks e installer

### Hooks

`npm prepare` chama `node scripts/install-hooks.mjs`. O instalador resolve o path por
`git rev-parse --git-path hooks`, respeita `core.hooksPath`, rejeita path vazio,
externo, raiz do projeto, fontes canônicas ou diretório compartilhado sem marcador de
consentimento, e valida todos os ancestrais antes de criar wrappers. Hook regular,
symlink/junction, hardlink, especial ou sidecar conflitante é preservado e bloqueia;
bytes e modo de wrapper gerenciado são idempotentes e transacionais.

O wrapper POSIX executa `node "$0.mjs" "$@"`. `commit-msg` passa o caminho do arquivo
por argv; `pre-push` passa stdin sem perder linhas/refspecs. Em caminho com espaços,
a resolução preferencial usa o entrypoint Node com array de argumentos; fallback
Windows usa variáveis de ambiente dentro de `ComSpec` sem interpolar o caminho em
argumento não delimitado.

### Installer

`node install.mjs` instala e `node install.mjs --check` confere sem escrever. O
preflight exige Node major `>=20` e o inventário atual é:

```json
{
  "skills": [
    "alignment",
    "bug-diagnosis",
    "conflict-resolution",
    "deep-review",
    "release-bootstrap",
    "ship",
    "tdd-orchestrator"
  ],
  "agents": [
    "backend-developer.md",
    "frontend-developer.md",
    "integrator.md",
    "peer-reviewer.md",
    "refactorer.md",
    "spec-kit-author.md",
    "test-author.md",
    "validator.md",
    "deep-reviewer.md"
  ],
  "destination": "~/.omp/agent/",
  "notice_destination": "~/.omp/agent/NOTICE"
}
```

A origem deve ser diretório/arquivo regular completo. Destino e ancestrais são
inspecionados com `lstat`; conflito de tipo, symlink/junction, hardlink, especial,
origem faltante/inacessível ou inventário inseguro impede **todas** as escritas desse
run. Instalação normal preserva conteúdo de usuário, extras e stale; `--check`
retorna exit 1 em drift sem alterar nada. Um arquivo de agente em `.omp/agents` do
projeto (encontrado a partir do cwd e ancestrais) precede o perfil e faz a duplicata
ser reportada/bloqueada, nunca silenciosamente substituída.

`NOTICE` é parte do inventário distribuído: se ausente no perfil, pode ser criado; se
divergente e regular, pode ser atualizado pelo fluxo gerenciado; se for symlink,
tipo inseguro ou ancestral conflitante, permanece intacto e o installer retorna
drift fail-closed.

## HITL, redaction e persistência

O template `bug-diagnosis/scripts/hitl-loop.template.sh` só executa o cenário quando
Bash e AWK existem. Sem uma das ferramentas, escreve motivo `SKIPPED` em stderr e
não chama isso de PASS. A cadeia é `capture → redact → sanitize_trace →
scan_clean_trace → persist_trace`; redaction também é aplicada ao campo `ERRORED`
antes de stdout.

### Assinaturas completas de credencial

Todas as assinaturas abaixo são substituídas por `<REDACTED>` no sanitize/scan; o
bloco PEM permanece redigido até o footer de mesmo tipo:

```json
{
  "replacement": "<REDACTED>",
  "credential_signatures": [
    { "name": "JWT", "pattern": "eyJ[[:alnum:]_-]+([.][[:alnum:]_-]+){1,2}" },
    { "name": "PEM", "pattern": "-----BEGIN <label>----- ... -----END <same label>-----" },
    { "name": "GitLab PAT", "pattern": "glpat_[[:alnum:]_-]+" },
    { "name": "GitLab legacy PAT", "pattern": "glpat-[[:alnum:]_-]+" },
    { "name": "Stripe live", "pattern": "sk_live_[[:alnum:]_-]+" },
    { "name": "Stripe test", "pattern": "sk_test_[[:alnum:]_-]+" },
    { "name": "npm", "pattern": "npm_[[:alnum:]_-]+" },
    { "name": "GitHub fine-grained", "pattern": "github_pat_[[:alnum:]_-]+" },
    { "name": "GitHub classic", "pattern": "ghp_[[:alnum:]_-]*" },
    { "name": "GitHub OAuth", "pattern": "gho_[[:alnum:]_-]*" },
    { "name": "GitHub server", "pattern": "ghs_[[:alnum:]_-]*" },
    { "name": "GitHub refresh", "pattern": "ghr_[[:alnum:]_-]*" },
    { "name": "AWS access key", "pattern": "AKIA[[:alnum:]]+" },
    { "name": "Google API key", "pattern": "AIza[[:alnum:]_-]+" },
    { "name": "Slack", "pattern": "xox[bp]-[[:alnum:]_-]+" },
    { "name": "generic secret", "pattern": "sk-[[:alnum:]_-]+" }
  ],
  "sensitive_labels": [
    "authorization", "proxy-authorization", "cookie", "set-cookie",
    "x-api-key", "api-key", "access-token", "private-key", "secret-key",
    "client-secret", "refresh-token", "session-token", "aws-access-key",
    "aws-secret-access-key", "jwt-token", "jwt", "token", "password",
    "passphrase", "credential", "credentials", "secret"
  ],
  "debug_probe": "\\[DEBUG-[^]]*\\]"
}
```

Assignments desses labels incluem valores escalares, continuações indentadas,
continuações após comentário, mappings YAML explícitos (`? key`/`: value`), listas e
objetos flow, strings quoted, here-strings, backticks, parênteses e bloco PEM. O scan
final também rejeita qualquer assinatura residual ou probe.

### Persistência

`persist_trace(path)` recusa path vazio, path iniciado por `-`, arquivo regular,
hardlink, diretório e symlink live/dangling antes de criar temporário. Usa `umask 077`,
temporário no mesmo diretório, scan antes de publicação, rename sem clobber/alternativa
no-replace e limpeza do temporário em toda falha/raça. Se scan, rename, tipo ou destino
falhar, nenhum artifact novo é publicado.

## NOTICE, licença e distribuição

`NOTICE` é independente de `LICENSE` e contém os dois notices upstream completos:

- `https://github.com/can1357/oh-my-pi`, MIT, copyrights de Mario Zechner e Can
  Bölük;
- `https://github.com/mattpocock/skills`, MIT, copyright de Matt Pocock.
O arquivo preserva também o texto de permissão, isenção de garantia e atribuição. O
installer copia esse arquivo para `~/.omp/agent/NOTICE` com a mesma política não
destrutiva de tipos/conflitos; consumidores não devem depender de `LICENSE` para
reconstruir o notice upstream.

## Erros

Os códigos abaixo são categorias locais estáveis, não endpoints novos. Mensagem de
erro inclui causa, escopo/caminho quando aplicável e ação, sem segredo; falha de
preflight não produz efeito parcial.

| Código | Fronteira | Condição observável | Resultado |
|---|---|---|---|
| `E_DIRTY_DEFAULT` | Ship/deploy | default ou árvore suja onde limpeza é obrigatória | exit não zero, sem efeito remoto |
| `E_PREREQUISITE` | Ship/new | git/gh/auth/remote/label ausente | BLOCKED, sem issue/PR parcial |
| `E_BACKUP_UNSAFE` | deploy | dbPath sem quiescência ou mecanismo comprovado | sem snapshot/pull/build/restart |
| `E_REVIEW_INVALID` | deep-review | fonte, SHA, reviewer, protocolo/status/schema inválido | BLOCKED, erros preservados |
| `E_FINDING_INVALID` | deep-review | finding sem campos/localização válidos | BLOCKED, sem aprovação inferida |
| `E_STATE_INVALID` | TDD | schema, enum, chave, matriz ou evidência inválida | migração/resume bloqueado |
| `E_ATTEMPT_CAP` | TDD | fase/integração atingiu tentativa 3 | histórico preservado, BLOCKED |
| `E_GATE_EVIDENCE` | gates | evidência ausente ou NA sem razão específica | transição/promoção recusada |
| `E_CONFLICT_STATE` | Git | operação/hunk/continuação pendente | BLOCKED retomável |
| `E_ALIGNMENT_BLOCKED` | alignment | pergunta/decisão pendente | sem rota silenciosa |
| `E_TRACE_SECRET` | HITL/security | segredo/probe após sanitize/scan | gate FAIL, não publica |
| `E_BASH_UNAVAILABLE` | HITL | Bash/AWK necessário ausente | SKIPPED/BLOCKED explícito |
| `E_HOOK_CONFLICT` | hooks | hook conflitante, symlink ou tipo inseguro | preserva e reporta |
| `E_INSTALL_DRIFT` | installer | extra/stale/duplicata/ancestral/tipo divergente | exit 1, não destrói destino |
| `E_UNSUPPORTED_NODE` | installer/CI | Node abaixo de 20 | falha antes de escrever |
| `E_RULESET_SCOPE` | bootstrap/CI | ruleset/contexto fora do escopo ou enforcement limitado | security FAIL/limitação registrada |
| `E_VERSION_SOURCE` | release/Ship | unidade SemVer/manifest incompatível | contract FAIL, não publica |

## Estados de CLI/pipeline/review

Não há UI de produto nesta feature. Os estados observáveis são:

| Estado | Significado |
|---|---|
| `PENDING` | Fase/gate ainda não concluído |
| `RUNNING` | Operação em execução, sem aprovação implícita |
| `DONE_PRE_INTEGRATION` | Tarefa pronta, integração ainda pending; não promove/commita |
| `PASS` | Gate/integração/review com evidência válida |
| `NA` | Gate não aplicável, com razão, comando e saída; build exige `buildCommand=null` |
| `DRIFT` | Installer encontrou divergência e preservou destino |
| `BLOCKED` | Pré-condição, finding, conflito, decisão ou evidência impede avanço |
| `PROMOTED` | Integração PASS + review independente + validação consolidada; pode entregar |
| `SKIPPED` | Bash/AWK ou fase explicitamente não aplicável, com motivo; não é PASS |

## Compatibilidade e versionamento

- **0.1.0:** contrato canônico aprovado para deep-review, state 2.2, Ship/deploy,
  hooks/installer, HITL, branch/release/CI e NOTICE/distribuição.
- **Patch (`0.1.x`):** esclarecimento textual sem alterar unions, enums, envelopes,
  pairing, expected-reviewer set, fontes, limiar, redaction ou exit codes.
- **Minor (`0.x+1.0`):** campo opcional compatível ou diagnóstico ignorável; exige
  migração documentada e validator atualizado.
- **Major (`1.0.0+`):** remoção/alteração de enum, mudança de assinatura
  `aggregateReview`, envelope, schema de resume 2.2, pairing, fontes, promoção,
  redaction, precedência ou semântica de exit code.

`schema_version` permanece `2.2`; mudança estrutural exige ponte explícita, atualização
da matriz AC→tarefa→costura e nova decisão de versão.

## Changelog

| Versão | Data | Mudança |
|---|---|---|
| 0.1.0 | 2026-08-10 | Contrato final aprovado: envelopes/erros e pairing de deep-review; expected-reviewer set exato; PR URI/SHA; estado 2.2/migração fail-closed; gates/NA; Ship/branch/release; installer/hooks; HITL/redaction; NOTICE upstream. |
