---
name: deep-review
description: Revisão de código multi-agente — coleta o diff (PR, branch base, mudanças não commitadas, commit ou instruções customizadas), filtra ruído, dimensiona e distribui o trabalho entre sub-agentes revisores paralelos que reportam achados priorizados P0–P3 com veredito estruturado. Use quando o usuário pedir para revisar código, um PR, um branch, mudanças pendentes ou um commit específico.
---

# deep-review — revisão de código multi-agente

Extração fiel do comando embutido `/review` do omp (can1357/oh-my-pi). O trabalho se
divide em duas camadas:

1. **Camada determinística (você, orquestrador)**: resolver o escopo, coletar o diff
   via git/gh, parsear por arquivo, filtrar ruído, dimensionar a equipe e distribuir
   os arquivos entre revisores.
2. **Camada de revisão (sub-agentes `deep-reviewer`)**: cada um lê o patch e o
   contexto dos SEUS arquivos, caça bugs introduzidos pelo patch e devolve achados
   priorizados (P0–P3) mais um veredito estruturado.

Nunca revise você mesmo inline: o valor do fluxo é o fan-out paralelo com protocolo
de achados padronizado.

## O agente revisor (`deep-reviewer`)

Esta skill usa SEMPRE o agente `deep-reviewer` desta própria skill —
`skill://deep-review/agents/deep-reviewer.md` (extração verbatim de
`packages/coding-agent/src/prompts/agents/reviewer.md` do repositório
can1357/oh-my-pi, renomeada para evitar colisão). Ela define:

- Ferramentas somente leitura: `read, grep, glob, bash, lsp, web_search, ast_grep`;
  pode spawnar `scout`; roda no modelo definido no frontmatter do agente
  (`openai-codex/gpt-5.6-luna`);
- Schema de saída: identidade com `protocol_mode` (`DEEP_REVIEW` ou
  `DEEP_REVIEW_FALLBACK`), veredito (`overall_correctness` enum correct/incorrect,
  `explanation`, `confidence`) + achados opcionais (`findings`: title, body,
  priority, confidence, file_path, line_start, line_end) preenchidos via seções
  incrementais de `yield`;
- O procedimento, os critérios de reporte, a checagem cross-boundary, a tabela
  P0–P3 e o formato do achado.

NUNCA use o agente embutido `reviewer` do omp nem qualquer outro revisor: usar o
`deep-reviewer` garante comportamento idêntico sem conflito de nomes na descoberta
de agentes. Se a chamada `task` com `agent: "deep-reviewer"` falhar por agente
desconhecido, tente a resolução nomeada no escopo de projeto e depois de usuário;
se não houver `deep-reviewer` nesses escopos, tente somente `peer-reviewer`. Se
nenhum agente nomeado compatível estiver disponível, a rodada é `BLOCKED`; não há
fallback genérico ou anônimo.

## API executável e fail-closed

`deep-review/lib/protocol.mjs` é o seam puro e determinístico do protocolo. Ele
exporta `validateRequest(request)`, `validateReviewerResult(result, expected)`,
`aggregateReview(results, expectedRevision, expectedReviewers)` e
`resolveReviewer({ projectCandidates, userCandidates })`. Cada chamada retorna um
envelope `{ ok, value?, errors }`; por compatibilidade operacional, os campos
normalizados também ficam no nível superior (`status`, `findings`, etc.).
`aggregateReview` exige `expectedReviewers` como array explícito de agentes nomeados:
o conjunto observado deve ser exatamente igual, sem ausentes, inesperados ou
duplicados, e a identidade esperada nunca é inferida dos resultados. `ok: false`/
`status: "BLOCKED"` preserva diagnóstico em `errors`; envelope `ok: true` com erros
também é bloqueado e nunca autoriza inferir aprovação. O módulo não acessa GitHub,
Git, workspace ou agentes: coleta, resolução de fonte e despacho continuam
responsabilidades do orquestrador.


## FASE 0 — Resolução do escopo (modo)

