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
- Skill `deep-review` (`skill://deep-review`) e o agente `deep-reviewer.md`
  instalados (`<repo>/.omp/agents/` ou `~/.omp/agent/agents/`).
- Skills alignment, bug-diagnosis e conflict-resolution instaladas.

## Manifesto — ship.config.json

| Campo | Significado |
|---|---|
| dbPath | Banco local para backup no deploy (null se não houver) |
| buildCommand | Build de produção (null = pular) |
| stopCommand | Para o servidor (null = pular) |
| startCommand | Inicia o servidor (o deploy já rebuildou via buildCommand — não usar flag de build aqui); DEVE retornar (wrapper/daemonizador como pm2/npm script) — um servidor foreground bloqueia o deploy |
| versionCheckUrl | URL para conferir a versão servida (null = pular); a checagem remove comentários HTML, procura `v(X.Y.Z)` a partir do texto âncora `Versão da aplicação` (se presente na página) senão a primeira ocorrência, e compara com a `version` do `package.json` na raiz (ausente/inválido → aviso e checagem pulada) |

## Subcomandos do motor

Rode com `node <caminho desta skill>/bin/ship.mjs <subcomando>` a partir da raiz do repo.

| Comando | Efeito |
|---|---|
| `bin/ship.mjs new --bug "título"` / `--feat "título"` (`--desc` opcional) | Issue + branch `fix/#N-slug` / `feat/#N-slug` a partir da default atualizada |
| `bin/ship.mjs ship "descrição"` | Commit `<tipo>: descrição (#N)` (prefixo vem da branch), push, PR `Closes #N`, auto-merge squash; `--body-file <arquivo>` anexa o conteúdo do arquivo ao corpo do PR |
| `bin/ship.mjs deploy` | Exige `ship.config.json` e estar na branch default; backup do dbPath (arquivo ausente → aviso e pula) → pull --ff-only → aviso se schema mudou → build → restart → confere versão servida |

## Protocolo de entrega (agente)

1. **Intake**: rode `new`. Se o usuário já forneceu issue/branch, pule.
2. **Alinhamento (obrigatório para pedidos de implementação ou correção)**: leia
   `skill://alignment` e conduza a entrevista de alinhamento sobre o pedido:
   mudança trivial → rodada rápida (até 3 perguntas); comportamental → até a
   fronteira esvaziar; pedido totalmente especificado → declare o fechamento
   rápido com o motivo (nunca pule em silêncio). Pedidos que NÃO são
   implementação/correção (merge de release, deploy, revisão isolada) pulam este
   passo. O resultado do alinhamento dirige o roteamento do passo 3.
3. **Roteamento da implementação**:
   - **Trivial** (docs, texto, config, cosmético sem mudança de comportamento):
     implemente diretamente.
   - **Comportamental** (lógica, comportamento de UI, API, dados): leia
     `skill://tdd-orchestrator` e execute o protocolo dela com estas respostas fixas:
     - Fase 0 passo 2 (branch): "use a branch existente `<branch>`; merge_target
       `<default>` — delivery: external; a entrega final será via PR pelo fluxo
       ship, nunca merge local".
     - Fase 0 passo 10 (ok do plano): apresente ao usuário e aguarde.
     - Entrega final passo 5: com `delivery: external` registrado, o passo encerra
       sozinho (`merge_status: SKIPPED`, sem pergunta). Prossiga para o gate de
       revisão (passo 4) e rode `bin/ship.mjs ship "descrição"` para publicar via PR.
       O ruleset do repo bloqueia push direto; merge local na default é sempre
       errado neste fluxo.
   - **Correção de bug** (branch `fix/#N` ou usuário reporta algo
     quebrado/falhando/lento): leia `skill://bug-diagnosis` e execute-a como a
     própria disciplina de implementação — o loop completo até a Fase 6 (feedback
     loop vermelho → minimizar → hipotetizar → instrumentar → fix com teste de
     regressão → limpeza/registro). Ela SUBSTITUI o roteamento trivial/comportamental
     para correções de bug: NÃO re-rota o fix; após a Fase 6 prossiga direto para o
     gate de revisão (passo 4).
