---
name: ship
description: Operar o fluxo de releases de um repositório já disciplinado (pós release-bootstrap) — cria issue + branch, implementa (direto ou via tdd-orchestrator), abre PR com auto-merge, acompanha release e faz deploy local. Use quando o usuário pedir para implementar/entregar uma mudança, corrigir bug, gerar release ou atualizar o servidor de um projeto que segue o fluxo issue→branch→PR→release.
---

# ship — operação diária do fluxo de releases

Companheira da skill `release-bootstrap` (que instala o maquinário): esta skill OPERA o
fluxo. O motor determinístico é `bin/ship.mjs` (nesta skill); decisões de implementação
seguem o protocolo abaixo.

## Pré-requisitos

- Repo já bootstrapped (`skill://release-bootstrap`): ruleset/CI/release-please/hooks.
- `gh` autenticado, git, Node >= 18.
- `ship.config.json` na raiz do repo (crie com `bin/ship.mjs setup` e preencha).

## Manifesto — ship.config.json

| Campo | Significado |
|---|---|
| dbPath | Banco local para backup no deploy (null se não houver) |
| buildCommand | Build de produção (null = pular) |
| stopCommand | Para o servidor (null = pular) |
| startCommand | Inicia o servidor (o deploy já rebuildou via buildCommand — não usar flag de build aqui) |
| versionCheckUrl | URL para conferir a versão servida (null = pular); a checagem remove comentários HTML e procura `v(X.Y.Z)` a partir do texto âncora `Versão da aplicação` (se presente na página), senão a primeira ocorrência |

## Subcomandos do motor

Rode com `node <caminho desta skill>/bin/ship.mjs <subcomando>` a partir da raiz do repo.

| Comando | Efeito |
|---|---|
| `bin/ship.mjs new --bug "título"` / `--feat "título"` (`--desc` opcional) | Issue + branch `fix/#N-slug` / `feat/#N-slug` a partir da default atualizada |
| `bin/ship.mjs ship "descrição"` | Commit `<tipo>: descrição (#N)` (prefixo vem da branch), push, PR `Closes #N`, auto-merge squash |
| `bin/ship.mjs deploy` | Backup do dbPath → pull --ff-only → aviso se schema mudou → build → restart → confere versão servida |

## Protocolo de entrega (agente)

1. **Intake**: rode `new`. Se o usuário já forneceu issue/branch, pule.
2. **Roteamento da implementação**:
   - **Trivial** (docs, texto, config, cosmético sem mudança de comportamento):
     implemente diretamente.
   - **Comportamental** (lógica, comportamento de UI, API, dados): leia
     `skill://tdd-orchestrator` e execute o protocolo dela com estas respostas fixas:
     - Fase 0 passo 2 (branch): "use a branch existente `<branch>`; merge_target
       `<default>` — e o merge final será via PR, nunca local".
     - Fase 0 passo 10 (ok do plano): apresente ao usuário e aguarde.
     - Entrega final passo 5 (merge): responda SEMPRE "não — entregue via PR": rode
       `bin/ship.mjs ship "descrição"` em vez do merge local. O ruleset do repo bloqueia
       push direto; merge local na default é sempre errado neste fluxo.
3. **PR**: o corpo deve conter `Closes #N` e a evidência (saída do validator/review se
   houve TDD). O auto-merge é habilitado pelo motor; se indisponível, aguarde o CI e
   mergue manualmente.
4. **Release**: NÃO mergue automaticamente o PR de release do release-please. Quando o
   usuário quiser lançar: `gh pr merge <nº do PR de release> --squash` e aguarde a tag.
5. **Deploy**: rode `deploy` e confira a saída (backup, versão servida).

## Armadilhas

- Número de PR ≠ número de issue no GitHub (contagem compartilhada) — use a URL que os
  comandos retornam.
- Commitlint valida o commit: a descrição passada a `ship` não deve duplicar o prefixo
  Conventional nem quebrar o formato.
- pre-push bloqueia push direto na default by design; `deploy` exige estar na default.
- Estado do tdd-orchestrator (`.omp/`) fica fora do git (entrada no .gitignore).