Se o usuário forneceu uma **URL de PR do GitHub** (`https://github.com/<owner>/<repo>/pull/<N>`)
ou um ref `pr://<owner>/<repo>/<N>` como argumento → modo PR direto; qualquer texto
restante vira "instruções adicionais". Se a conversa recente menciona um PR e o usuário
não especificou escopo, ofereça-o como opção.

Sem escopo explícito, pergunte ao usuário (ferramenta `ask`) qual modo quer:

| Modo | O que revisa |
|---|---|
| PR | Diff de um PR do GitHub (local ou remoto) |
| Branch base | Diferença entre a branch atual e uma branch base (estilo PR) |
| Não commitadas | Staged + unstaged do working tree |
| Commit | Um commit específico |
| Custom | Instruções livres do usuário (sem diff obrigatório) |

### Coleta do diff por modo

Para PR, branch base, não commitadas e commit, diff vazio → informe o usuário e PARE
*(não dispare revisores sem material). **Custom é a exceção:** sem mudanças, o
orquestrador deve mapear o workspace, particionar arquivos revisáveis e incluir em
cada assignment a lista exata de arquivos atribuídos; os revisores leem esses arquivos
por conta própria e ancoram achados nas linhas atuais.
  No Custom sem diff, aplique exclusões e as restrições do usuário ao inventário
  antes de particionar; se o conjunto resultante estiver vazio, informe "nenhum arquivo revisável" e pare.
  Caso contrário, `totalLines` é a soma das linhas atuais e `fileCount` o tamanho do
  inventário já restrito; só então a tabela de dimensionamento define a equipe.

- **PR**: colete uma única fonte remota exata em `patch_source`: `gh pr diff <N> -R <owner>/<repo>` com o SHA retornado pelos metadados da PR, ou `pr://<owner>/<repo>/<N>/diff/all` com esse SHA. Registre `kind`, `uri` (quando houver), conteúdo e qualquer alias entre `sha`, `head_sha` e `head-sha`; se mais de um for fornecido, todos devem ser strings não vazias e iguais. Para `pr-uri` e para `gh-pr-diff` quando `uri` existir, a URI deve seguir `pr://owner/repo/<n>/...` e coincidir exatamente com `repository` e `pull_request`; não misture fontes nem recupere um patch local.
  Se a fonte remota falhar, estiver vazia ou indisponível, a rodada é `BLOCKED` e o erro é preservado; nunca use o workspace como fallback silencioso.
- **Branch/base**: se o chamador informou a branch base (ex.: outra skill
  orquestrando o fluxo), use-a diretamente sem perguntar; caso contrário pergunte
  ao usuário (liste com `git branch -a` se necessário). Resolva a branch atual via
`git branch --show-current` e registre `local_revision_context` com
`mode: "BRANCH_BASE"`, `revision` (descritor do par local resolvido),
`base_ref`, `head_ref`, `base_revision` e `head_revision`. O diff é
`git diff <base>...<atual>`. Esses são identificadores locais das duas refs; não crie
`patch_source` remoto, SHA/head-SHA de PR ou `consumer_context`.
- **Não commitadas**: primeiro `git status` (vazio → "sem mudanças não commitadas",
  pare). Depois `git diff` + `git diff --cached`, concatenados. Repositórios `jj`:
  `jj diff --git` no lugar dos dois. Registre `local_revision_context` com
  `mode: "UNCOMMITTED"`, `revision` como snapshot do estado observado do worktree,
  os patches staged/unstaged e os arquivos untracked, sem SHA remoto, `patch_source`
  ou `consumer_context`.
- **Commit**: liste os últimos 20 com `git log --oneline -20`, pergunte qual
  (ou use o indicado pelo usuário). Diff: `git show --format="" <hash>`. Registre
  `local_revision_context` com `mode: "COMMIT"`, `revision` igual ao
  `commit_revision` local resolvido por `git show` e `commit_ref`; não invente SHA
  remoto nem use `patch_source`/`consumer_context`.
