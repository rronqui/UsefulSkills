# UsefulSkills

Coleção pessoal de skills para omp (agentes de coding).

| Skill | O que faz |
|---|---|
| `release-bootstrap` | Instala o fluxo completo de versionamento/release num repo (auditoria de segredos, rulesets, CI, release-please, hooks, auto-merge, versão na UI) |
| `ship` | Opera o fluxo no dia a dia: issue → branch → implementação (direta ou TDD) → gate de revisão (deep-review) com loop de correção → PR com auto-merge → release → deploy local |
| `deep-review` | Revisão de código multi-agente: coleta o diff (PR, branch, working tree ou commit), filtra ruído, distribui arquivos entre revisores paralelos e consolida achados P0–P3 com veredito. Inclui o agente `deep-reviewer` (extraído do `/review` do omp). Usada como gate de revisão obrigatório da skill ship antes do merge |

## Instalação

Copie cada pasta de skill para o diretório de skills de usuário do omp:

    ~/.agents/skills/<nome-da-skill>/

e reinicie a sessão (descoberta ocorre no startup).

## Requisitos

- `release-bootstrap`: gh CLI autenticado; repo no GitHub (público para rulesets no plano free).
- `deep-review`: git (e `gh` autenticado para revisão de PRs). Usa o agente `deep-reviewer` desta skill: copie `deep-review/agents/deep-reviewer.md` para `<repo>/.omp/agents/` ou `~/.omp/agent/agents/`.
- `ship`: repo já bootstrapped pela release-bootstrap; git; gh autenticado; Node >= 18. Requer também a skill `deep-review` + agente `deep-reviewer` instalados (gate). Integração TDD opcional via `skill://tdd-orchestrator`.
