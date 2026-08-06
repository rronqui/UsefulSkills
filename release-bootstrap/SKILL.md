---
name: release-bootstrap
description: Estabelecer fluxo completo de versionamento e release em um repositório Git — auditoria de segredos antes de publicar, branch protection via rulesets, CI (GitHub Actions), SemVer automático com release-please, hooks locais (commitlint + pre-push), auto-merge de PRs e versão visível na aplicação. Gera o manifesto ship.config.json consumido pela skill companheira ship. Use quando o usuário pedir para estabelecer versionamento, disciplinar releases, criar CI/release-please do zero, ou preparar um repo para ficar público.
---

# release-bootstrap — fluxo de releases completo para um repositório

Missão: transformar um repositório em projeto com disciplina de releases — mudanças só
entram via issue + branch + PR, CI obrigatório, versão SemVer automática com
release-please e versão visível na aplicação. Execute em fases, verificando o estado
real em cada uma. Não assuma nada — leia o código.

## Antes de tudo — reconhecimento do stack (obrigatório)

1. Linguagem/ecossistema e package manager (manifestos: package.json, pyproject.toml,
   Cargo.toml, go.mod, pom.xml/build.gradle, Gemfile, composer.json, pubspec.yaml…).
2. Comandos existentes: instalar deps, typecheck/lint, testes, build, start/serve.
3. Como a aplicação é consumida (UI web, CLI, API, daemon) e onde exibir a versão.
4. Git: remote, branch default, CI existente (`.github/`, `.gitlab-ci.yml`…), hooks existentes.

As fases seguintes usam ESSE levantamento, não suposições.

## FASE 0 — Auditoria de segurança (antes de publicar)

- Liste TODOS os arquivos rastreados (`git ls-files`) e varra o histórico inteiro por
  segredos: JWT (`eyJ…`), `sk-`, `ghp_`/`gho_`/`ghs_`, `AKIA`, `AIza`, `xox[bp]-`, PEM
  (`-----BEGIN`), base64 longo. Confirme que não há credencial hardcoded (mesmo como
  default) nem PII (nomes, documentos, e-mails) em código ou fixtures de teste.
- Confirme que segredos reais (`.env`…), banco de dados local, logs e artefatos de build
  estão no `.gitignore` e nunca foram commitados. Artefato rastreado por engano → remover
  do tracking + ignorar.
- Crie `.env.example` (ou equivalente do ecossistema) com apenas NOMES das variáveis.
- Repo público exige ainda: `LICENSE` (MIT se o usuário não especificar), nota de
  privacidade se o app lida com dados sensíveis, e README com instruções reais de setup.
- Commit, push e só então publique (ou avise o usuário para publicar).

## FASE 1 — Proteção server-side (GitHub; repo PÚBLICO no plano free)

- Ruleset via `gh api repos/{owner}/{repo}/rulesets` com regras `deletion`,
  `non_fast_forward`, `pull_request` (`required_approving_review_count: 0`) e
  `required_status_checks` exigindo o contexto que o CI produzirá (ex.: `quality`).
- ARMADILHA: `strict_required_status_checks_policy` (boolean) é campo OBRIGATÓRIO do
  schema de `required_status_checks`, senão HTTP 422 "data matches no possible input".
- ARMADILHA: habilite criação de PRs pelo Actions:
  `gh api repos/{owner}/{repo}/actions/permissions/workflow --method PUT
  --field default_workflow_permissions=write --field can_approve_pull_request_reviews=true`
  — o nome do campo é exatamente `can_approve_pull_request_reviews`; nomes errados são
  ignorados silenciosamente (confirme com um GET depois).
- Se o repo não puder ser público: rulesets não existem no plano free — o enforcement
  server-side fica indisponível; declare isso explicitamente e siga com hooks + CI.
- Auto-merge de PRs comuns: `gh api repos/{owner}/{repo} --method PATCH -F allow_auto_merge=true` (usar `-F`, que envia booleano real; `-f` enviaria a string `"true"`).
  A skill companheira `ship` usa `gh pr merge --auto --squash`; sem esta flag o comando
  falha e o PR fica aguardando merge manual. NÃO habilite auto-merge para o PR de
  release do release-please — o merge dele permanece manual (cadência de release é
  decisão humana).

## FASE 2 — CI

- GitHub Actions (ou o provedor do repo): todo PR e push na branch default, com
  `concurrency` cancelando runs obsoletos. Job nomeado para produzir o contexto `quality`
  (casando com o ruleset).
- Passos, com os comandos reais do projeto: instalar deps com cache → typecheck/lint (se
  existir) → testes → build (se aplicável). Se o projeto não tiver suíte de testes,
  registre explicitamente — não crie testes de fachada.
- Testes nunca podem exigir credenciais reais: use containers de serviço ou modo
  local/in-memory.

## FASE 3 — release-please

- `.github/workflows/release-please.yml`: push na default branch + `workflow_dispatch`,
  `googleapis/release-please-action@v4`, com `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`.
- `release-please-config.json` com `include-component-in-tag: false` e `release-type`
  pela tabela:
  | Stack | release-type |
  |---|---|
  | Node/JS/TS | `node` |
  | Python | `python` |
  | Rust | `rust` |
  | Go | `go` |
  | Maven | `maven` |
  | Ruby | `ruby` |
  | PHP | `php` |
  | Dart/Flutter | `dart` |
  | Terraform | `terraform-module` |
  | Outro | `simple` (version.txt + CHANGELOG) |
  Monorepo: um bloco em `packages` por pacote.
- ARMADILHA (primeiro release): `release-as: "X.Y.0"` exige `.release-please-manifest.json`
  `{".": "X.Y.0"}`, senão o run falha com "Missing required manifest versions". Após o
  primeiro release, REMOVA o `release-as` (senão todo release futuro sai na mesma versão).
- ARMADILHA CRÍTICA: PRs criados com `GITHUB_TOKEN` não disparam outros workflows — o CI
  nunca rodaria no PR de release. Crie o secret com um PAT:
  `gh secret set RELEASE_PLEASE_TOKEN --body "$(gh auth token)"`.
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
    linha por ref). Leia a stdin e rejeite se o local ref for `refs/heads/<default>`.
    NUNCA use variáveis de ambiente — o git não as define e o hook vira um no-op
    silencioso. Bypass documentado: `git push --no-verify`.
- TESTE REAL (não pule):
  - commit-msg: arquivo temporário de mensagem; entrada válida → exit 0, inválida → exit 1.
  - pre-push: `printf 'refs/heads/<default> 0 0 0\n' | <hook>` → exit 1; com outra
    branch → exit 0; stdin vazia → exit 0.
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

- README: política SemVer; fluxo issue → branch (`fix/#N`, `feat/#N`) →
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
    "buildCommand": "<comando de build ou null>",
    "stopCommand": "<comando de stop ou null>",
    "startCommand": "<comando de start com rebuild ou null>",
    "versionCheckUrl": "<URL para checar a versão servida ou null>"
  }
  ```
  Exemplo FinMonitor: dbPath `data/finmonitor.db`, buildCommand `npm run build`,
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
