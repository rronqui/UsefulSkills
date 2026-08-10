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
  "operation": "rebase",
  "files": ["caminho/afetado"],
  "hunks": ["caminho/afetado:hunk-2"],
  "attempt": 2,
  "commandsExecuted": ["git status", "git diff --check", "npm test"],
  "redactedEvidence": "evidência redigida: conflito no hunk-2",
  "pendingDecision": "escolher a intenção compatível com a issue",
  "blockers": ["hunk-2 ainda não resolvido"],
  "checks": {"status": "FAIL", "handoff": "implementation-owner/state"},
  "diagnostic": {
    "code": "E_CONFLICT_STATE",
    "summary": "hunk-2 ainda não resolvido"
  },
  "reviewed_revision": null,
  "resolved_revision": null,
  "resultingGitOperation": null,
  "nextGitOperation": "git rebase --continue"
}
```

Ao atualizar o registro, preserve `commandsExecuted` (comandos executados),
arquivos, hunks, tentativa, decisão pendente e `blockers`; não descarte esses
campos, a prova persistida ou o diagnóstico. A evidência deve ser redigida
**antes** de persistir (`redacted evidence`/evidência redigida) e não pode
conter tokens, segredos ou probes.

Um check que falhar mantém `status: BLOCKED`: registre `FAIL`, a evidência e um
`handoff` para **`implementation-owner/state`** (owner e fase de implementação).
Esse handoff encaminha a correção para o dono da implementação. Em `FAIL`, não
conceda sucesso: o status permanece `BLOCKED` e a resolução não avança. Não altere
permissões TDD nem marque a resolução como concluída.

Todo handoff de bloqueio deve ser redigido e validado antes de qualquer transporte.

O handoff mínimo preserva: `operation` (merge/rebase), estado atual do Git,
arquivos/hunks, `attempt`, comandos executados e a prova redigida. Cada campo
que possa conter segredo, token, credencial, caminho sensível ou conteúdo de
usuário deve passar por redaction e sanitização antes de persistir ou
transportar — não apenas `redactedEvidence`; nenhum campo bruto pode atravessar
o handoff. Registre literalmente `<REDACTED>` no lugar e bloqueie
(`E_CONFLICT_STATE`) se a sanitização não puder ser provada. `E_CONFLICT_STATE`
é o código reconhecido para estado de conflito/redaction não comprovada; não
introduza um código de erro local sem adicioná-lo ao catálogo e ao validator.
A prova deve incluir o comando e o resultado sanitizados, nunca o valor secreto;
a operação só pode ser retomada depois de validar esse envelope.

O estado retomável também mantém `reviewed_revision` e `resolved_revision` como
identidade explícita do snapshot, além de `resultingGitOperation`, `nextGitOperation`,
`checks` e `pending`; esses campos são validados antes da finalização.

### Evidência ausente: manter o estado `BLOCKED`

Se `redactedEvidence` ou `pendingDecision` estiver ausente, vazio ou não puder ser
redigido com segurança, mantenha `status` e `phase` como `BLOCKED`, registre a
ausência no handoff `implementation-owner/state` e não declare nem encaminhe
sucesso. A prova faltante deve ser resolvida antes de qualquer finalização.

Uma retomada (`resume`/retomada) deve ler o registro persistido **e o estado real
do Git**, incrementar `attempt` e continuar do ponto persistido. Preserve, sem
zerar ou substituir por inferência, os campos e provas já registrados — `status`,
`phase`, `operation`, `files`, `hunks`, `commandsExecuted`, `redactedEvidence`,
`pendingDecision`, `blockers`, `checks` (incluindo o handoff
`implementation-owner/state`), `diagnostic`, `reviewed_revision`,
`resolved_revision`, `resultingGitOperation` e `nextGitOperation`. Mantenha o
histórico de `attempt` e grave o novo valor incrementado (`attempt + 1`); não o
reinicie. `resultingGitOperation` só recebe um comando depois de ele ser
observado com sucesso no Git; enquanto estiver pendente, mantenha-o `null` e
use `nextGitOperation`. O comando resultante preservado deve continuar vinculado
à operação observada no Git, nunca ser trocado pelo comando mais conveniente.
Sem evidência redigida, decisão pendente, blockers ou operação resultante
consistentes, preserve o estado `BLOCKED`; não autorize sucesso.

## 4. Checks e finalização
Após resolver todos os hunks, registre os checks determinísticos com comando,
saída e status. O snapshot final exige `reviewed_revision` exatamente igual a
`resolved_revision`, e a prova da re-review deve conter
`review.reviewed_revision` com o mesmo valor de `resolved_revision`; todos os
hunks devem estar resolvidos, não pode haver commit pendente,
`checks.status` deve ser `PASS` e `checks.pending` deve ser `[]`.
`resultingGitOperation` deve corresponder à operação observada no Git
(`git commit` no merge ou o último `git rebase --continue` aplicado no rebase),
e nunca a uma operação apenas planejada.

Para `rebase`, aplique `git rebase --continue` e repita os checks após cada commit
até não haver commits pendentes; somente depois faça a re-review final
(`deep-review`) do estado terminal. O campo `resultingGitOperation` registra essa
última continuação bem-sucedida; quando o rebase já terminou, não execute
`git rebase --continue` novamente. Nunca faça a re-review antes de aplicar todos
os commits pendentes. Para `merge`, depois desses checks obtenha a re-review final
(`deep-review`) do snapshot resolvido e só prossiga com `git commit` se ela estiver
`APPROVED`, `review.reviewed_revision` for igual a `resolved_revision`, sem
blockers e com P0/P1 iguais a zero.
No merge, `resolved_revision` identifica o snapshot resolvido e revisado antes do
commit; `resultingGitOperation` é somente a evidência do comando `git commit`
observado depois que o gate passou. Se a implementação persistir o SHA criado pelo
commit, use um campo separado (`resulting_revision`); nunca sobrescreva
`reviewed_revision`/`resolved_revision` com a revisão pós-commit nem trate essa
mudança de metadado como motivo para executar a re-review novamente.

P2/P3 podem permanecer como achados documentados, mas **não bloqueiam** quando
não houver P0/P1, hunk, check pendente ou divergência de snapshot. Qualquer P0/P1,
hunk, check pendente ou divergência de snapshot mantém a operação bloqueada. Se
algum check falhar, preserve a prova e retome do mesmo ponto; não reinicie a
tentativa nem substitua a decisão pendente por inferência.

Antes de concluir, inspecione `git diff --cached` e `git status --short`; então
finalize somente quando o gate acima estiver satisfeito. No rebase, a última
continuação já é a operação de finalização e a re-review aprovada autoriza
reportar `RESOLVED`; no merge, a re-review aprovada autoriza `git commit`.

No consumidor `ship`/conflict, a re-review aprovada do snapshot resolvido é um
gate anterior a **qualquer** `git commit` ou `git push`: sem
`review.status = APPROVED`, sem blockers/P0/P1 e sem
`review.reviewed_revision === resolved_revision`, mantenha `BLOCKED` e não
execute nem registre commit/push como realizado.

Caso o rebase ainda tenha commits após uma continuação, repita o ciclo; o comando
final só ocorre depois que o estado terminal foi revisado.

**Integração com a solução UsefulSkills:**
- Merge local do `tdd-orchestrator` (Entrega final, caminho "merge local"): em
  conflito, execute este protocolo antes de reportar.
- PR da skill `ship` em conflito com a base: na branch do PR, descubra a branch
  default do repositório, rode `git fetch origin` e `git merge origin/<branch default>`,
  resolva cada hunk, passe pelos checks e pela re-review aprovada, então commite e dê
  push; o auto-merge retoma quando o CI ficar verde.
  Nunca faça rebase da branch do PR.