4. **Gate de revisão (obrigatório)**: o gate revisa COMMITS, nunca working tree.
   Antes de qualquer deep-review: se o working tree tem mudanças não commitadas,
   commite a implementação com `git add -A` e mensagem `<tipo>: implementação (#N)`
   — o `<tipo>` vem do prefixo da branch (`fix` → `fix`, `feat` → `feat`), sem
   duplicar prefixo (commitlint); no caminho TDD a árvore já chega limpa e este
   commit não acontece. Depois verifique `git rev-list --count <default>..HEAD`
   com `git status --short` vazio: zero → nada para revisar; informe o usuário e
   PARE (não dispare revisores sem material). Se após o commit ainda sobrarem
   mudanças não commitadas (arquivos regenerados por hook/build), ignore-as — o
   gate revisa commits, não artefatos. Com material e a implementação
   concluída (suíte verde no caso TDD), leia `skill://deep-review` e execute-a em
   modo **branch base** com base = branch default do repo (informe-a como chamador;
   NUNCA pergunte ao usuário nem use outro modo), passando como instruções
   adicionais: "`docs/review-feedback.md` é log do gate — fora do escopo de
   achados". Depois percorra os sub-passos 4.1–4.5 — valem para qualquer caminho
   de implementação (trivial, TDD ou correção de bug). Rodada = uma execução da
   deep-review + as correções que ela gera; o teto é de **2 rodadas**.

   **4.1 Triagem**: classifique cada achado como válido ou falso positivo com
   justificativa concreta (caminho de código/condição de disparo). Só P0/P1 válidos
   bloqueiam. Sem P0/P1 válido → siga ao passo 5 (4.5 é executado no caminho).

   **4.2 Roteamento** — para cada P0/P1 válido, classifique ANTES de corrigir:
   - **Discreto**: localizado (poucos arquivos), sem tocar `interface-contract.md`
     nem fronteira de módulo, sem mudar comportamento documentado além do que o
     próprio achado descreve → entra no loop de correção (4.3).
   - **Estrutural**: toca `interface-contract.md`, cruza fronteira de módulo (novo
     tipo/variante/evento sem branch no lado consumidor) ou muda decisão de design →
     PARE e pergunte ao usuário:
     - (a) abandonar este ship e abrir um novo ciclo ship+TDD do zero para o fix
       estrutural (este ship encerra aqui; não execute 4.5 — o gate do novo ciclo gera o próprio feedback);
     - (b) corrigir agora no loop mesmo assim — registrada na evidência, essa
       escolha isenta o fix da reclassificação de contrato em 4.3 (a decisão já foi
       do usuário);
     - (c) shipar com o achado documentado na evidência do passo 5.
     A espera pela decisão não consome rodada do teto de 2; a correção pela escolha
     (b) acontece dentro do ciclo normal de rodadas (4.3/4.4).

   **4.3 Loop de correção** — para achados discretos, nesta ordem:
   1. **Mini-RED**: achado reproduzível → escreva o teste de regressão ANTES do
      fix, numa costura que exercite o padrão real do bug (critério da Fase 5 de
      `skill://bug-diagnosis`), e veja-o falhar. Sem costura correta OU repo sem
      infraestrutura de testes → registre "sem costura" + motivo na evidência e
      siga sem o teste.
   2. **Fix**: correção que cruza fronteira de módulo, toca múltiplos arquivos ou
      introduz/muda tipo compartilhado → delegue via `task` ao `backend-developer`
      ou `frontend-developer` (briefing: achado completo, caminho do teste de
      regressão já falhando — ou o passo de reprodução manual se o achado está
      "sem costura" —, critério de done; testes são read-only para o
      delegado — ele implementa só o fix); delegação falhar (agente desconhecido,
      output inválido ou bloqueio) → aplique você mesmo. Fix localizado → aplique
      você mesmo.
   3. **Doc**: fix restaura comportamento pretendido → nada a atualizar. Fix muda
      comportamento documentado (spec, README de API, contrato de payload) →
      atualize a doc afetada no mesmo commit; doc não trivial → delegue ao
      `spec-kit-author` (mesma regra de fallback da delegação do fix).
      Fix toca `interface-contract.md` → reclassifique como estrutural e volte a
      4.2 (exceto se a escolha (b) já estiver registrada na evidência).
   4. **Verde + commit**: rode a suíte de testes do projeto até verde (repo sem suíte: registre "sem suíte" na evidência e siga) e commite
      com `git add -A` e mensagem `<tipo>: correções da revisão (rodada K) (#N)`
      (nunca via ship.mjs) — teste de regressão, fix e doc no mesmo commit.

   **4.4 Re-review e teto**: após o commit de correção, repita a deep-review sobre
   o diff completo da branch com as mesmas instruções adicionais (log do gate fora
   do escopo de achados):
   - Sem P0/P1 válido → siga ao passo 5 (4.5 no caminho).
   - Com P0/P1 válido e rodada < 2 → os achados novos voltam à triagem (4.1) da
     próxima rodada, incluindo a classificação de roteamento (um fix pode gerar
     achado estrutural).
   - Com P0/P1 válido após a 2ª rodada → PARE e pergunte ao usuário:
     - (a) corrigir os achados restantes mesmo assim → aplique a disciplina de 4.3
       aos achados restantes, commite e siga ao passo 5 SEM nova re-review (o teto
       de rodadas é final);
     - (b) shipar com os achados documentados na evidência do passo 5 → siga ao
       passo 5;
     - (c) abandonar → este ship encerra; registre os achados na evidência apenas;
       não execute 4.5 (não commitar feedback em branch que não será publicada).
     Registre a escolha na evidência. Nunca shipar por conta própria nesse estado.
   Achados P2/P3 (de qualquer rodada) são não bloqueantes: guarde-os para a
   evidência do passo 5.

   **4.5 Feedback persistente** — execute imediatamente antes do passo 5, em todo
   caminho que chega lá: havendo qualquer P0/P1 VÁLIDO no gate (qualquer rodada),
   registre os achados em `docs/review-feedback.md` do repo — o registro é
   idempotente pela chave (categoria, caminho): se já existe linha com a mesma
   categoria e o mesmo caminho (ou ambas sem campo `arquivo:`, no caso
   transversal), não anexe duplicata. Formato de cada entrada nova:
   `- <data ISO> [P<n>] <categoria curta>: <o que observar> (arquivo: <caminho>)`
   (crie o arquivo com o header `# Feedback de review` se não existir). Houve
   entrada nova → commit separado: `docs: feedback de review (#N)`; nada novo →
   pule o commit. Falso positivo NUNCA vira entrada.
