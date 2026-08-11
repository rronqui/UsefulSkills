---
name: release-bootstrap
description: Estabelecer fluxo completo de versionamento e release em um repositório Git — auditoria de segredos antes de publicar, branch protection via rulesets, CI (GitHub Actions), SemVer automático com release-please, hooks locais (commitlint + pre-push), auto-merge de PRs e versão visível na aplicação. Gera o manifesto ship.config.json consumido pela skill companheira ship. Use quando o usuário pedir para estabelecer versionamento, disciplinar releases, criar CI/release-please do zero, ou preparar um repo para ficar público.
---

# release-bootstrap — fluxo de releases completo para um repositório

Missão: transformar um repositório em projeto com disciplina de releases — mudanças só
entram via issue + branch + PR, CI obrigatório, versão SemVer automática com
release-please e versão visível na aplicação. Execute em fases, verificando o estado
real em cada uma. Não assuma nada — leia o código.

O runtime suportado é Node.js `>=20`. O inventário completo que deve permanecer
coerente com essa exigência inclui `package.json`, `README.md`, `install.mjs`,
`scripts/install-hooks.mjs`, `ship/bin/lib.mjs`, `ship/bin/ship.mjs`,
`.github/workflows/ci.yml`, `.github/workflows/release-please.yml`,
`release-bootstrap/SKILL.md`, `ship/SKILL.md`, `tdd-orchestrator/SKILL.md` e
`bug-diagnosis/SKILL.md`.

Todos os artefatos desse inventário devem declarar Node.js `>=20`; qualquer
divergência bloqueia o bootstrap e o release.

## Antes de tudo — reconhecimento do stack (obrigatório)

1. Linguagem/ecossistema e package manager (manifestos: package.json, pyproject.toml,
   Cargo.toml, go.mod, pom.xml/build.gradle, Gemfile, composer.json, pubspec.yaml…).
2. Comandos existentes: instalar deps, typecheck/lint, testes, build, start/serve.
3. Como a aplicação é consumida (UI web, CLI, API, daemon) e onde exibir a versão.
4. Git: remote, branch default, CI existente (`.github/`, `.gitlab-ci.yml`…), hooks existentes.

As fases seguintes usam ESSE levantamento, não suposições.

## FASE 0 — Auditoria de segurança (antes de publicar)

- Liste TODOS os arquivos rastreados (`git ls-files`) e varra o histórico inteiro por
  segredos: JWT (`eyJ…`), `sk-`, `ghp_`/`gho_`/`ghs_`/`ghr_`/`github_pat_`, `AKIA`,
  `AIza`, `xox[bp]-`, PEM (`-----BEGIN`) e base64 longo. Confirme que não há
  credencial hardcoded (mesmo como default) nem PII (nomes, documentos, e-mails) em
  código ou fixtures de teste.
- A auditoria não imprime valores encontrados: redija cada ocorrência como
  `<REDACTED>` e registre somente o tipo/arquivo/commit. Token encontrado bloqueia a
  publicação (histórico e arquivos rastreados); não prossiga para release.
- Confirme que segredos reais (`.env`…), banco de dados local, logs e artefatos de build
  estão no `.gitignore` e nunca foram commitados. Artefato rastreado por engano → remover
  do tracking + ignorar.
- Crie `.env.example` (ou equivalente do ecossistema) com apenas NOMES das variáveis.
- Repo público exige ainda: `LICENSE` (MIT se o usuário não especificar), nota de
  privacidade se o app lida com dados sensíveis, e README com instruções reais de setup.
- Para instalar o secret sem expor o valor, use stdin (`gh secret set RELEASE_PLEASE_TOKEN`),
  limpe a variável mesmo em erro (`unset token` ou `$token = $null`) e nunca passe o token
  em argumentos/logs.
- Commit, push e só então publique (ou avise o usuário para publicar).

## FASE 1 — Proteção server-side (GitHub; repo PÚBLICO no plano free)

