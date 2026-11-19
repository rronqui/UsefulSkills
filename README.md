# UsefulSkills

Coleção pessoal de skills para omp (agentes de coding).

Veja o [catálogo, regras e guia funcional](docs/functional.md) para entender o
comportamento atual, permissões, exceções, recuperação e histórico. A política de
qualidade tem uma fonte em
[tdd-orchestrator/references/quality-policy.md](tdd-orchestrator/references/quality-policy.md),
consumida pelos fluxos existentes, sem um segundo orquestrador.
A [matriz das 42 capacidades e 18 fontes](docs/capability-matrix.md) liga donos, implementação, verificações e aceites.
Os contratos dinâmicos e limites de verificação estão na
[compatibilidade OMP](docs/omp-compatibility.md).

| Skill | O que faz |
|---|---|
| `release-bootstrap` | Instala o fluxo completo de versionamento/release num repo (auditoria de segredos, rulesets, CI, release-please, hooks, auto-merge, versão na UI) |
| `ship` | Opera o fluxo no dia a dia: issue → branch → implementação (direta ou TDD) → gate de revisão (deep-review) com loop de correção → PR com auto-merge → release → deploy local. Alinhamento (alignment) obrigatório antes do roteamento. |
| `deep-review` | Revisão de código multi-agente: coleta o diff (PR, branch, working tree ou commit), filtra ruído, distribui arquivos entre revisores paralelos e consolida achados P0–P3 com veredito. Inclui o agente `deep-reviewer` (extraído do `/review` do omp). Usada como gate de revisão obrigatório da skill ship antes do merge |
| `tdd-orchestrator` | Orquestra uma lista de tarefas ponta a ponta via TDD com sub-agentes especializados (Red-Green-Refactor, peer review independente, validação com evidência, commits por tarefa, integração por ondas). Usado pelo ramo comportamental da skill ship com `delivery: external` |
| `alignment` | Entrevista de alinhamento em rodadas (árvore de decisões/fronteira) antes de implementar; etapa obrigatória do fluxo ship |
| `bug-diagnosis` | Disciplina de diagnóstico de bugs difíceis: feedback loop vermelho → minimizar → hipóteses → instrumentar → fix com teste de regressão |
| `architecture` | Analisa fronteiras, contratos, consumidores, compatibilidade e crítica independente proporcional; não coordena implementação. |
| `retro` | Faz triagem e análise após entrega revalidada, com dono único, opt-out e até três propostas; não implementa propostas automaticamente. |
| `secure-linux-web-hosting` | Opera acesso, firewall, Nginx/proxy e TLS em host Linux sob alvo e efeitos explicitamente autorizados. |
| `conflict-resolution` | Resolução de conflitos de merge/rebase hunk a hunk pela intenção, nunca --abort |

## Instalação

Instalador determinístico na raiz do projeto:

```bash
node install.mjs           # instala skills em ~/.omp/agent/skills/ e agentes em ~/.omp/agent/agents/
node install.mjs --check   # compara hashes; lista divergências; exit 1 se houver drift
```