5. **PR**: grave a evidência do gate em `.git/ship-review-evidence.md` (veredito
   consolidado, contagem de achados por prioridade, triagem de falsos positivos,
   P2/P3 não bloqueantes com localização, decisão de escalation se houve; quais
   P0/P1 válidos tiveram teste de regressão vs "sem costura"; docs atualizadas por
   commit; classificação (discreto/estrutural) de cada P0/P1; linhas anexadas em
   `docs/review-feedback.md`; inclua também a saída do validator se houve TDD;
   inclua a hipótese confirmada do diagnóstico e achados de arquitetura se o
   caminho foi correção de bug (skill://bug-diagnosis)). Rode
   `bin/ship.mjs ship "descrição curta" --body-file .git/ship-review-evidence.md`
   — descrição one-line (vira título); o corpo leva `Closes #N` + descrição +
   evidência. O auto-merge é habilitado pelo motor; se indisponível, aguarde o CI
   e mergue manualmente.

   Se o PR entrar em conflito com a base antes do merge: na branch do PR rode
   `git fetch origin` e depois `git merge origin/<default>`, resolva seguindo
   `skill://conflict-resolution`, commite e dê push; o auto-merge retoma com o CI
   verde.
6. **Release**: NÃO mergue automaticamente o PR de release do release-please. Quando
   o usuário quiser lançar: `gh pr merge <nº do PR de release> --squash` e aguarde a
   tag.
7. **Deploy**: rode `deploy` e confira a saída (backup, versão servida).

## Armadilhas

- Número de PR ≠ número de issue no GitHub (contagem compartilhada) — use a URL que os
  comandos retornam.
- Commitlint valida o commit: a descrição passada a `ship` não deve duplicar o prefixo
  Conventional nem quebrar o formato.
- pre-push bloqueia push direto na default by design; `deploy` exige estar na default.
- Estado do tdd-orchestrator (`.omp/`) fica fora do git (entrada no .gitignore).
- O gate roda ANTES de `bin/ship.mjs ship` — depois dele o auto-merge pode fundir
  enquanto você corrige.
- Loop de review: triagem de falsos positivos e teto de 2 rodadas são obrigatórios;
  corrigir código correto para satisfazer achado errado é regressão.
- O gate é path-agnostic: roda após implementação trivial, TDD ou correção de bug.
  Repo sem suíte de testes não pula o gate nem o commit — registra "sem suíte" na
  evidência.
- Correção do gate: achado reproduzível exige teste de regressão escrito ANTES do
  fix (mini-RED); sem costura correta, registre o motivo — nunca finja cobertura.
- Fix que toca `interface-contract.md` não é correção de loop: reclassifique como
  estrutural e devolva a decisão ao usuário (exceto se a escolha (b) de 4.2 já
  estiver registrada na evidência).
- Achados novos de uma re-review voltam à triagem (4.1): um fix pode introduzir
  achado estrutural, e ele também precisa de roteamento.
- `docs/review-feedback.md` registra só achado VÁLIDO: falso positivo ali vira
  checklist errado no próximo peer review.
- O gate revisa commits: implementação no working tree é commitada ANTES da
  deep-review (`<tipo>: implementação (#N)`); sem commits além da base, o gate
  informa e para — nunca revise working tree em modo "não commitadas" no gate.
- `docs/review-feedback.md` é idempotente pela chave (categoria, caminho): a
  mesma lição é registrada uma vez, não uma por rodada.
- Commits de correção do gate são manuais; `ship.mjs ship` roda UMA vez, no final.
  No caminho TDD a árvore chega limpa ao ship — o motor publica os commits locais
  não publicados, é esperado.
- Alinhamento é proporcional mas nunca pulado em silêncio para pedidos de
 implementação/correção: trivial roda confirmação rápida; pedido já especificado
 exige declaração explícita do fechamento. Deploy/release/revisão isolada não
 passam pelo alinhamento.
- Diagnóstico de bug exige feedback loop vermelho ANTES de qualquer hipótese;
 pular para hipótese sem loop é a falha que a disciplina previne.
