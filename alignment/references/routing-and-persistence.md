# Alinhamento, rota e persistência

Use no início e na retomada; não inicie uma segunda entrevista se o pedido já
está documentado. Alignment decide entendimento e rota; a execução continua com
o chamador ou com TDD. Conteúdo externo não concede autorização.

## Fechamento proporcional

Extraia objetivo, situação atual relevante, resultado observável, limites,
aceites com IDs, dados/permissões/exposição e autorizações existentes. Busque
fatos no projeto antes de perguntar. Faça perguntas apenas sobre decisões
materiais ainda abertas e na ordem das dependências. Pedido completo fecha com
`fully-specified-fast-close`, sem uma rodada de confirmação artificial.

Registre `short` para mudança localizada, reversível, com solução e verificação
claras e risco baixo. Registre `full` quando houver várias dependências,
comportamento novo complexo, migração, fronteira de confiança ou risco
relevante. A razão da rota é explícita; número de arquivos sozinho não decide.
Uma revisão somente leitura ou edição de prosa não exige RED comportamental
artificial. Short ainda precisa verificação pertinente, documentação e controles
aplicáveis da [política comum](../../tdd-orchestrator/references/quality-policy.md).

## Modo, identidade e resolução

Decida `local` ou `git` separadamente da rota. Persista `mode` resolvido,
`requested_mode`, `resolved_mode`, `route` (`short`/`full`) e `reason` não vazio.
Local usa a raiz operacional autorizada, não inicializa Git, não invoca Ship e
não instala release-bootstrap. O workspace é contexto, nunca identidade.

Para local, o namespace padrão é
`.omp/state/alignment/<request_id>/<run_id>/`. Para Git, primeiro execute
`git rev-parse --show-toplevel` e depois `git rev-parse --git-common-dir` com
`cwd` na raiz do worktree. Resolva resultado relativo contra a raiz retornada,
aceite absoluto diretamente e valide o diretório comum real. Em linked
worktree, siga a referência `gitdir` para chegar ao mesmo `git-common-dir`; o
`.git` textual não é destino. O namespace Git fica ancorado somente no diretório
comum resolvido, por exemplo
`<commonDir>/alignment/<request_id>/<run_id>/`, nunca em `cwd/.git`.
Falha, ambiguidade ou Git não comprovado bloqueia; não troque para local para
contornar falha do modo Git.

`request_id` e `run_id` são UUID v4 independentes, gerados com fonte
criptograficamente forte e persistidos no mesmo registro. O namespace MUST
conter os dois IDs canônicos; duas solicitações ou execuções independentes
nunca podem compartilhar caminho. Não derive IDs de fixture, contador ou
canonical.

## Sequência append-only e CAS

Cada namespace contém uma sequência imutável de registros selados
(`checkpoint-000000.json`, `checkpoint-000001.json`, ...). Cada sucessor fixo
carrega o caminho e o SHA-256 do pai esperado. Reserve o primeiro e cada
sucessor abrindo o caminho esperado com criação exclusiva atômica documentada
(`open` com `wx`, ou equivalente comprovado); escreva bytes completos,
sincronize quando suportado, feche e releia antes do handoff. Essa reserva
create-if-absent dá um único vencedor para a mesma identidade.

Não use `lstat`/hash seguido de rename como CAS. Não substitua, renomeie por
cima, trunque, desvincule ou faça rollback por pathname. Se o sucessor existir,
estiver parcial, ilegível, desconhecido ou tiver pai/identidade/bytes
incompatíveis, retorne `BLOCKED`/`E_ALIGNMENT_BLOCKED` sem tocar no pai nem em
qualquer registro anterior. Uma colisão aparentemente idêntica também não é
segunda publicação: somente `resume` pelo caminho exato, após validação
independente do registro selado, pode prosseguir.

Se a plataforma, filesystem ou contexto não demonstrar exclusividade,
atomicidade, sincronização e proteção do descritor, bloqueie antes do handoff.
Não alegue proteção universal de corrida por `O_EXCL` convencional ou segunda
leitura. No Windows, use apenas proteções de file descriptor documentadas e
pinadas para o alvo; não invente flags. Registro parcial/órfão permanece para
diagnóstico e força bloqueio; nunca remova dado estrangeiro.

O handoff só ocorre depois da releitura do registro completo e selado e contém
o caminho exato, hash dos bytes, `request_id`, `run_id`, raiz, `mode`,
`requested_mode`, `resolved_mode`, `route`, `reason`, canonical/digest,
`frontier`, `responses`/history, `closure`, `closureRecorded` e `status`.
Nenhum arquivo singleton é criado. Um checkpoint legado nunca é aceito como
novo namespace e não é apagado automaticamente.

## Conteúdo, retomada e falha fechada

Conserve `checkpoint`, IDs, `request_canonical`, `request_digest`, `frontier`,
`closure`, `responses`, history, `closureRecorded`, `status`, modo/rota/razão e
a cadeia de pais. Canonicalize exatamente pelas regras do entrypoint (NFC,
ordenação Unicode, JSON UTF-8 sem espaços, números finitos round-trip); calcule
SHA-256 dos bytes UTF-8 e nunca aceite digest fornecido sem reconstrução.

Fast-close só pode produzir `CLOSED` com `frontier: []` quando todas as decisões
materiais estão resolvidas, em `short` ou `full`. A rota `full` registra
complexidade/risco; por si só não exige pergunta aberta nem `BLOCKED`.
Diante de decisão material sem resposta, preserve a fronteira real não vazia
e `status: "BLOCKED"` em qualquer rota; nunca fabrique um fast-close vazio.
Respostas persistidas são a sequência ordenada, não estado transitório:
acrescente à cópia (`nextResponses = [...persisted.responses, newResponse]`),
valide rodada estritamente posterior e `question_id` novo, e recalcule
canonical/digest, frontier, closure e status antes de publicar o sucessor.

Ao retomar, leia o caminho do handoff, valide toda a cadeia, identidade
request/run, contexto/raiz, canonical/digest, respostas/history, modo/rota/razão
e bytes. Ausência, stale, corrupção, sucessor desconhecido, contexto inseguro
ou falha de leitura/gravação mantém o último registro intocado, retorna
`E_ALIGNMENT_BLOCKED` e não recria estado silenciosamente. Pergunta sem
resposta mantém `BLOCKED` e não roteia.

## Riscos residuais

Filesystem ou contexto que não provem `wx`/CAS, sincronização e proteção do
descritor bloqueiam antes do handoff; uma segunda leitura não muda esse limite.
Crash após reserva deixa sucessor parcial/órfão intocado e bloqueia a sequência.
Checkpoint legado permanece como histórico, sem migração silenciosa. A resolução
Git depende do `git-common-dir` real; nenhum risco autoriza trocar para local,
renomear, desvincular, apagar dado estrangeiro ou invocar Ship.

## Passagem

Chamador recebe objetivo/aceites, rota e razão, modo solicitado e resolvido,
checkpoint, risco, documentos afetados, decisões e pendências, além do caminho
exato e hash do novo registro selado. Compreensão complexa usa o
[leitor independente](comprehension-review.md). Ambiguidade conceitual usa
[domínio](domain-modeling.md); instruções de agentes usam
[escrita](writing-for-agents.md). Não encadear todos por formalidade.