- O ruleset deve declarar `target: branch`, `enforcement: active` e proteger somente a branch default descoberta.
- Descubra a branch default antes de criar o ruleset (`default_branch=$(gh api repos/{owner}/{repo} -q .default_branch)`) e use `conditions.ref_name.include: ["refs/heads/${default_branch}"]`; esse refspec é o escopo da branch default, não tags nem outras branches. Se a ferramenta não puder resolver a branch, falhe fechado.
- Inclua regras `deletion`, `non_fast_forward`, `pull_request`
  (`required_approving_review_count: 0`) e `required_status_checks` exigindo o
  contexto que o CI produzirá (`context: quality`).
- O campo `strict_required_status_checks_policy: true` (booleano estrito) é
  obrigatório no schema de `required_status_checks`, senão HTTP 422 "data matches
  no possible input".
- Depois de criar, faça GET de `repos/{owner}/{repo}/rulesets/{id}` e valide
  `target`, `enforcement`, include/exclude de refs, regras e o status `quality`; sem
  resposta compatível, falhe fechado. Não invente uma chamada live em testes.

Os tipos e contagens do ruleset são literais e verificáveis: mantenha a política de
aprovação em zero e o status obrigatório estrito como booleano, com exatamente um
contexto de quality produzido pelo job correspondente. Não acrescente contextos de
teste ou permissões implícitas ao ruleset.
- ARMADILHA: habilite criação de PRs pelo Actions:
  `gh api repos/{owner}/{repo}/actions/permissions/workflow --method PUT
  --field default_workflow_permissions=write --field can_approve_pull_request_reviews=true`
  — o nome do campo é exatamente `can_approve_pull_request_reviews`; nomes errados são
  ignorados silenciosamente (confirme com um GET depois).
- Se o repo for privado ou o plano não oferecer rulesets, registre a limitação:
  o enforcement server-side fica indisponível; declare isso explicitamente e siga com
  hooks + CI. Não anuncie proteção que o servidor não aplica.
- Auto-merge de PRs comuns: `gh api repos/{owner}/{repo} --method PATCH -F allow_auto_merge=true` (usar `-F`, que envia booleano real; `-f` enviaria a string `"true"`).
  A skill companheira `ship` usa `gh pr merge --auto --squash`; sem esta flag o comando
  falha e o PR fica aguardando merge manual. NÃO habilite auto-merge para o PR de
  release do release-please — o merge dele permanece manual (cadência de release é
  decisão humana).

## FASE 2 — CI

- GitHub Actions (ou o provedor do repo): todo PR e push na branch default, com
  `concurrency` cancelando runs obsoletos. Job nomeado para produzir o contexto `quality`
  (casando com o ruleset). O guard do job aceita todo `pull_request`, mas em `push`
  exige `ref_type == "branch"` e `ref_name == event.repository.default_branch`;
  não use `branches-ignore` que possa excluir a default.
- Passos, com os comandos reais do projeto: instalar deps com cache → typecheck/lint (se
  existir) → testes → build (se aplicável). Se o projeto não tiver suíte de testes,
  registre explicitamente — não crie testes de fachada.
- Testes nunca podem exigir credenciais reais: use containers de serviço ou modo
  local/in-memory.

## FASE 3 — release-please

- `.github/workflows/release-please.yml`: push na default branch + `workflow_dispatch`,
  `googleapis/release-please-action@v4`, com `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`.
  O job exige `ref_type == "branch"` e `ref_name == event.repository.default_branch`,
  portanto uma tag com o mesmo nome da branch default é rejeitada.
- `.release-please-manifest.json` com uma entrada para cada unidade. Na configuração
  single-package atual, `include-component-in-tag: false` mantém a tag simples;
  em qualquer monorepo/multi-package, cada entrada deve usar
  `include-component-in-tag: true` para preservar tags qualificadas por componente,
  sem colapsar versões na raiz.
- `release-type: node` e `initial-version` devem usar SemVer estrito
  (`MAJOR.MINOR.PATCH`, sem zeros à esquerda; prerelease/build são permitidos).
  Cada package deve manter identidade qualificada no release/tag, ter seu próprio
  manifesto e uma fonte SemVer que o `ship` consiga resolver.
