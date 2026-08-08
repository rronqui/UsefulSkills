---
name: conflict-resolution
description: Resolver conflitos de merge/rebase hunk a hunk pela intenção de cada lado (commit messages, PRs, issues), nunca --abort, rodar os checks do projeto e finalizar a operação. Use ao encontrar conflitos de merge ou rebase, ou quando um PR entrar em conflito com a branch base.
---

# conflict-resolution — resolução de conflitos de merge

1. **Veja o estado atual** do merge/rebase: histórico do git e os arquivos em
   conflito.

2. **Encontre as fontes primárias** de cada conflito. Entenda profundamente por que
   cada mudança foi feita e qual era a intenção original: leia as mensagens de
   commit, os PRs, as issues/tickets vinculados.

3. **Resolva cada hunk.** Preserve as duas intenções quando possível. Quando
   incompatíveis, escolha a que casa com o objetivo declarado do merge e registre o
   trade-off. **Não** invente comportamento novo. Sempre resolva; **nunca**
   `--abort`.

   Se, após esgotar as fontes primárias, um hunk for genuinamente não resolúvel
   (intenções irrecuperáveis, ou incompatíveis sem critério de desempate), PARE e
   reporte ao chamador com o estado exato (arquivos, hunks, o que tentou). Isso é
   reportar, não abortar: a operação permanece como está e quem chamou decide.

4. Descubra os **checks automatizados** do projeto e rode-os — tipicamente
   typecheck, depois testes, depois build/format. Corrija o que o merge quebrou.
   (Em repo da solução ship/release-bootstrap: os comandos do CI e/ou do manifesto
   `ship.config.json`.)

5. **Finalize o merge/rebase.** Faça stage apenas dos caminhos resolvidos (`git add --
   <arquivo-resolvido> ...`), confira `git status --short` para garantir que não há
   alterações não relacionadas no índice e commit. Em rebase, continue o processo até
   todos os commits rebasados.

**Integração com a solução UsefulSkills:**
- Merge local do `tdd-orchestrator` (Entrega final, caminho "merge local"): em
  conflito, execute esta skill antes de reportar (reportar é o último recurso,
  ver passo 3).
- PR da skill `ship` em conflito com a base antes do merge: na BRANCH do PR rode
  `git fetch origin` e depois `git merge origin/<branch default>`, resolva por esta
  skill, commite e dê push — o auto-merge retoma quando o CI ficar verde. Nunca
  rebase da branch do PR.