- **Custom**: peça as instruções. Se houver mudanças não commitadas (staged ou
  unstaged), colete um único patch final com `git diff HEAD --`; liste também arquivos
  untracked via `git status --short --untracked-files=all` e, para cada arquivo não
  excluído, acrescente um patch `/dev/null`→arquivo usando `git diff --no-index -- /dev/null "<path>"`
  (ignore o exit code 1 esperado). Aplique exclusões e restrições customizadas antes de calcular
  estatísticas, particionar e montar assignments. Se o inventário resultante
  ficar vazio, informe "nenhum arquivo revisável" e pare. Sem mudanças → mapeie
  o workspace, aplique as mesmas exclusões/restrições, e particione o inventário;
  inclua a lista exata de arquivos em cada assignment; o revisor lê esses arquivos
  por conta própria e ancora achados nas linhas atuais. Registre
  `local_revision_context` com `mode: "CUSTOM"`, `revision` como snapshot do estado
  observado do workspace, as instruções e a lista de arquivos; ele não é um SHA
  remoto e não exige `patch_source` ou `consumer_context`.

Instruções adicionais do usuário (texto além do ref do PR, ou foco explícito) são
SEMPRE repassadas aos revisores.

## FASE 1 — Parse e filtragem do diff

Parseie o diff unificado: divida nos limites `diff --git a/... b/...`, extraia o
caminho do arquivo (lado `b/`) e conte linhas `+`/`-` (ignorando `+++`/`---`).

**Exclusões obrigatórias** — esses arquivos saem da revisão e entram no relatório
final apenas como lista de excluídos (caminho, +/- e motivo). Um diff em que TODOS
os arquivos foram filtrados → informe "nenhum arquivo revisável (tudo filtrado)" e pare.