- A configuração é fail-fast: se qualquer unidade de `packages` não for Node ou não
  tiver `package.json`/fonte SemVer resolvível pelo `ship`, interrompa com
  `E_VERSION_SOURCE`; uma unidade não-Node ou um monorepo sem fonte válida falha
  cedo; nunca compare somente a versão da raiz. Quando `versionCheckUrl` estiver
  configurado, `versionCheckUnit` identifica explicitamente a unidade servida
  (default `"."`); em multi-package, a URL pode representar uma unidade específica,
  e sua unidade deve ser resolvível. Se não houver endpoint por unidade, mantenha a
  URL `null`, sem desabilitar a validação das fontes SemVer de todas as unidades.
- O manifesto `.release-please-manifest.json` deve conter exatamente as mesmas chaves
  de `packages` e uma versão inicial SemVer igual à versão do `package.json` de cada
  unidade. Não use `release-as` persistente: após inicializar o primeiro release,
  remova-o para que releases futuros avancem normalmente.
- ARMADILHA CRÍTICA: PRs criados com `GITHUB_TOKEN` não disparam outros workflows — o CI
  nunca rodaria no PR de release. Crie o secret com um PAT sem expô-lo nos argumentos.
  Em shell POSIX/Git Bash, valide a saída e remova o terminador antes de enviar por
  stdin, limpando o token mesmo em falha:
  `status=1; token="$(gh auth token)" && [ -n "$token" ] && { if printf %s "$token" | gh secret set RELEASE_PLEASE_TOKEN; then status=0; else status=$?; fi; }; unset token; [ "$status" -eq 0 ]`.
  No PowerShell, adquira o token dentro do `try`, escreva-o sem newline no stdin do processo e remova-o no `finally`:
`$token = $null; $p = $null; try { $token = gh auth token; if ($LASTEXITCODE -ne 0) { throw "gh auth token falhou" }; $token = $token.Trim(); if ([string]::IsNullOrWhiteSpace($token)) { throw "gh auth token vazio" }; $psi = [Diagnostics.ProcessStartInfo]::new("gh", "secret set RELEASE_PLEASE_TOKEN"); $psi.RedirectStandardInput = $true; $psi.UseShellExecute = $false; $p = [Diagnostics.Process]::Start($psi); $p.StandardInput.Write($token); $p.StandardInput.Close(); $p.WaitForExit(); if ($p.ExitCode -ne 0) { throw "gh secret set falhou" } } finally { $token = $null; try { if ($null -ne $p -and !$p.HasExited) { $p.Kill(); $p.WaitForExit() } } catch { } }`.
- Em retry, preserve o corpo já publicado e mantenha exactly one `Closes #N`; não duplique
  marker nem `Closes`; os markers `!` e `BREAKING CHANGE:` continuam indicando major.
- Política: Conventional Commits dirigem o bump (`fix:` → patch, `feat:` → minor,
  `!`/`BREAKING CHANGE:` → major). Ninguém edita o campo de versão manualmente.

## FASE 4 — Validação local (hooks)

- commitlint (ecossistema JS): `@commitlint/cli` + `@commitlint/config-conventional` em
  `.commitlintrc.json` (ARMADILHA: `commitlint.config.json` não é carregado por várias
  versões — erro "empty-rules"). Fora de JS: script curto com regex de Conventional
  Commits na linguagem do projeto.
- Dois hooks instalados automaticamente (npm `prepare`, Makefile, script de setup):
  - `commit-msg`: valida o título (isenta Merge/Revert/fixup!/squash!).
  - `pre-push`: bloqueia push direto na branch default. PROTOCOLO CORRETO: o git passa as
    refs pela STDIN, formato `<local ref> <local sha> <remote ref> <remote sha>` (uma
    linha por ref). Leia a stdin e rejeite se o local **ou** o remote ref for
    `refs/heads/<default>`. NUNCA use variáveis de ambiente — o git não as define e o hook
    vira um no-op silencioso. Bypass documentado: `git push --no-verify`.
- TESTE REAL (não pule):
  - commit-msg: arquivo temporário de mensagem; entrada válida → exit 0, inválida → exit 1.
  - pre-push: `printf 'refs/heads/<default> 0 0 0\n' | <hook>` → exit 1; local feature + remote default → exit 1; local default + remote feature → exit 1; local e remote não-default → exit 0; stdin vazia → exit 0.
