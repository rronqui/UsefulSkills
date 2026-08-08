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
- Schema de saída: veredito (`overall_correctness` enum correct/incorrect,
  `explanation`, `confidence`) + achados opcionais (`findings`: title, body,
  priority, confidence, file_path, line_start, line_end) preenchidos via seções
  incrementais de `yield`;
- O procedimento, os critérios de reporte, a checagem cross-boundary, a tabela
  P0–P3 e o formato do achado.

NUNCA use o agente embutido `reviewer` do omp nem qualquer outro revisor: usar o
`deep-reviewer` garante comportamento idêntico sem conflito de nomes na descoberta
de agentes. Se a chamada `task` com `agent: "deep-reviewer"` falhar por agente
desconhecido, instale o arquivo desta skill antes de repetir o fan-out — projeto:
`<repo>/.omp/agents/deep-reviewer.md`, ou usuário:
`~/.omp/agent/agents/deep-reviewer.md` (projeto vence usuário em colisão de nome).
Como último recurso, embuta o conteúdo integral do arquivo no assignment de um
agente genérico.

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
(não dispare revisores sem material). **Custom é a exceção:** sem mudanças, o
assignment contém apenas as instruções e os revisores leem o workspace por conta própria.

- **PR**: `gh pr diff <N> -R <owner>/<repo>` (fallback: `read pr://<owner>/<repo>/<N>/diff/all`).
  Falha ao buscar → reporte o erro e pare.
- **Branch base**: se o chamador informou a branch base (ex.: outra skill
  orquestrando o fluxo), use-a diretamente sem perguntar; caso contrário pergunte
  ao usuário (liste com `git branch -a` se necessário). Branch atual via
  `git branch --show-current`. Diff: `git diff <base>...<atual>`.
- **Não commitadas**: primeiro `git status` (vazio → "sem mudanças não commitadas",
  pare). Depois `git diff` + `git diff --cached`, concatenados. Repositórios `jj`:
  `jj diff --git` no lugar dos dois.
- **Commit**: liste os últimos 20 com `git log --oneline -20`, pergunte qual
  (ou use o indicado pelo usuário). Diff: `git show --format="" <hash>`.
- **Custom**: peça as instruções. Se houver mudanças não commitadas no working tree,
  colete-as também e inclua as estatísticas e o diff (as instruções customizadas vão
  como "instruções adicionais"). Sem mudanças → o assignment do revisor contém apenas
  as instruções e ele lê o workspace por conta própria.

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
revisor, todos com `agent: "deep-reviewer"` (não passe `outputSchema` — a saída
estruturada nativa do agente é que habilita a renderização de veredito/achados na
TUI). Agente desconhecido no ambiente → instale
`skill://deep-review/agents/deep-reviewer.md` conforme a seção "O agente revisor"
e repita; jamais caia para outro agente revisor.

**`context`** (comum a todos): modo da revisão (ex.: "PR owner/repo#N", "branch base
main → feat/x", "commit abc123", "instruções customizadas"), instruções adicionais
do usuário, e as regras do protocolo da FASE 4 quando o ambiente não tiver o agente
`deep-reviewer` instalado (nesse caso use o agente genérico e embuta o protocolo
completo no assignment).

**Por revisor (`task` do item)** — assignment com:
1. Lista EXATA dos arquivos atribuídos como alvos de achados. O revisor pode ler
   arquivos relacionados para contexto e checagem cross-boundary, mas não registra
   achados fora dos arquivos atribuídos;
2. Instrução de acesso ao diff:
   - Diff pequeno (≤ 50.000 caracteres E ≤ 20 arquivos): inclua os hunks dos arquivos
     dele inline no assignment, com a ordem "use estes hunks; NUNCA rode git diff";
   - Diff grande: apenas uma prévia por arquivo (primeiras ~`max(5, floor(100/fileCount))`
     linhas de conteúdo de cada hunk) + a ordem "RODE `git diff`/`git show` para os
     arquivos atribuídos" (modo não-commitado: ambos `git diff -- <path>` e
     `git diff --cached -- <path>`; modo jj: `jj --ignore-working-copy diff --git -- <path>`);
   - Modo PR com diff grande: "leia os diffs de `pr://<owner>/<repo>/<N>/diff/all` ou
     por arquivo `pr://<owner>/<repo>/<N>/diff/<índice>`; NUNCA use git diff/show local
     e NUNCA leia arquivos do workspace para contexto do PR".