O runtime suportado pelo produto é **Node.js >=20**. O instalador faz esse
preflight fail-fast antes de copiar qualquer arquivo.
Para desenvolver e executar a suíte com as dependências travadas, use
**Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`**, conforme `package.json` e
`package-lock.json`. Esse requisito do tooling é distinto do preflight dos
scripts standalone e da versão do OMP.
O preflight histórico de 2026-11-09 registrou Node externo 22.23.2 e CLI OMP
18.18.3; isso não confunde a versão do OMP com a versão do Node. A preparação
da release fixa a prova nativa em OMP **v18.18.6**. Nenhuma dessas declarações
substitui a prova de discovery, wire, modelos, isolamento e fluxos no runtime
alvo. Esta evolução não instala Node, SDK, serviço ou componentes do OS, nem
altera configurações globais.

O inventário de distribuição é explícito e mantém a paridade documental:

- 10 skills (`alignment`, `architecture`, `bug-diagnosis`, `conflict-resolution`,
  `deep-review`, `release-bootstrap`, `retro`, `secure-linux-web-hosting`, `ship`,
  `tdd-orchestrator`);
- 12 perfis (`requirements-reader`, `architect`, `host-operator`, `deep-reviewer`,
  `spec-kit-author`, `test-author`, `backend-developer`, `frontend-developer`,
  `refactorer`, `peer-reviewer`, `validator`, `integrator`);
- 42 capacidades e 18 fontes, conforme a [matriz de capacidades](docs/capability-matrix.md);
- `NOTICE`, distribuído em `~/.omp/agent/NOTICE`.

As contagens acima descrevem o catálogo fonte/empacotado, não discovery ou
compatibilidade OMP aprovada. Reinicie a sessão do omp (a descoberta ocorre no
startup). O instalador preserva extras alheios e detecta conflitos/drift.
Preflight, staging, backup e comparação de identidade/hash protegem a
transação; rollback só restaura bytes ainda pertencentes a ela. Seus diretórios
operacionais não ampliam o inventário de produto. `--check` é somente leitura.
A semântica e os limites estão no
[contrato ativo do instalador](specs/specs005-omp-compatible-release/contracts/interface-contract.md).


## Plano externo sem publicação

```bash
node ship/bin/ship.mjs plan --root . --target main
```

Valida o relatório de qualidade e o contexto independente atuais, inclusive fora
de Git. Retorna somente um plano JSON `PLANNED`, com passos `NOT_EXECUTED`;
não consulta Git/GitHub, não inicia subprocessos/rede e não escreve ou publica.
Parâmetros e limites estão nos [subcomandos Ship](ship/SKILL.md#subcomandos-do-motor).

## Requisitos e atribuição

### Arquivos de execução e empacotamento

`.workflow-runs/` guarda checkpoints, cópias de trabalho e provas da investigação;
`.test-temp/` guarda arquivos temporários de testes. Ambos permanecem no disco e
ficam excluídos de novas inclusões automáticas pelo Git e do pacote npm por
`.gitignore` e `.npmignore`. Arquivos já rastreados exigem tratamento separado.
As fontes, testes, referências, licenças e documentação do produto continuam no
pacote. A exclusão não integra regressões presentes apenas nas cópias de trabalho,
não libera a extensão Git no Windows e não conclui a avaliação OMP.

Para conferir somente o inventário de distribuição, use
`npm pack --dry-run --ignore-scripts --json`. `--ignore-scripts` impede o hook
`prepare` de executar o instalador de hooks; esse comando não instala o pacote.

### Requisitos por skill

- `release-bootstrap`: Git em um repositório ativo e gh CLI autenticado; repo no GitHub (público para rulesets no plano free).
- `deep-review`: git (e `gh` autenticado para revisão de PRs). Usa o agente `deep-reviewer` desta skill em `<repo>/.omp/agents/` ou `~/.omp/agent/agents/` (projeto vence usuário em colisão de nome).
- `ship` (`setup`, `new`, `ship`, `deploy`): repo já bootstrapped pela release-bootstrap; git; gh autenticado; Node >= 20. Requer também a skill `deep-review` + agente `deep-reviewer` instalados (gate) e as skills `alignment`, `bug-diagnosis`, `conflict-resolution` (alinhamento obrigatório, diagnóstico para correções de bug, resolução de conflitos no merge/PR). Mudanças comportamentais novas exigem TDD via `skill://tdd-orchestrator`; correções diagnosticadas por `bug-diagnosis` seguem seu loop de regressão. `plan` é a exceção readonly descrita acima.
- `alignment`, `bug-diagnosis`: sem requisitos externos obrigatórios. `requirements-reader` auxilia compreensão independente quando o gatilho exige.
- `architecture`: contexto do sistema; `architect` para análise atribuída e hook de planejamento TDD, preservando o autor canônico da especificação.
- `retro`: entrega revalidada e provas atuais, conforme seu protocolo; dono único é ship na entrega externa ou TDD standalone.
- `secure-linux-web-hosting`: host Linux, alvo e efeitos autorizados, acesso SSH e recuperação verificáveis; `host-operator` só na operação atribuída. Segurança de aplicação, dados, dependências e autenticação continua nos revisores/gates existentes, inclusive fora de Linux.
- `conflict-resolution`: Git e uma operação ativa de merge/rebase para resolver e continuar; fora de uma operação, apenas o diagnóstico pode ser registrado.
- `tdd-orchestrator`: nenhum binário externo obrigatório além de git/build do projeto; requer os 8 agentes de `tdd-orchestrator/agents/` disponíveis ao runtime em projeto (`./.omp/agents/`) ou usuário (`~/.omp/agent/agents/`) — projeto vence usuário (o orquestrador verifica e para se faltar algum).