- Adicione `.omp/` ao `.gitignore` (estado do tdd-orchestrator, se usado no projeto).

## FASE 5 — Versão visível na aplicação

- Fonte única: campo de versão do manifesto. Injeção em BUILD, mecanismo nativo:
  | Stack | Mecanismo típico |
  |---|---|
  | Next.js | `env.NEXT_PUBLIC_*` no next.config lendo o package.json |
  | Vite/CRA | define/env via config lendo o package.json |
  | Python | `importlib.metadata` ou `__version__` |
  | Rust | `env!("CARGO_PKG_VERSION")` |
  | Go | `-ldflags "-X main.version=…"` |
  | CLI | flag `--version` |
  | API sem UI | endpoint `/health` ou `/version` |
- Exibição discreta e padrão (rodapé de sidebar, `--version`, endpoint). VERIFIQUE NO
  ARTEFATO FINAL (HTML servido, saída do CLI, resposta do endpoint), não só no código.
- Banco de dados local fora do git → documente backup antes de releases com mudança de
  dados; migrações forward-only.

## FASE 6 — Documentação e dogfood

- README: política SemVer; fluxo issue → branch (`fix/N`, `feat/N`) →
  implementação → revisão (skill `deep-review`, gate obrigatório antes do PR) → PR
  (`Closes #N`) → merge; Conventional Commits; papel do release-please; o secret
  `RELEASE_PLEASE_TOKEN` e por que existe; como atualizar a instalação local após release.
- Templates de issue (bug, feature) e template de PR exigindo issue vinculada.
- DOGFOOD: implemente as Fases 2–5 via o próprio fluxo (branch `feat/…`, PR, CI verde,
  squash merge). Correções de curso passam pelo mesmo fluxo.
- Gere `ship.config.json` na raiz (manifesto da skill `ship`):
  ```json
  {
    "dbPath": "<caminho do banco local ou null>",
    "backupDir": "<diretório do backup ou omitir — default: <dirname(dbPath)>/backup>",
    "schemaWatchPaths": ["<caminho(s) de schema/migração>; omitir → default legado [\"src/lib/db.ts\"]; [] desliga o aviso"],
    "buildCommand": "<comando de build ou null>",
    "stopCommand": "<comando de stop ou null>",
    "startCommand": "<comando de start ou null>",
    "versionCheckUrl": "<URL para checar a versão servida ou null>"
  }
  ```
  Exemplo FinMonitor: dbPath `data/finmonitor.db`, schemaWatchPaths `["src/lib/db.ts"]`,
  buildCommand `npm run build`,
  stopCommand `npm run stop:server`, startCommand `npm run start:server` (SEM `--force-build` — o buildCommand do deploy já rebuilda; `--force-build` causaria build duplo),
  versionCheckUrl `http://localhost:3000`.

## Regras gerais e armadilhas de operação

- Commits seus seguem Conventional Commits desde o primeiro.
- Depois que o ruleset existir, toda mudança vai por PR — inclusive correções do pipeline.
- PRs e issues COMPARTILHAM a numeração no GitHub: use a URL retornada por `gh pr create`
  para checar/mergear (`gh pr checks <PR>`, não o número da issue).
- Run falhou? `gh run view <id> --log-failed` e corrija pela causa — as mensagens dizem
  exatamente o que falta.
- Ao final responda com: arquivos criados, evidências por fase (runs verdes, tag criada,
  versão visível), e limitações inerentes (hooks contornáveis com `--no-verify`; deploy na
  máquina do dono fora do alcance do CI hospedado; enforcement server-side inexistente em
  repo privado no plano free).
- Skill companheira: `ship` opera o fluxo no dia a dia (issue → branch → gate de
  revisão → PR com auto-merge → release → deploy local); instale-a junto e deixe o
  `ship.config.json` preenchido. A skill `ship` requer também a skill `deep-review`
  e o agente `deep-reviewer.md` instalados (gate de revisão obrigatório antes do PR)
  e as skills `alignment`, `bug-diagnosis`, `conflict-resolution` (alinhamento
  obrigatório antes do roteamento, diagnóstico para correções de bug e resolução de
  conflitos no merge/PR).