| Categoria | Padrões | Motivo |
|---|---|---|
| Lock files | `*.lock`, `*-lock.json\|yaml\|yml`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`, `composer.lock`, `flake.lock` | lock file |
| Gerados/build | `*.min.js`, `*.min.css`, `*.generated.*`, `*.snap`, `*.map`, `dist/`, `build/`, `out/`, `node_modules/`, `vendor/` | minified / generated / snapshot / source map / build output / vendor |
| Binários/assets | imagens (`png jpg jpeg gif ico webp avif`), fontes (`woff woff2 ttf eot otf`), pacotes (`pdf zip tar gz rar 7z`) | image / font / binary |

## FASE 2 — Dimensionamento da equipe

`totalLines` = somatório de adições + remoções dos arquivos não excluídos;
`fileCount` = quantidade desses arquivos. Número de revisores:

| Condição | Revisores |
|---|---|
| `totalLines < 100` OU `fileCount <= 2` | 1 |
| `totalLines < 500` | `min(2, fileCount)` |
| `totalLines < 2000` | `min(4, ceil(fileCount/3))` |
| `totalLines < 5000` | `min(8, ceil(fileCount/2))` |
| `totalLines >= 5000` | `min(16, fileCount)` |

**Agrupamento por localidade** (quando há mais de 1 revisor):
- mesmo diretório/módulo → mesmo agente;
- funcionalidades relacionadas → mesmo agente;
- testes junto com os arquivos que implementam o que testam → mesmo agente.

Cada revisor recebe um conjunto DISJUNTO de arquivos; nada fica sem dono.

## FASE 3 — Distribuição (ferramenta `task`)

Uma única chamada `task` em lote: `context` compartilhado + um item em `tasks[]` por
revisor. Agente `deep-reviewer` é resolvido deterministicamente no escopo de projeto
primeiro e, se ausente, no escopo de usuário depois. Se ambos faltarem, o fallback
nomeado `peer-reviewer` é tentado; nenhum agente anônimo ou outro nome pode substituir
esses agentes. No fallback, o dispatcher define explicitamente
`protocol_mode: DEEP_REVIEW_FALLBACK` e ativa o adaptador/schema normalizado abaixo;
isso não altera o contrato `APROVADO`/`BLOQUEADO` da revisão TDD normal. O fallback
recebe o protocolo completo, a mesma revisão e o mesmo schema **normalizado** e
limiar de blocker P0/P1. Se nenhum `deep-reviewer` ou `peer-reviewer` nomeado estiver
disponível, a rodada é `BLOCKED`.

**`context`** (comum a todos): modo da revisão (ex.: "PR owner/repo#N", "branch/base
main → feat/x", "commit abc123", "instruções customizadas") e instruções adicionais
do usuário. **Somente no modo PR** inclua o `patch_source` remoto, seu `sha`/`head-sha`
e o `consumer_context` fixado na mesma revisão. Nos modos branch/base, não commitadas,
commit e custom, inclua apenas o `local_revision_context` correspondente; não invente
SHA remoto nem exija `patch_source` ou `consumer_context`. Todo consumidor lido para
checagem cross-boundary deve ser carregado no contexto de revisão declarado para seu
modo; divergência, ausência ou não resolvibilidade desse contexto bloqueia.

**Por revisor (`task` do item)** — assignment com:
1. Lista EXATA dos arquivos atribuídos como alvos de achados. O revisor pode ler
   arquivos relacionados para contexto e checagem cross-boundary, mas não registra
   achados fora dos arquivos atribuídos;
2. Instrução de acesso ao diff:
   - Custom sem diff: não inclua hunks nem ordene `git diff`/`git show`; inclua somente
     a lista exata de arquivos do inventário atribuídos e peça leitura do workspace atual.
   - Diff pequeno (≤ 50.000 caracteres E ≤ 20 arquivos): inclua os hunks dos arquivos
     dele inline no assignment, com a ordem "use estes hunks; NUNCA rode git diff; no
     modo PR, nunca trate o workspace como fonte do patch; MAY leia arquivos inalterados
     apenas como contexto do consumidor para a checagem cross-boundary";
   - Diff grande: apenas uma prévia por arquivo (primeiras ~`max(5, floor(100/fileCount))`
     linhas de conteúdo de cada hunk) + a ordem adequada ao modo: em **Custom**, rode
     `git diff HEAD -- "<path>"` para cada arquivo e, para untracked, `git diff --no-index -- /dev/null "<path>"`;
     em **Não commitadas**, rode ambos `git diff -- "<path>"` e `git diff --cached -- "<path>"`; em
     branch/commit, rode `git diff`/`git show` para os arquivos atribuídos; em jj, rode
     `jj --ignore-working-copy diff --git -- "<path>"`.
   - **Modo PR, qualquer tamanho**: leia o patch somente do `patch_source` remoto coletado
     por `gh pr diff` ou `pr://<owner>/<repo>/<N>/diff/all` (ou seu índice de arquivo).
     NUNCA use `git diff`/`git show` local nem trate o workspace como fonte do patch.
     O workspace local é somente contexto do consumidor, fixado no mesmo SHA; se a fonte
     remota falhar ou estiver vazia, bloqueie sem fallback local. Não registre achados
     fora dos arquivos atribuídos";
   - **Demais modos**: leia o patch e os arquivos atribuídos pelas fontes locais
     indicadas na coleta e no `local_revision_context`. Não procure ou fabrique
     `patch_source`, SHA/head-SHA de PR ou `consumer_context`; a checagem cross-boundary
     usa somente o contexto local declarado para branch/base, não commitadas, commit ou
     custom.
3. "MAY read full file context as needed via `read`": leia sempre os arquivos atribuídos
   e, para cada valor que cruza fronteira, localize e leia também o consumidor/dispatcher
   antes de concluir; em PR, o patch continua exclusivamente remoto e o workspace é
   apenas contexto do consumidor;
4. Registro de achados, identidade e veredito somente via seções incrementais nativas
   de `yield` (`type: ["findings"]` quando houver achados; `type: ["agent"]`,
   `type: ["protocol_mode"]`, `type: ["status"]`, `type: ["reviewed_revision"]`,
   `type: ["overall_correctness"]`, `type: ["explanation"]` e
   `type: ["confidence"]`). Cada seção escalar recebe somente seu próprio
   `result.data`; não envie JSON externo, objeto completo ou ferramenta separada de
   finding.

Dispare todos em paralelo na mesma chamada; não serialize.

