# Matriz de capacidades e fontes

Inventário navegável das 42 capacidades/18 fontes, sem duplicar as regras dos
donos. Os IDs F do catálogo permanecem estáveis; F-ARCH/F-HOST representam as
responsabilidades acrescentadas. WF são aceites da demanda e AC são os critérios
da spec canônica. Fonte integrada, testes de biblioteca, CLI staging e execução
OMP instalada são níveis diferentes. Nenhuma linha abaixo declara NATIVE PASS.

Testes citados são arquivos reais para revisão de cobertura, não afirmação de
que cada cenário foi executado. “Sem teste dedicado” significa conferência
semântica de fonte/links nesta etapa; ainda requer revisão independente. As
referências de especialidade não certificam aplicação a todas as stacks.

**Governança de estado:** a fase, autorização, revisão, gates e classificação
live vêm de `.omp/state/tdd/progress.json` e do receipt corrente. Receipts
`.omp/state/**` e URIs `local://` são proveniência privada, não documentação
distribuída nem fixtures para agentes Native; a matriz não duplica contagens,
budgets, tentativas ou hashes de candidato. Capturas/ledgers anteriores à
mudança pública da fonte são históricos e escopados; a mudança de fonte reabre
provas dependentes. O cutoff público de `retained-observations.json` é
imutável, e desconhecido/null não é zero.

Os aditamentos aprovados `0.6.0` e `0.7.0` adicionam somente extensões
privadas de evidência: o terminal SDK `wait` e a prova backend NATIVE-09
escopada. Os 42 CAP, 18 fontes, 21 AC e 22 tarefas não mudam. Inline
`details.results` e custom `message_end`/`async-result` continuam válidos;
`tool_execution_end.result.details.jobs[]` é preservado como snapshot bruto
`source_kind: "task_wait_result"`, sem novo campo público, API, perfil ou CLI.
O kind 0.7 tipado `source_kind: "native09-backend-repair-write"` permanece
privado, Root-bound e exige sujeito alterado/dependências protegidas
inalteradas. Ownership Root, schema/proveniência, terminalidade, NULL quando
ausente e deduplicação seguem o contrato ativo; nenhum progresso, lifecycle,
texto ou settlement é task record. As aprovações e limites estão nos receipts
privados correspondentes.

### Aditamento 0.7.0 — evidência privada NATIVE-09

O aditamento é aprovado no escopo documental, aditivo e não lançado; não muda
os 42 CAP, 18 fontes, 21 AC, 22 tarefas, perfis ou contadores. Para o backend
de NATIVE-09, o único kind privado permitido é
`source_kind: "native09-backend-repair-write"`. A prova exige job aprovado pelo
Root `completed`, criança opaca com tuple Root completo/único, um único
`write END` com `isError:false` explicitamente observado no path exato, sujeito
`actual` realmente alterado e dependências protegidas inalteradas. Identidade,
path e correlação permanecem Root-bound.

Peer independente e segundo validator podem ser coletados na mesma coleção,
mas não representam aprovação semântica ou Native PASS. `Task framework
completed` não é `validator semantic PASS`; o primeiro `FALHOU` correlacionado
a CLI real não-zero permanece raw/histórico. Semantic repair approval exige
peer independente e segundo validator com `PASSOU` real. Perfis estruturados
continuam exigindo schema válido; somente esta exceção do perfil
`backend-developer` para NATIVE-09 é escopada, sem aceitação geral de perfil
indisponível. Regras de `validator`/`spec-kit-author` não mudam, salvo a
clarificação de que relatório negativo concluído não passa testes. Flags child
não expostas permanecem unknown/null, sem inferência. Não há SDK/wire/API/
settings/model/flag/CLI públicas novas; tabelas seguem `PENDING`,
falhas/counters Native são históricos, e a ordem prepub→CI→release permanece
inalterada.

## 42 capacidades