### Atribuição e modelo dos agentes

- `alignment`, `bug-diagnosis` e `conflict-resolution` são adaptações (traduzidas e sem as dependências do ecossistema original) das skills de **Matt Pocock** (`grilling`, `diagnosing-bugs` e `resolving-merge-conflicts`) de github.com/mattpocock/skills (MIT). A atribuição/licença upstream completa está em [`NOTICE`](NOTICE); não remova esse arquivo ao redistribuir as adaptações.
- Os 12 perfis geridos usam principal/fallback `openai-codex` e `thinkingLevel` por papel; exigem autenticação válida nesse provedor. A [política de modelos](tdd-orchestrator/references/model-policy.md) aponta ao mapa canônico; o frontmatter selecionado é a configuração executável. Confira catálogo, discovery e precedência no runtime. Requested/resolved/observed são distintos: sem metadado efetivo, `actual:null`/`unverified`. O pacote não muda o Root, aliases globais ou auxiliares/builtins.
- As nove referências `tdd-orchestrator/references/react/*.md` são texto e exemplos autorais atuais, escritos a partir de fontes primárias React/Next/browser/Node e, quando aplicável, SWR. A árvore React histórica fixada em `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` declarava MIT no metadata. A evidência primária registra árvore completa (`truncated:false`), inventário sem nomes `LICENSE`/`NOTICE`/`COPYING` e três blobs consultados (`README.md`, `SKILL.md`, `metadata.json`) sem aviso copyright fornecido; isso delimita a observação e não infere ausência legal em conteúdo não consultado. O artefato adaptado/auxiliar de licença foi excluído no cutover das nove refs autorais. R-02 tem `PASS (ESTÁTICA)` na revisão independente da autoria atual; não é certificação jurídica nem prova de instalação, discovery ou runtime. Não é atribuído copyright ou licença jurídica por inferência.
- Proveniência e licenças das adaptações seletivas estão nos `SOURCE.md` dos donos, reunidos na [matriz de capacidades](docs/capability-matrix.md). Preserve `NOTICE` e licenças distribuídas de outros assets.

## Política de releases e integração

- **Fluxo de mudança Git:** issue → branch (`fix/N-slug` / `feat/N-slug`) → implementação → gate de revisão (skill `deep-review`) → PR (`Closes #N`) → merge. A entrega local sem Git segue [roteamento e persistência](alignment/references/routing-and-persistence.md), sem inicialização ou PR implícitos.
- **Branch default dinâmica:** o nome é sempre descoberto a partir do repositório (por exemplo, via `github.event.repository.default_branch` ou `gh api`); não há nome fixo. A proteção server-side, quando disponível, cobre somente a branch descoberta.
- **Integração no `ship`:** `alignment` conduz o alinhamento antes do roteamento de implementação/correção; mudanças comportamentais seguem `tdd-orchestrator` (RED → GREEN → Refactor, revisão independente e validação); correções seguem `bug-diagnosis` (feedback loop vermelho, minimização, hipótese, instrumentação e teste de regressão); conflitos de merge/rebase seguem `conflict-resolution` hunk a hunk e não são resolvidos com `--abort`.
- **Gate de revisão:** o `deep-review` obrigatório revisa commits contra a branch default descoberta, nunca apenas a working tree, e tem no máximo 2 rodadas de triagem/correção/revisão. Achados P0/P1 válidos bloqueiam até decisão/correção; P2/P3 são não bloqueantes e entram na evidência do PR. Sem commits além da base, nada é revisado.
- **Versionamento:** commits seguem Conventional Commits (validados pelo hook `commit-msg`); o bump SemVer estrito é automático pelo release-please: `fix:` → patch, `feat:` → minor, `!`/`BREAKING CHANGE:` → major. Ninguém edita versão manualmente.
- **Release-please:** roda via `.github/workflows/release-please.yml` na branch default descoberta, usando somente o secret `RELEASE_PLEASE_TOKEN` (PAT). PRs criados com o `GITHUB_TOKEN` padrão não disparam o CI no PR de release. O PR de release-please é mergeado manualmente quando houver decisão de lançar; não habilite auto-merge nele.
- **Corpo do PR:** retry preserva texto já publicado, mantém exactly one `Closes #N` e não duplica marker; `!` e `BREAKING CHANGE:` não são removidos.
- **Push:** o hook `pre-push` bloqueia push direto na branch default e respeita `core.hooksPath`, portanto a instalação não presume `.git/hooks`. O único bypass local documentado é `git push --no-verify`: ele ignora o hook, mas não remove rulesets, CI, revisão ou exigências do servidor.