## FASE 4 — Protocolo do revisor (o que cada sub-agente executa)

Fonte primária: `skill://deep-review/agents/deep-reviewer.md` (definição verbatim
extraída do omp). O resumo abaixo serve para você saber o que esperar do resultado.

**Missão**: identificar bugs que o autor gostaria de corrigir antes do merge.
Ferramentas somente leitura (`read`, `grep`, `glob`, `bash` restrito, `lsp`,
`web_search`, `ast_grep`); NUNCA edita arquivos nem dispara builds. Bash limitado a
`git diff`, `git log`, `git show`, `jj diff --git`, `gh pr diff`.

**Procedimento**:
1. No modo PR, use apenas o diff remoto autorizado; nos demais modos com diff, use o
   patch fornecido ou o comando indicado no assignment. Em Custom sem diff, leia as
   instruções e o workspace sem exigir patch.
2. Ler os arquivos modificados ou atribuídos para contexto completo;
3. Registrar cada achado com `yield` incremental `type: ["findings"]` quando houver
   achados;
4. Registrar cada campo de identidade e veredito (`agent`, `protocol_mode`, `status`,
   `reviewed_revision`, `overall_correctness`, `explanation`, `confidence`) em uma
   seção incremental escalar separada e parar — a finalização em idle monta o
   resultado.

**Critérios — um achado só é reportado se TODOS valerem**:
- **Impacto provável**: apontar caminhos de código concretamente afetados (sem especulação);
- **Acionável**: fix discreto; nunca "considere melhorar X";
- **Não-intencional**: claramente não é escolha deliberada de design;
- **Evidência no escopo**: em modos com patch, o defeito foi introduzido pelo patch;
  em Custom sem patch, o defeito está no estado atual revisado;
- **Sem suposições não declaradas**: o bug não depende de suposição sobre o resto do
  codebase ou sobre a intenção do autor;
- **Rigor proporcional**: o fix não exige um rigor ausente no resto do codebase.
**Checagem cross-boundary (obrigatória)**: para cada novo tipo, variante ou valor que
cruza fronteira de função/módulo — introduzido pelo patch quando há patch, ou presente
no estado atual em Custom sem patch (evento, mensagem, comando, frame, variante de
enum, item de fila, payload de IPC):
1. Localizar o **ponto de despacho** no lado CONSUMIDOR — o switch, router, cadeia de
   filtros, registro de handlers ou loop que recebe e roteia valores desse tipo.
2. Confirmar que o novo tipo tem branch explícito, ou que o catch-all existente o
   encaminha corretamente.
3. Novo tipo caindo em drop silencioso / no-op / descarte (ex.: `if`/`switch` sem
   match que retorna sem processar) → reportar como defeito.

O ponto de despacho frequentemente está FORA do diff: o revisor DEVE lê-lo antes de
concluir que o lado produtor está correto. Rastrear só o emissor ignorando o
roteamento do consumidor é a principal fonte de bugs de integração perdidos.

**Prioridades**:

| Nível | Critério | Exemplo |
|---|---|---|
| P0 | Achado válido que bloqueia release/operações | corrupção de dados, bypass de auth |
| P1 | Achado válido alto que também bloqueia a liberação | race condition sob carga |
| P2 | Achado válido médio retido; nunca bloqueia sozinho | edge case mal tratado |
| P3 | Achado válido informativo retido; nunca bloqueia sozinho | subótimo porém correto |

**Formato de cada achado** (campos obrigatórios; qualquer incompleto torna a rodada
`BLOCKED` e é preservado como diagnóstico):
- `title`: imperativo, ≤ 80 caracteres;
- `body`: um parágrafo — bug, condição de disparo, impacto; tom neutro; blocos de
  sugestão de código apenas quando forem substituição concreta (whitespace exato, sem
  comentário em volta);
- `priority`: número inteiro 0–3;
- `confidence`: número 0.0–1.0 de que é bug real;
- `file_path`: arquivo afetado (não vazio);
- `line_start` / `line_end`: intervalo 1-indexado de ≤ 10 linhas; em modos com patch
  sobrepõe o diff e em Custom sem patch ancora linhas atuais do arquivo atribuído.

