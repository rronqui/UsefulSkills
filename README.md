# UsefulSkills

Coleção pessoal de skills para omp (agentes de coding).

| Skill | O que faz |
|---|---|
| `release-bootstrap` | Instala o fluxo completo de versionamento/release num repo (auditoria de segredos, rulesets, CI, release-please, hooks, auto-merge, versão na UI) |
| `ship` | Opera o fluxo no dia a dia: issue → branch → implementação (direta ou TDD) → gate de revisão (deep-review) com loop de correção → PR com auto-merge → release → deploy local. Alinhamento (alignment) obrigatório antes do roteamento. |
| `deep-review` | Revisão de código multi-agente: coleta o diff (PR, branch, working tree ou commit), filtra ruído, distribui arquivos entre revisores paralelos e consolida achados P0–P3 com veredito. Inclui o agente `deep-reviewer` (extraído do `/review` do omp). Usada como gate de revisão obrigatório da skill ship antes do merge |
| `tdd-orchestrator` | Orquestra uma lista de tarefas ponta a ponta via TDD com sub-agentes especializados (Red-Green-Refactor, peer review independente, validação com evidência, commits por tarefa, integração por ondas). Usado pelo ramo comportamental da skill ship com `delivery: external` |
| `alignment` | Entrevista de alinhamento em rodadas (árvore de decisões/fronteira) antes de implementar; etapa obrigatória do fluxo ship |
| `bug-diagnosis` | Disciplina de diagnóstico de bugs difíceis: feedback loop vermelho → minimizar → hipóteses → instrumentar → fix com teste de regressão |
| `conflict-resolution` | Resolução de conflitos de merge/rebase hunk a hunk pela intenção, nunca --abort |

## Instalação

Instalador determinístico na raiz do projeto:

```bash
node install.mjs           # instala skills em ~/.omp/agent/skills/ e agentes em ~/.omp/agent/agents/
node install.mjs --check   # compara hashes; lista divergências; exit 1 se houver drift
```

e reinicie a sessão do omp (descoberta ocorre no startup). O instalador nunca toca
arquivo fora do inventário (7 skills + 9 agentes).

## Requisitos

- `release-bootstrap`: gh CLI autenticado; repo no GitHub (público para rulesets no plano free).
- `deep-review`: git (e `gh` autenticado para revisão de PRs). Usa o agente `deep-reviewer` desta skill em `<repo>/.omp/agents/` ou `~/.omp/agent/agents/` (projeto vence usuário em colisão de nome).
- `ship`: repo já bootstrapped pela release-bootstrap; git; gh autenticado; Node >= 18. Requer também a skill `deep-review` + agente `deep-reviewer` instalados (gate) e as skills `alignment`, `bug-diagnosis`, `conflict-resolution` (alinhamento obrigatório, diagnóstico para correções de bug, resolução de conflitos no merge/PR). Integração TDD via `skill://tdd-orchestrator` (opcional mas recomendada para mudanças comportamentais).
- `alignment`, `bug-diagnosis`, `conflict-resolution`: sem requisitos externos.
- `tdd-orchestrator`: nenhum binário externo obrigatório além de git/build do projeto; requer os 8 agentes de `tdd-orchestrator/agents/` disponíveis ao runtime em projeto (`./.omp/agents/`) ou usuário (`~/.omp/agent/agents/`) — projeto vence usuário (o orquestrador verifica e para se faltar algum).
- `alignment`, `bug-diagnosis` e `conflict-resolution` são adaptações (traduzidas e sem as dependências do ecossistema original) das skills `grilling`, `diagnosing-bugs` e `resolving-merge-conflicts` de github.com/mattpocock/skills (MIT).
- Os 9 agentes com modelo fixado (test-author, backend-developer, frontend-developer,
  refactorer, validator, integrator, peer-reviewer, spec-kit-author, deep-reviewer)
  usam `model: openai-codex/gpt-5.6-luna, @slow` — primário com fallback para o
  role `@slow` (remapável sem editar arquivos). Override global sem tocar nos
  agentes:
  `task.agentModelOverrides` no config do omp.

## Política de releases

- Mudanças entram somente via issue → branch (`fix/N-slug` / `feat/N-slug`) → implementação → gate de revisão (skill `deep-review`) → PR (`Closes #N`) → merge. Branch `main` protegida por ruleset (sem push direto).
- Commits seguem Conventional Commits (validados pelo hook `commit-msg`); o bump SemVer é automático pelo release-please: `fix:` → patch, `feat:` → minor, `!`/`BREAKING CHANGE:` → major. Ninguém edita versão manualmente.
- O release-please roda via `.github/workflows/release-please.yml` usando o secret `RELEASE_PLEASE_TOKEN` (PAT): PRs criados com o `GITHUB_TOKEN` padrão não disparam o CI no PR de release.
- O hook `pre-push` bloqueia push direto na `main` (bypass documentado: `git push --no-verify`).

### Desenvolvimento local

```bash
npm install   # instala dependências e os git hooks (prepare)
npm test      # suíte de testes
```