| CAP / F | Capacidade e dono | Fonte da implementação/instrução | Verificação disponível / limite | WF / AC |
|---|---|---|---|---|
| CAP-001 / F-ALIGN | Entrada concreta, escopo, aceites, autorizações — alignment | [alignment/SKILL.md](../alignment/SKILL.md) | [Probe nativo retido](../implementation-evidence/native-release/alignment.mjs); apenas cenários explicitados no [índice de provas](../implementation-evidence/native-release/proof-index.json), sem cobertura integral inferida | WF-001, WF-002 / AC-001, AC-016 |
| CAP-002 / F-ALIGN | Rota short/full por risco/complexidade — alignment | [alignment/references/routing-and-persistence.md](../alignment/references/routing-and-persistence.md) | Sem teste dedicado de prosa; [probe retido](../implementation-evidence/native-release/alignment.mjs) com cobertura limitada aos cenários identificados no índice; integração global pendente | WF-003 / AC-001, AC-007 |
| CAP-003 / F-ALIGN | Entrega local sem inicializar Git — alignment + chamador local | [alignment/references/routing-and-persistence.md](../alignment/references/routing-and-persistence.md) | Sem teste dedicado de prosa; [probe retido](../implementation-evidence/native-release/alignment.mjs) não certifica por si só toda a rota local; integração global pendente | WF-003, WF-013 / AC-001, AC-016 |
| CAP-004 / F-ALIGN | Compreensão por leitor independente — alignment | [alignment/references/comprehension-review.md](../alignment/references/comprehension-review.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-002 / AC-001, AC-008 |
| CAP-005 / F-REVIEW | Contexto novo, índice único e reutilização — deep-review, referência compartilhada | [deep-review/references/fresh-review.md](../deep-review/references/fresh-review.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-003, WF-008 / AC-005, AC-008 |
| CAP-006 / F-ARCH | Arquitetura proporcional — architecture | [architecture/SKILL.md](../architecture/SKILL.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001, WF-003 / AC-001, AC-010 |
| CAP-007 / F-ARCH | Contratos API/consumidores — architecture | [architecture/references/api-contracts.md](../architecture/references/api-contracts.md) | Sem teste dedicado; fonte/links conferidos; fronteira Windows r7 e prova pendente abaixo | WF-004, WF-007, WF-013 / AC-001, AC-006, AC-017–019 |
| CAP-008 / F-ARCH | Crítica independente da especificação — architecture | [architecture/references/spec-review.md](../architecture/references/spec-review.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-008 / AC-008 |
| CAP-009 / F-TDD | Planejamento DAG/IDs/recursos — tdd-orchestrator | [tdd-orchestrator/lib/execution.mjs](../tdd-orchestrator/lib/execution.mjs) | [scripts/execution.test.mjs](../scripts/execution.test.mjs); nativo pendente | WF-009 / AC-011 |
| CAP-010 / F-TDD | Capacidade real e máximo paralelismo útil — tdd-orchestrator | [tdd-orchestrator/references/execution-and-resume.md](../tdd-orchestrator/references/execution-and-resume.md) | [scripts/execution.test.mjs](../scripts/execution.test.mjs); nativo pendente | WF-009 / AC-007, AC-011 |
| CAP-011 / F-TDD | Escritor único, aliases, pai/filho, saídas de testes/caches — tdd-orchestrator | [tdd-orchestrator/lib/execution.mjs](../tdd-orchestrator/lib/execution.mjs) | [scripts/execution.test.mjs](../scripts/execution.test.mjs); nativo pendente | WF-009 / AC-002, AC-011 |
| CAP-012 / F-TDD | Completeness barrier com IDs/digests/retornos reais — tdd-orchestrator | [tdd-orchestrator/lib/execution.mjs](../tdd-orchestrator/lib/execution.mjs) | [scripts/execution.test.mjs](../scripts/execution.test.mjs); nativo pendente | WF-008, WF-009 / AC-008, AC-011 |
| CAP-013 / F-TDD | Seleção de modelos/esforço e escalada técnica — perfis geridos OMP + coordenação TDD | [tdd-orchestrator/references/model-policy.md](../tdd-orchestrator/references/model-policy.md) | [Probe de perfis retido](../implementation-evidence/native-release/profiles.mjs); somente cenários e metadados delimitados no índice de provas | WF-010 / AC-012 |
| CAP-014 / F-TDD | Pedido versus modelo realmente observado — prova nativa dos perfis geridos | [tdd-orchestrator/references/model-policy.md](../tdd-orchestrator/references/model-policy.md) | [Probe de perfis retido](../implementation-evidence/native-release/profiles.mjs); requested/resolved/observed separados; serving físico e fallback de provider NÃO OBSERVADOS | WF-010 / AC-012, AC-014 |
| CAP-015 / F-TDD | Retentativas, falhas e continuidade — tdd-orchestrator | [tdd-orchestrator/lib/execution.mjs](../tdd-orchestrator/lib/execution.mjs) | [scripts/execution.test.mjs](../scripts/execution.test.mjs); nativo pendente | WF-009 / AC-011 |
| CAP-016 / F-TDD | Checkpoint portátil/handoff — tdd-orchestrator | [tdd-orchestrator/references/handoff.md](../tdd-orchestrator/references/handoff.md) | [scripts/state-evolution.test.mjs](../scripts/state-evolution.test.mjs); nativo pendente | WF-003, WF-009 / AC-006, AC-011 |
| CAP-017 / F-TDD | Fatias verticais e testes observáveis — TDD, test-author/spec-kit-author | [tdd-orchestrator/references/behavior-slices.md](../tdd-orchestrator/references/behavior-slices.md) | Sem teste dedicado; fonte/links conferidos; RED/GREEN Windows e fixtures distintas, pendentes abaixo | WF-008 / AC-008, AC-017–019 |
| CAP-018 / F-REVIEW | Revisão técnica e de requisitos separadas — deep-review | [deep-review/references/review-axes.md](../deep-review/references/review-axes.md) | [scripts/deep-review.test.mjs](../scripts/deep-review.test.mjs); nativo pendente | WF-008 / AC-008 |
| CAP-019 / F-TDD | Matriz spec→código/teste/evidência — validator + eixo requisitos | [tdd-orchestrator/references/spec-code-consistency.md](../tdd-orchestrator/references/spec-code-consistency.md) | [scripts/tdd-state.test.mjs](../scripts/tdd-state.test.mjs); nativo pendente | WF-008 / AC-003, AC-008 |
| CAP-020 / F-REVIEW | IDs de instâncias review versus tipo — deep-review protocol | [deep-review/lib/protocol.mjs](../deep-review/lib/protocol.mjs) | [scripts/review-instances.test.mjs](../scripts/review-instances.test.mjs); nativo pendente | WF-004 / AC-006, AC-008 |
| CAP-021 / F-TDD | Estado TDD durável, AC normativo explícito, migração preservadora — tdd-orchestrator state | [tdd-orchestrator/lib/state.mjs](../tdd-orchestrator/lib/state.mjs) | [scripts/state-evolution.test.mjs](../scripts/state-evolution.test.mjs); nativo pendente | WF-004 / AC-006 |
| CAP-022 / F-QUALITY | Baseline/delta completo, classificação, revisão bound ao conteúdo — quality compartilhada | [tdd-orchestrator/lib/quality.mjs](../tdd-orchestrator/lib/quality.mjs) | [scripts/quality.test.mjs](../scripts/quality.test.mjs); nativo pendente | WF-006, WF-007 / AC-002, AC-005 |
| CAP-023 / F-QUALITY | Documentação funcional sempre atual — spec-kit-author | [tdd-orchestrator/references/quality-policy.md](../tdd-orchestrator/references/quality-policy.md) | [scripts/quality.test.mjs](../scripts/quality.test.mjs); nativo pendente | WF-006 / AC-003 |
| CAP-024 / F-REVIEW | Segurança obrigatória proporcional — deep-review | [deep-review/references/application-security.md](../deep-review/references/application-security.md) | [scripts/quality-context-security.test.mjs](../scripts/quality-context-security.test.mjs); revisão independente do guard/host Windows pendente | WF-007 / AC-004, AC-017–019 |
| CAP-025 / F-TDD | Revalidação por fase, integridade — tdd-orchestrator | [tdd-orchestrator/lib/execution.mjs](../tdd-orchestrator/lib/execution.mjs) | [scripts/execution.test.mjs](../scripts/execution.test.mjs); provas afetadas pela fronteira Windows exigem revalidação | WF-008, WF-013 / AC-005, AC-011, AC-017–019 |
| CAP-026 / F-BOOT | CI/servidor para enforcement — release-bootstrap | [release-bootstrap/references/quality-enforcement.md](../release-bootstrap/references/quality-enforcement.md) | [scripts/bootstrap-config.test.mjs](../scripts/bootstrap-config.test.mjs); nativo pendente | WF-007 / AC-001, AC-004 |
| CAP-027 / F-SHIP | Plano readonly e publicação/merge/deploy separados — ship | [ship/SKILL.md](../ship/SKILL.md) | [scripts/ship-protocol.test.mjs](../scripts/ship-protocol.test.mjs); [scripts/ship-plan.test.mjs](../scripts/ship-plan.test.mjs); integração nativa pendente | WF-005, WF-013 / AC-001, AC-016, AC-021 |
| CAP-028 / F-RETRO | Triagem retrospectiva — retro | [retro/lib/control.mjs](../retro/lib/control.mjs) | [scripts/retro.test.mjs](../scripts/retro.test.mjs); nativo pendente | WF-011 / AC-009 |
| CAP-029 / F-RETRO | Retrospectiva e até3 propostas — retro | [retro/references/protocol.md](../retro/references/protocol.md) | [scripts/retro.test.mjs](../scripts/retro.test.mjs); nativo pendente | WF-011 / AC-009 |
| CAP-030 / F-TDD | Métricas tempo/custo/retrabalho/defeitos — tdd-orchestrator | [tdd-orchestrator/references/execution-and-resume.md](../tdd-orchestrator/references/execution-and-resume.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-009, WF-011 / AC-011, AC-014 |
| CAP-031 / F-ALIGN | domain-modeling: glossário, termos, contexto e ADR — referência de domínio em alignment | [alignment/references/domain-modeling.md](../alignment/references/domain-modeling.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-010, AC-015 |
| CAP-032 / F-TDD | frontend-design: direção visual/tokens/estados e verificação renderizada — referência frontend em TDD | [tdd-orchestrator/references/frontend-design.md](../tdd-orchestrator/references/frontend-design.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-010, AC-015 |
| CAP-033 / F-REVIEW | accessibility: teclado/foco/semântica/contraste/formulários/reflow — referência accessibility em deep-review | [deep-review/references/accessibility.md](../deep-review/references/accessibility.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-010, AC-015 |
| CAP-034 / F-REVIEW | security-best-practices: Python/JS/TS/Go, autorização/injeção/sessões/segredos — referência security em deep-review | [deep-review/references/application-security.md](../deep-review/references/application-security.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-007 / AC-004, AC-010, AC-015 |
| CAP-035 / F-TDD | vercel-react-best-practices: React/Next confirmados — referência React em TDD | [tdd-orchestrator/references/react-next.md](../tdd-orchestrator/references/react-next.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-010, AC-015 |
| CAP-036 / F-TDD | supabase-postgres-best-practices: PG confirmado — referência PostgreSQL em TDD | [tdd-orchestrator/references/postgresql.md](../tdd-orchestrator/references/postgresql.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-010, AC-015 |
| CAP-037 / F-BUG | ast-grep: busca estrutural — referência AST em bug-diagnosis | [bug-diagnosis/references/ast-search.md](../bug-diagnosis/references/ast-search.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-010, AC-015 |
| CAP-038 / F-BOOT | release-bootstrap: CI/versionamento/proteções — release-bootstrap | [release-bootstrap/SKILL.md](../release-bootstrap/SKILL.md) | [scripts/bootstrap-config.test.mjs](../scripts/bootstrap-config.test.mjs); nativo pendente | WF-002 / AC-001, AC-010 |
| CAP-039 / F-HOST | secure-linux-web-hosting: SSH/firewall/Nginx/TLS — secure-linux-web-hosting | [secure-linux-web-hosting/SKILL.md](../secure-linux-web-hosting/SKILL.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-001, AC-010, AC-015 |
| CAP-040 / F-ALIGN | writing-for-agents: instruções/gatilhos/referências/validação — referência writing-for-agents em alignment | [alignment/references/writing-for-agents.md](../alignment/references/writing-for-agents.md) | Sem teste dedicado; fonte/links conferidos; nativo pendente | WF-001 / AC-010, AC-015 |
| CAP-041 / F-BUG | bug-diagnosis — bug-diagnosis | [bug-diagnosis/SKILL.md](../bug-diagnosis/SKILL.md) | [scripts/bug-diagnosis.test.mjs](../scripts/bug-diagnosis.test.mjs); nativo pendente | WF-002 / AC-001, AC-008 |
| CAP-042 / F-CONFLICT | conflict-resolution — conflict-resolution | [conflict-resolution/SKILL.md](../conflict-resolution/SKILL.md) | [scripts/conflict-resolution.test.mjs](../scripts/conflict-resolution.test.mjs); nativo pendente | WF-002 / AC-001, AC-008 |

Todas as linhas apontam ao [catálogo/guia/histórico](functional.md) e à
[avaliação NATIVE-01–10](omp-compatibility.md). O mapeamento AC de fonte única
permanece na [spec canônica Spec005](../specs/specs005-omp-compatible-release/spec.md);
não é novo aceite.

## 18 fontes e proveniência

| Fonte | Dono atual | Referência seletiva / entrypoint | Origem e licença |
|---|---|---|---|
| alignment | alignment | [alignment/SKILL.md](../alignment/SKILL.md) | [SOURCE.md](../alignment/SOURCE.md) |
| architecture | architecture | [architecture/SKILL.md](../architecture/SKILL.md) | [SOURCE.md](../architecture/SOURCE.md) |
| ast-grep | bug-diagnosis | [bug-diagnosis/references/ast-search.md](../bug-diagnosis/references/ast-search.md) | [SOURCE.md](../bug-diagnosis/SOURCE.md) |
| bug-diagnosis | bug-diagnosis | [bug-diagnosis/SKILL.md](../bug-diagnosis/SKILL.md) | [SOURCE.md](../bug-diagnosis/SOURCE.md) |
| conflict-resolution | conflict-resolution | [conflict-resolution/SKILL.md](../conflict-resolution/SKILL.md) | [SOURCE.md](../conflict-resolution/SOURCE.md) |
| deep-review | deep-review | [deep-review/SKILL.md](../deep-review/SKILL.md) | [SOURCE.md](../deep-review/SOURCE.md) |
| domain-modeling | alignment | [alignment/references/domain-modeling.md](../alignment/references/domain-modeling.md) | [SOURCE.md](../alignment/SOURCE.md) |
| frontend-design | tdd-orchestrator | [tdd-orchestrator/references/frontend-design.md](../tdd-orchestrator/references/frontend-design.md) | [SOURCE.md](../tdd-orchestrator/SOURCE.md) |
| accessibility | deep-review | [deep-review/references/accessibility.md](../deep-review/references/accessibility.md) | [SOURCE.md](../deep-review/SOURCE.md) |
| security-best-practices | deep-review | [deep-review/references/application-security.md](../deep-review/references/application-security.md) | [SOURCE.md](../deep-review/SOURCE.md) |
| vercel-react-best-practices | tdd-orchestrator | [tdd-orchestrator/references/react-next.md](../tdd-orchestrator/references/react-next.md) | [SOURCE.md](../tdd-orchestrator/SOURCE.md) |
| supabase-postgres-best-practices | tdd-orchestrator | [tdd-orchestrator/references/postgresql.md](../tdd-orchestrator/references/postgresql.md) | [SOURCE.md](../tdd-orchestrator/SOURCE.md) |
| release-bootstrap | release-bootstrap | [release-bootstrap/SKILL.md](../release-bootstrap/SKILL.md) | [SOURCE.md](../release-bootstrap/SOURCE.md) |
| secure-linux-web-hosting | secure-linux-web-hosting | [secure-linux-web-hosting/SKILL.md](../secure-linux-web-hosting/SKILL.md) | [SOURCE.md](../secure-linux-web-hosting/SOURCE.md) |
| ship | ship | [ship/SKILL.md](../ship/SKILL.md) | [SOURCE.md](../ship/SOURCE.md) |
| tdd-orchestrator | tdd-orchestrator | [tdd-orchestrator/SKILL.md](../tdd-orchestrator/SKILL.md) | [SOURCE.md](../tdd-orchestrator/SOURCE.md) |
| retro | retro | [retro/SKILL.md](../retro/SKILL.md) | [SOURCE.md](../retro/SOURCE.md) |
| writing-for-agents | alignment | [alignment/references/writing-for-agents.md](../alignment/references/writing-for-agents.md) | [SOURCE.md](../alignment/SOURCE.md) |

## Provas e lacunas

As provas históricas Spec004 separaram source/unit/staging/native. Aquela
integração registrou 686 PASS/10 skips, roteamento 94 PASS e perfis 14 PASS em
Node; a CLI/--check em HOME isolado registrou 10 skills/12 perfis, 136 destinos
e hashes. Esses números não são a suíte ou a avaliação nativa vigente.
Provas atuais e limites aceitos ficam no [guia OMP](omp-compatibility.md);
resultados parciais não demonstram compatibilidade integral nem ganho global.

Os oráculos de configuração de `agent-models.test.mjs` foram substituídos por
provas nativas e testes do consumer real, sem repinar prosa/hash. NATIVE-05 exige
o yield TDD estruturado APROVADO/BLOQUEADO e rejeição de retorno inválido.
Positivos/negativos nativos e controles derivados são distintos: malformed
corrigido pelo produtor não é rejeição nativa. Os onze positivos Git antigos
falhos sob `E_UNSAFE_GIT_EXECUTABLE` continuam históricos, sem PASS retroativo.

### Delta Windows nas capacidades existentes

CAP-007/017/024/025 recebem AC-017–019 nos donos existentes, sem duplicar as
11 funcionalidades, 42 capacidades ou 18 fontes. O
[contrato ativo Windows](../specs/specs005-omp-compatible-release/contracts/interface-contract.md)
limita a seleção a Git for Windows **2.54.0.windows.1 x64**: candidato original
exatamente em `cmd/git.exe` ou `mingw64/bin/git.exe`, ambos com release/origem,
assinatura, hashes, identidades, linksets, ACLs, ancestrais e carga aprovados.
A implementação, metadata real, consultas e wrappers receberam provas e review
componentes; isso não instala o pacote nem substitui o aceite final integrado.

A premissa `explicit_os_host_tcb` é restrita ao host PowerShell 5.1/System32 e
contexto protegido do bootstrap filesystem; não transfere confiança ao Git.
Unknown nega e `E_UNSAFE_GIT_EXECUTABLE` encerra a seleção sem outra cópia,
PATH ou shell. O [guia](functional.md#seleção-git-windows-e-bloqueio) descreve
recuperação e preservação de installer/pre-push, quatro hooks, standalone,
worktrees, LFS e consumidores Ship.

TD-001/NDR-001 mantêm a falha histórica e a decisão de contexto daquela etapa;
a implementação atual não reescreve nem aprova retroativamente a proposta.
A proposta nativa estrita segue não adotada/NO_GO; NDR-002 serviço não foi
adotado e NDR-003 transporte não é usado. `keep_current_guarantee` permanece
histórico. Ataques a arquivo/aliases/ACL/carga continuam bloqueantes.
Os doze perfis atuais preservam candidatos `openai-codex` por papel; serving
físico/fallback não observados são limites explicitamente aceitos, não PASS.
Veja a [política de modelos](../tdd-orchestrator/references/model-policy.md).
OMP alvo é 18.18.6; Node externo e runtime OMP são distintos. O preflight
18.18.3 de 2026-11-09 permanece histórico. Nenhum serviço, SDK, componente OS,
PATH ou hardlink é instalado/alterado por esta consolidação documental.

SOURCE.md do TDD registra que o texto MIT completo React não foi recebido:
confirmação do aviso é pendência de distribuição final, sem licença fabricada.
NOTICE e as licenças recebidas foram preservados. As fontes e suas adaptações
não são uma certificação upstream nem uma nova orquestração.