**Veredito** (por revisor):
- `status`: `VALID` somente quando todos os campos obrigatórios, o schema e a revisão
  avaliada forem válidos; ausência, timeout ou resultado malformado nunca vira aprovação;
- `reviewed_revision`: revisão exata do patch/contexto que o revisor leu. No modo
  PR deve coincidir com `consumer_context.revision`; nos demais modos deve coincidir
  com o `local_revision_context` declarado, sem exigir SHA remoto.
- `overall_correctness`: `correct` ou `incorrect`, apenas como diagnóstico, sem tornar
  P2/P3 blockers por si só;
- `explanation`: resumo do veredito em 1–3 frases de texto puro;
- `confidence`: número entre 0.0 e 1.0.

Estilo/docs/nits NÃO contam: corretude ignora questões não bloqueantes. Todo achado
DEVE ser ancorado no patch, ou nas linhas atuais do arquivo atribuído em Custom sem
patch, e sustentado por evidência. O revisor nunca emite JSON ou blocos de código
como texto final.

## FASE 5 — Consolidação normativa fail-closed e relatório

### Validação e limiar

Todos os revisores atribuídos devem retornar um resultado estruturado completo. O
agregador recebe `expectedReviewers` explícitos e exige conjunto exato: revisor
esperado ausente, inesperado ou duplicado, timeout, resultado sem identidade/protocolo,
schema inválido, status ausente/diferente de `VALID`, `reviewed_revision` ausente/
divergente ou finding incompleto produz `BLOCKED`; a identidade esperada não é
inferida do resultado. O agregador preserva o diagnóstico de cada falha e nunca
infere `correct` ou aprovação por falta de dados.
O pareamento é exato: `deep-reviewer` usa `DEEP_REVIEW` e `peer-reviewer` usa
`DEEP_REVIEW_FALLBACK`; ausência de `protocol_mode` também bloqueia.
O schema nativo do OMP trata `findings` como uma coleção incremental opcional:
quando não há achados, a seção pode estar ausente. O dispatcher deve normalizar
essa ausência para `findings: []` antes da validação do resultado normalizado; uma
seção presente, mas esparsa, incompleta ou inválida, continua produzindo `BLOCKED`.
Envelope `ok: true` com `errors` é inconsistente e bloqueia; envelope
`ok: false`/`status: "BLOCKED"` preserva seus erros no diagnóstico.
Em particular, revisor esperado ausente => `BLOCKED`, resultado sem veredito =>
`BLOCKED`, schema inválido => `BLOCKED` e finding incompleto => `BLOCKED`.

Somente achados válidos P0/P1 bloqueiam a liberação; um veredito `incorrect` sem
achado válido P0/P1 não bloqueia sozinho. P2/P3 são retidos no relatório com localização e contagem e nunca bloqueiam sozinhos. A validação exige `title`, `body`, prioridade
inteira 0–3, confiança 0.0–1.0, `file_path` não vazio e intervalo de até 10 linhas.
O resultado do revisor (inclusive o fallback adaptado) usa `status: VALID`; esse
valor não é o veredito consolidado. O resultado consolidado contém `status`
(`APPROVED` ou `BLOCKED`), `reviewed_revision`, `blockers` somente com achados
válidos P0/P1, `findings` com todos os achados válidos P0/P1/P2/P3, `counts` por
P0/P1/P2/P3, `reviewers` e `fallback_agent`. `blockers`
contém somente achados válidos P0/P1; `findings` retém todos os achados válidos P2/P3
com localização e contagem (e também os P0/P1 para não perder evidência).
### Adaptador de fallback e schema normalizado

O dispatcher tem dois contratos distintos e não os mistura:

1. `TDD_PEER_REVIEW` invoca `peer-reviewer` e exige a saída textual normal
   **APROVADO** ou **BLOQUEADO**. Essa saída não é validada como resultado
   normalizado de deep-review.
