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

O runtime suportado é **Node.js >=20**. O instalador faz esse preflight fail-fast
antes de copiar qualquer arquivo.

O inventário instalado é explícito:

- 7 skills (`alignment`, `bug-diagnosis`, `conflict-resolution`, `deep-review`,
  `release-bootstrap`, `ship`, `tdd-orchestrator`);
- 9 agentes (8 do `tdd-orchestrator` + `deep-reviewer` do `deep-review`).
- `NOTICE`, distribuído em `~/.omp/agent/NOTICE`.

Reinicie a sessão do omp (a descoberta ocorre no startup). O instalador nunca toca
arquivo fora desse inventário.

## Requisitos e atribuição

### Requisitos por skill

- `release-bootstrap`: Git em um repositório ativo e gh CLI autenticado; repo no GitHub (público para rulesets no plano free).
- `deep-review`: git (e `gh` autenticado para revisão de PRs). Usa o agente `deep-reviewer` desta skill em `<repo>/.omp/agents/` ou `~/.omp/agent/agents/` (projeto vence usuário em colisão de nome).
- `ship`: repo já bootstrapped pela release-bootstrap; git; gh autenticado; Node >= 20. Requer também a skill `deep-review` + agente `deep-reviewer` instalados (gate) e as skills `alignment`, `bug-diagnosis`, `conflict-resolution` (alinhamento obrigatório, diagnóstico para correções de bug, resolução de conflitos no merge/PR). Mudanças comportamentais novas exigem TDD via `skill://tdd-orchestrator`; correções diagnosticadas por `bug-diagnosis` seguem seu loop de regressão.
- `alignment`, `bug-diagnosis`: sem requisitos externos obrigatórios.
- `conflict-resolution`: Git e uma operação ativa de merge/rebase para resolver e continuar; fora de uma operação, apenas o diagnóstico pode ser registrado.
- `tdd-orchestrator`: nenhum binário externo obrigatório além de git/build do projeto; requer os 8 agentes de `tdd-orchestrator/agents/` disponíveis ao runtime em projeto (`./.omp/agents/`) ou usuário (`~/.omp/agent/agents/`) — projeto vence usuário (o orquestrador verifica e para se faltar algum).

### Atribuição e modelo dos agentes

- `alignment`, `bug-diagnosis` e `conflict-resolution` são adaptações (traduzidas e sem as dependências do ecossistema original) das skills de **Matt Pocock** (`grilling`, `diagnosing-bugs` e `resolving-merge-conflicts`) de github.com/mattpocock/skills (MIT). A atribuição/licença upstream completa está em [`NOTICE`](NOTICE); não remova esse arquivo ao redistribuir as adaptações.
- Os 9 agentes têm o modelo fixado em `openai-codex/gpt-5.6-luna, @slow` — primário com fallback para o role `@slow` (remapável sem editar arquivos). Override global sem tocar nos agentes: `task.agentModelOverrides` no config do omp.

## Política de releases e integração

- **Fluxo de mudança:** mudanças entram somente via issue → branch (`fix/N-slug` / `feat/N-slug`) → implementação → gate de revisão (skill `deep-review`) → PR (`Closes #N`) → merge.
- **Branch default dinâmica:** o nome é sempre descoberto a partir do repositório (por exemplo, via `github.event.repository.default_branch` ou `gh api`); não há nome fixo. A proteção server-side, quando disponível, cobre somente a branch descoberta.
- **Integração no `ship`:** `alignment` conduz o alinhamento antes do roteamento de implementação/correção; mudanças comportamentais seguem `tdd-orchestrator` (RED → GREEN → Refactor, revisão independente e validação); correções seguem `bug-diagnosis` (feedback loop vermelho, minimização, hipótese, instrumentação e teste de regressão); conflitos de merge/rebase seguem `conflict-resolution` hunk a hunk e não são resolvidos com `--abort`.
- **Gate de revisão:** o `deep-review` obrigatório revisa commits contra a branch default descoberta, nunca apenas a working tree, e tem no máximo 2 rodadas de triagem/correção/revisão. Achados P0/P1 válidos bloqueiam até decisão/correção; P2/P3 são não bloqueantes e entram na evidência do PR. Sem commits além da base, nada é revisado.
- **Versionamento:** commits seguem Conventional Commits (validados pelo hook `commit-msg`); o bump SemVer estrito é automático pelo release-please: `fix:` → patch, `feat:` → minor, `!`/`BREAKING CHANGE:` → major. Ninguém edita versão manualmente.
- **Release-please:** roda via `.github/workflows/release-please.yml` na branch default descoberta, usando somente o secret `RELEASE_PLEASE_TOKEN` (PAT). PRs criados com o `GITHUB_TOKEN` padrão não disparam o CI no PR de release. O PR de release-please é mergeado manualmente quando houver decisão de lançar; não habilite auto-merge nele.
- **Corpo do PR:** retry preserva texto já publicado, mantém exactly one `Closes #N` e não duplica marker; `!` e `BREAKING CHANGE:` não são removidos.
- **Push:** o hook `pre-push` bloqueia push direto na branch default e respeita `core.hooksPath`, portanto a instalação não presume `.git/hooks`. O único bypass local documentado é `git push --no-verify`: ele ignora o hook, mas não remove rulesets, CI, revisão ou exigências do servidor.

### Gates, hooks, versionamento e segurança

- TDD comportamental é obrigatório para lógica, comportamento de UI, API e dados: escreva o teste RED antes da implementação GREEN e só promova após revisão independente e suíte verde.
- O gate HITL usa Bash e AWK quando disponíveis para redaction antes da persistência; em plataformas sem Bash, registre o bloqueio/skip com motivo e execute o cenário no CI. Segredos nunca são impressos.
- O secret `RELEASE_PLEASE_TOKEN` deve ser configurado por stdin (por exemplo, `gh secret set RELEASE_PLEASE_TOKEN`), nunca em argumentos, arquivos rastreados ou logs; limpe variáveis temporárias mesmo em caso de erro. Este README documenta apenas o nome do secret, nunca seu valor.
- `versionCheckUrl` é configurado para a unidade raiz em projeto single-package; em monorepo/multi-package, use `versionCheckUnit` e uma URL por unidade quando a aplicação expõe versões separadas, ou deixe-o `null` quando não houver endpoint por unidade.
- Releases usam SemVer estrito (`MAJOR.MINOR.PATCH`, sem zeros à esquerda), com sufixos opcionais de prerelease (`-rc.1`) e build metadata (`+build.7`). A configuração single-package usa tag simples; cada unidade de um monorepo usa tag qualificada e manifesto próprio.

### Desenvolvimento local

```bash
npm install   # instala dependências e os git hooks (prepare)
npm test      # suíte de testes
```