### Gates, hooks, versionamento e segurança

- TDD comportamental é obrigatório para lógica, comportamento de UI, API e dados: escreva o teste RED antes da implementação GREEN e só promova após revisão independente e suíte verde.
- Toda mudança é classificada desde uma baseline verificável; mudanças
  funcionais vinculam critérios, testes e documentação durável atualizada. O gate
  de qualidade valida planejamento e entrega no conteúdo atual; documentação e
  segurança também recebem revisão semântica independente. Ferramenta ausente
  não dispensa verificação obrigatória; P0/P1 válidos abertos bloqueiam liberação.
- A compatibilidade OMP preserva os protocolos `task`/`yield`, agentes e resolução
  projeto/usuário. Verifique slots, ferramentas, modelo observado e isolamento
  real antes de delegar; configurações declaradas não comprovam execução.
- O gate HITL usa Bash e AWK quando disponíveis para redaction antes da persistência; em plataformas sem Bash, registre o bloqueio/skip com motivo e execute o cenário no CI. Segredos nunca são impressos.
- O secret `RELEASE_PLEASE_TOKEN` deve ser configurado por stdin (por exemplo, `gh secret set RELEASE_PLEASE_TOKEN`), nunca em argumentos, arquivos rastreados ou logs; limpe variáveis temporárias mesmo em caso de erro. Este README documenta apenas o nome do secret, nunca seu valor.
- `versionCheckUrl` é configurado para a unidade raiz em projeto single-package; em monorepo/multi-package, use `versionCheckUnit` e uma URL por unidade quando a aplicação expõe versões separadas, ou deixe-o `null` quando não houver endpoint por unidade.
- Releases usam SemVer estrito (`MAJOR.MINOR.PATCH`, sem zeros à esquerda), com sufixos opcionais de prerelease (`-rc.1`) e build metadata (`+build.7`). A configuração single-package usa tag simples; cada unidade de um monorepo usa tag qualificada e manifesto próprio.

### Desenvolvimento local

```bash
npm install   # instala dependências e os git hooks (prepare)
npm test      # suíte de testes
```

## Estado da evolução local

A seleção protegida de **Git for Windows 2.54.0.windows.1 x64** está implementada
e recebeu revisão independente escopada no checkout; isso não instala os hooks
nem aprova a entrega inteira. O executável originalmente selecionado deve ser
exatamente `cmd/git.exe` ou `mingw64/bin/git.exe`; ambos os objetos, assinaturas,
hashes, linksets, ACLs, ancestrais e dependências exigem admissão vigente.
`cmd/git-lfs.exe` não é alias executável admitido.
O [contrato ativo Windows](specs/specs005-omp-compatible-release/contracts/interface-contract.md)
preserva a fronteira OS aprovada sem transferir confiança ao Git por herança.
Uma recusa `E_UNSAFE_GIT_EXECUTABLE` interrompe a seleção; não há tentativa
automática com outra cópia de Git, PATH ou shell. Veja o
[guia de bloqueio e recuperação](docs/functional.md#seleção-git-windows-e-bloqueio).

O inventário fonte contém exatamente dez skills e doze perfis; a evidência de
CLI em HOME isolado é histórica e não comprova discovery, modelos ou execução
OMP instalada. As provas NATIVE-01–10, AC-012/014, fechamento final AC-016 e
triagem desta demanda AC-009 continuam pendentes, assim como a revisão final de
segurança. Consulte o [roteiro de avaliação instalada](docs/omp-compatibility.md).
Não há declaração de 100% de compatibilidade antes da prova nativa; a origem
histórica e as falhas permanecem registradas.