2. `DEEP_REVIEW_FALLBACK` invoca o `peer-reviewer` nomeado somente como fallback e
   exige o objeto normalizado `{ agent: "peer-reviewer", protocol_mode:
   "DEEP_REVIEW_FALLBACK", status: "VALID", reviewed_revision,
   overall_correctness, explanation, confidence, findings }`.
   O adaptador rejeita status normal sem conversão explícita, valida todos os campos
   e entrega o objeto ao mesmo agregador usado para `deep-reviewer`.

O adaptador preserva `reviewed_revision`, findings P0–P3, localização e o limiar:
somente P0/P1 válidos viram `blockers`; P2/P3 permanecem em `findings` e `counts`.
Resultado ausente, mistura de modos, schema incompleto ou revisão divergente vira
`BLOCKED` com diagnóstico preservado; nunca se infere aprovação.


### PR, SHA e consumidor

**Somente no modo PR** `patch_source` é obrigatoriamente a fonte remota exata obtida por
`gh pr diff` ou `pr://.../diff/...`, com conteúdo não vazio e SHA resolvido. Patch remoto
vazio ou indisponível => `BLOCKED`; nunca usar fallback de patch local nem substituir
o patch remoto pelo workspace local. Registre o SHA avaliado e fixe o `consumer_context` na mesma revisão antes de distribuir assignments. SHA ausente, divergente ou impossível de resolver => `BLOCKED`, mesmo que o workspace contenha um patch diferente.
No branch/base, não commitadas, commit e custom, valide o `local_revision_context`
apropriado (refs/revisões locais ou estado do workspace) e mantenha
`patch_source`, SHA/head-SHA remoto e `consumer_context` ausentes; nunca invente um
SHA remoto para preencher esses campos.
Fixar a revisão do consumidor no contexto é uma regra exclusiva do modo PR; em todos
os modos locais, a checagem cross-boundary usa o contexto local declarado e validado.

### Resolução de agentes

A resolução procura `deep-reviewer` primeiro no projeto e depois no usuário. Só
quando ele estiver ausente nos dois escopos usa `peer-reviewer` nomeado como fallback
(também procurando os dois escopos); ele recebe o protocolo completo e produz o mesmo
schema, validação e limiar P0/P1 de blocker, mantendo P2/P3 não bloqueantes. Nunca
usar fallback anônimo. Nenhum `deep-reviewer` ou `peer-reviewer` nomeado disponível
=> `BLOCKED`.

### Relatório

Relate modo, revisão fixada (SHA/head-SHA somente no PR), `patch_source` remoto
somente no PR ou `local_revision_context` nos modos locais, veredito consolidado,
diagnóstico de cada revisor, blockers P0/P1, findings P0–P3, localização, contagem
por prioridade e arquivos excluídos com motivo. A liberação só é `APPROVED` quando
todos os resultados são `VALID`, a revisão é consistente e não há blocker P0/P1;
P2/P3 permanecem visíveis para decisão posterior.

- Número de revisores segue a tabela da FASE 2 — não invente fan-out maior; 1 revisor
  é o esperado para diffs pequenos.
- Nunca inclua diff inteiro inline acima dos limites (50.000 caracteres ou 20
  arquivos) — o prompt estoura e a qualidade cai; use prévia + ordem de leitura.
- Revisor registra achados apenas nos arquivos atribuídos; pode ler contexto fora deles
  para checagens cross-boundary. Sobreposição de ownership gera achados duplicados.
- Modo PR nunca usa git local nem trata o workspace como fonte do patch; arquivos inalterados
   do workspace podem ser lidos apenas como contexto do consumidor para a checagem cross-boundary.
- Não passe `outputSchema` na chamada `task` para o agente `deep-reviewer`: a saída
  nativa dele (seções incrementais de `yield`) é o contrato que a TUI renderiza
  como veredito + achados.
- Use sempre o `deep-reviewer` desta skill — nunca o agente embutido `reviewer` do
  omp (evita conflito de comportamento e dependência do binário).
- Diff vazio ou 100% filtrado em modos que exigem diff: pare antes de disparar revisores;
  Custom sem diff segue com leitura do workspace.