3. "MAY read full file context as needed via `read`" (exceto na restrição de PR acima);
4. Registro de achados e veredito via seções incrementais de `yield`
   (`type: ["findings"]`, `type: ["overall_correctness"]`, `type: ["explanation"]`,
   `type: ["confidence"]`); jamais uma ferramenta separada de finding.

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
3. Registrar cada achado com `yield` incremental `type: ["findings"]`;
4. Registrar o veredito (`overall_correctness`, `explanation`, `confidence`) com
   seções incrementais e parar — a finalização em idle monta o resultado.

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
| P0 | Bloqueia release/operações; universal (sem supor inputs) | corrupção de dados, bypass de auth |
| P1 | Alto; corrigir no próximo ciclo | race condition sob carga |
| P2 | Médio; corrigir eventualmente | edge case mal tratado |
| P3 | Info; nice to have | subótimo porém correto |

**Formato de cada achado** (campos validados; incompleto é descartado):
- `title`: imperativo, ≤ 80 caracteres;
- `body`: um parágrafo — bug, condição de disparo, impacto; tom neutro; blocos de
  sugestão de código apenas quando forem substituição concreta (whitespace exato, sem
  comentário em volta);
- `priority`: número 0–3 (0 = P0 bloqueia o release; 3 = nice-to-have);
- `confidence`: 0.0–1.0 de que é bug real;
- `file_path`: arquivo afetado (não vazio);
- `line_start` / `line_end`: intervalo 1-indexado de ≤ 10 linhas; em modos com patch
  sobrepõe o diff e em Custom sem patch ancora linhas atuais do arquivo atribuído.

**Veredito** (por revisor):
- `overall_correctness`: `correct` (sem bugs/bloqueios) | `incorrect`;
- `explanation`: resumo do veredito em 1–3 frases de texto puro;
- `confidence`: 0.0–1.0.

Estilo/docs/nits NÃO contam: corretude ignora questões não bloqueantes. Todo achado
DEVE ser ancorado no patch, ou nas linhas atuais do arquivo atribuído em Custom sem
patch, e sustentado por evidência. O revisor nunca emite JSON ou blocos de código
como texto final.

## FASE 5 — Consolidação e relatório final

Com os resultados de todos os revisores:

1. **Veredito consolidado**: se qualquer revisor retornou `incorrect`, a mudança NÃO
   está liberada; relate cada veredito com sua confiança.
2. **Achados**: valide o formato (descarte malformados), ordene por prioridade
   (P0 primeiro) e apresente: `[Pn] título — arquivo:linha` + corpo. Em visão
   resumida mostre os 3 mais graves e a contagem por prioridade
   (ex.: `1×P0 · 2×P1 · 4×P2`); liste tudo se o usuário quiser.
3. **Excluídos**: liste os arquivos filtrados com motivo (lock file, generated...).
4. Responda com: modo da revisão, veredito consolidado, achados por prioridade,
   excluídos e o que cabe ao usuário decidir (achados P0/P1 são os que bloqueiam).

## Armadilhas

- Número de revisores segue a tabela da FASE 2 — não invente fan-out maior; 1 revisor
  é o esperado para diffs pequenos.
- Nunca inclua diff inteiro inline acima dos limites (50.000 caracteres ou 20
  arquivos) — o prompt estoura e a qualidade cai; use prévia + ordem de leitura.
- Revisor registra achados apenas nos arquivos atribuídos; pode ler contexto fora deles
  para checagens cross-boundary. Sobreposição de ownership gera achados duplicados.
- Modo PR nunca usa git local nem arquivos do workspace como fonte de contexto.
- Não passe `outputSchema` na chamada `task` para o agente `deep-reviewer`: a saída
  nativa dele (seções incrementais de `yield`) é o contrato que a TUI renderiza
  como veredito + achados.
- Use sempre o `deep-reviewer` desta skill — nunca o agente embutido `reviewer` do
  omp (evita conflito de comportamento e dependência do binário).
- Diff vazio ou 100% filtrado em modos que exigem diff: pare antes de disparar revisores;
  Custom sem diff segue com leitura do workspace.
