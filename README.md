# UsefulSkills

Coleção pessoal de skills para omp (agentes de coding).

| Skill | O que faz |
|---|---|
| `release-bootstrap` | Instala o fluxo completo de versionamento/release num repo (auditoria de segredos, rulesets, CI, release-please, hooks, auto-merge, versão na UI) |
| `ship` | Opera o fluxo no dia a dia: issue → branch → implementação (direta ou TDD) → PR com auto-merge → release → deploy local |

## Instalação

Copie cada pasta de skill para o diretório de skills de usuário do omp:

    ~/.agents/skills/<nome-da-skill>/

e reinicie a sessão (descoberta ocorre no startup).

## Requisitos

- `release-bootstrap`: gh CLI autenticado; repo no GitHub (público para rulesets no plano free).
- `ship`: repo já bootstrapped pela release-bootstrap; git; gh autenticado; Node >= 18. Integração TDD opcional via `skill://tdd-orchestrator`.
