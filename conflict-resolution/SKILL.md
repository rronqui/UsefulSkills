---
name: conflict-resolution
description: Resolver conflitos de merge/rebase hunk a hunk pela intenção de cada lado (commit messages, PRs, issues), nunca --abort, rodar os checks do projeto e finalizar a operação. Use ao encontrar conflitos de merge ou rebase, ou quando um PR entrar em conflito com a branch base.
---

# conflict-resolution — resolução determinística de conflitos de merge e rebase

Este protocolo é operacional e fail-closed: o estado observado no Git e a prova
persistida são a fonte da verdade. Nunca invente uma resolução, decisão ou sucesso.

## 1. Identificar a operação antes de resolver

Veja o estado atual (`git status --short`, histórico e arquivos em conflito) e
confirme que alterações locais não relacionadas foram commitadas ou guardadas. Se
uma operação já estiver em conflito e essas alterações existirem, não tente
commitá-las nem guardá-las no índice não resolvido: pare e peça uma worktree
separada ou um backup externo antes de editar.

Determine `operation` pela operação iniciada, não pelo comando mais conveniente:

- `rebase`: após stage apenas dos caminhos resolvidos, use **`git rebase --continue`**
  e repita enquanto ainda houver commits pendentes. A existência de commits
  pendentes, por si só, não é bloqueio: se a continuação for bem-sucedida, avance
  para o próximo commit e continue o rebase. A fase só permanece `BLOCKED` quando
  houver hunk não resolvido ou quando **`git rebase --continue`** falhar; sem
  esses estados, finalize quando não restarem commits.
- `merge` (inclusive o caminho de PR que a política define como merge): confirme
  pelo estado do Git que há um merge ativo e, após resolver e fazer os checks
  aplicáveis, finalize **esse merge ativo** com **`git commit`**. Esse é o comando
  de finalização do merge; **`git rebase --continue`** não é permitido para um
  merge ativo e não pode substituí-lo.

É explicitamente proibido executar **`git merge --continue`**, **`git rebase
--abort`** ou **`git merge --abort`**. Não use abort para ocultar estado ou
diagnóstico; uma operação não resolvida deve permanecer visível e retomável.

## 2. Resolver hunks pela intenção

Encontre as fontes primárias de cada conflito: mensagens de commit, PRs e issues.
Resolva cada hunk preservando ambas as intenções quando possível; quando forem
incompatíveis, escolha a que corresponde ao objetivo declarado e registre o
trade-off. Inspecione o resultado e faça stage somente dos caminhos resolvidos.
Se um hunk for genuinamente não resolvível após esgotar as fontes, pare e reporte
o estado exato ao chamador; não aborte a operação.

## 3. Estado BLOCKED durável, redigido e retomável

Ao encontrar conflito, dependência ausente, decisão pendente ou hunk não resolvido,
persista um registro com status/phase **`BLOCKED`** (durável) contendo, no mínimo:

```json
{
  "status": "BLOCKED",
  "phase": "BLOCKED",
  "operation": "merge|rebase",
  "files": ["caminho/afetado"],
  "hunks": ["caminho/afetado:hunk-id"],
  "attempt": 2,
  "commandsExecuted": ["git status", "git diff --check"],
  "redactedEvidence": "evidência redigida sem segredos",
  "pendingDecision": "decisão que ainda requer o owner",
  "checks": {"status": "FAIL", "handoff": "implementation-owner/state"}
}
```

`commandsExecuted` (comandos executados), arquivos, hunks, tentativa, operação e
decisão pendente não podem ser descartados ao atualizar o registro. Evidência
deve ser redigida **antes** de persistir (`redacted evidence`/evidência redigida)
e não pode conter tokens, segredos ou probes.

Um check que falhar mantém `status: BLOCKED`: registre `FAIL`, a evidência e um
`handoff` para **`implementation-owner/state`** (owner e fase de implementação).
Esse handoff encaminha a correção para o dono da implementação. Em `FAIL`, não
conceda sucesso: o status permanece `BLOCKED` e a resolução não avança. Não altere
permissões TDD nem marque a resolução como concluída.

Uma retomada (`resume`/retomada) deve ler esse registro persistido e o estado real
do Git, incrementar `attempt` e continuar do ponto persistido. Preserve, sem zerar
ou substituir por inferência, todos os campos e provas já registrados: `status`,
`phase`, `operation`, `files`, `hunks`, `attempt`, `commandsExecuted`,
`redactedEvidence`, `pendingDecision` e `checks`, além do diagnóstico associado.
Sem evidência redigida ou decisão pendente, preserve o estado `BLOCKED`; não
autorize sucesso.

## Evidência ausente e estado BLOCKED

Se `redactedEvidence` ou `pendingDecision` estiver ausente, vazio ou não puder ser
redigido com segurança, mantenha `status` e `phase` como `BLOCKED`, registre a
ausência no handoff `implementation-owner/state` e não declare nem encaminhe
sucesso. A prova faltante deve ser resolvida antes de qualquer finalização.

## 4. Checks e finalização

Descubra os checks automatizados do projeto e rode-os (tipicamente typecheck,
testes e, quando aplicável, build/format). Um check pós-resolução que falhar segue
o handoff acima e permanece bloqueado. Após todos os checks, inspecione
`git diff --cached` e `git status --short`; então finalize a operação correta:
rebase com `git rebase --continue` até não haver commits, ou merge com `git
commit` após resolver os hunks e passar pelos checks.

**Integração com a solução UsefulSkills:**
- Merge local do `tdd-orchestrator` (Entrega final, caminho "merge local"): em
  conflito, execute este protocolo antes de reportar.
- PR da skill `ship` em conflito com a base: na branch do PR rode `git fetch origin`
  e `git merge origin/<branch default>`, resolva cada hunk, commite e dê push; o
  auto-merge retoma quando o CI ficar verde. Nunca faça rebase da branch do PR.
