# Política compartilhada de qualidade

Fonte única de segurança proporcional, documentação funcional e atualidade das
provas para as dez skills. Complementa os protocolos existentes: não cria outro
orquestrador, envelope de revisão, conjunto de agentes ou gates TDD. Leia somente
as seções pertinentes à fase atual. OMP, permissões e instruções do usuário
continuam prioritários.

## Planejar sem antecipar a entrega

Alignment fecha objetivo e critérios; pedido completo usa o fast-close existente.
Registre stack, dados, autenticação/permissões, exposição, fronteiras de confiança,
risco e razões concretas no plano. Autenticação, dados pessoais, pagamentos e
superfícies públicas requerem análise aprofundada dos riscos pertinentes antes da
implementação sensível. Não rebaixe risco para dispensar controles.

Antes de mudar o produto, capture baseline pelo comando abaixo. Conserve esse
arquivo operacional: não recapture uma baseline para esconder alterações. Se o
trabalho já começou, recupere a fotografia histórica verificável ou declare a
comparação indisponível e obtenha reconciliação independente; o gate desta versão
exige baseline íntegra e não fabrica o estado anterior.

```text
node <diretório real da skill tdd-orchestrator>/bin/quality.mjs capture <projeto>
```

O comando emite JSON no stdout. Persista em `.omp/state/<run>/baseline.json`,
antes da implementação. Inventário inclui fontes, testes, documentação, configuração
e arquivos novos; exclui somente `.git`, `.omp` e `node_modules` em qualquer nível.
Produto não pode ficar nessas áreas operacionais. Links, junctions, arquivos
especiais e hardlinks são recusados, sem seguir conteúdo externo.

Em `planning`, `validateQuality` exige schema 1, baseline atual, `security.risk`,
`security.rationale` e `plan.documentation`, `plan.security`, `plan.review` não
vazios. Não exige documentos futuros nem aprovação final antes da implementação.
O relatório operacional e provas ficam em `.omp`, fora do inventário de produto.

## Documentação e rastreabilidade

Mantenha catálogo de funcionalidades com estado, especificação de fluxos/regras/
permissões/exceções e aceites, guia de uso e histórico funcional. Os papéis podem
ser seções de um único documento; README dá acesso aos documentos por links reais.
Preserve padrões locais e a fonte de verdade; Spec Kit mantém os quatro artefatos
canônicos e pode referenciar o material funcional, sem duplicar seu conteúdo.

Toda alteração, adição ou remoção de arquivo exige uma classificação no delta da
baseline: `functional` ou `none`, com razão. Mudança funcional referencia IDs de
funcionalidades/aceites e caminhos de testes/documentos pertinentes; atualize os
documentos afetados na mesma entrega. Remoção funcional atualiza catálogo, uso e
histórico. Várias funcionalidades podem compartilhar um arquivo e vice-versa.

Mudança sem impacto pode preservar os documentos quando há justificativa concreta
confirmada pela revisão independente. Atualizar data, hash ou formatação não
comprova correspondência semântica. O gate confere inventário, existência, vínculos,
delta documental e provas atuais; o revisor confronta significado, comportamento,
documentação, especificação e testes, incluindo as justificativas `none`.

## Segurança

Segredos e dependências são verificações obrigatórias quando aplicáveis; ausência
de dependências pode justificar NA, com prova do conteúdo. Registre método, cobertura,
resultado e limitações, sem copiar valores secretos para relatório/logs. Risco alto
exige análise de ameaças (`threat-model` PASS), requisitos e testes pertinentes.
Indisponibilidade de scanner não torna controle inaplicável: procure método seguro
equivalente dentro da autorização ou mantenha o gate bloqueado.

P0/P1 e achados high/critical abertos bloqueiam entrega; aceitação de risco não os
transforma em PASS. Correção requer evidência e nova conferência. Preserve riscos
residuais e achados menores. A promoção TDD mantém seu contrato próprio sem achados
residuais; não apague P2/P3 de um relatório deep-review para adaptar sua saída.

## Uma responsabilidade por etapa

| Etapa/papel | Responsabilidade |
|---|---|
| Alignment | Objetivo, aceites, risco, baseline e plano de documentação/segurança/revisão |
| Spec-kit-author | Quatro artefatos Spec Kit e documentação funcional atribuída no briefing |
| Test-author | Testes observáveis pelos aceites, limites/erros e riscos relevantes |
| Developers/refactorer | Implementação e indicação do impacto documental; não usurpar Spec Kit |
| Coordenador | Encaminhar impacto ao autor documental, manter estado/inventário e coletar provas |
| Deep/peer-review | Revisão independente técnica e de requisitos, com segurança e semântica documental |
| Validator | Reutilizar/reexecutar provas atuais e conferir contrato, documentação e segurança nos gates existentes |
| Ship | Validar relatório sobre conteúdo final antes de commit/push; entrega externa só com autorização |
| Release-bootstrap | Preparar integração/configuração quando solicitado, sem substituir revisão de cada mudança |
| Bug-diagnosis/conflitos | Preservar loop de regressão/intenção e devolver ao mesmo review/validação |

No TDD, referencie o relatório aprovado em `security`, `spec_kit` e `contract`,
conforme a cobertura de cada gate; não adicione chaves ao schema do progresso.
Não repita testes cosméticos ou entrevistas resolvidas. Fatias de implementação
devem demonstrar comportamentos completos; preserve RED por asserção, GREEN e
revisão/validação independentes. Trabalho normativo usa tipo explícito de critério,
não uma exceção por número de AC.

## Relatório e verificação de entrega

Contrato completo no repositório fonte:
`specs/specs004-quality-evolution/contracts/interface-contract.md`.
A API abaixo descreve a base preservada. Para nova validação de delivery,
aplique obrigatoriamente o contexto esperado independente e recibos abaixo;
detalhes aditivos finais são os do contrato canônico vigente, não inferidos
deste resumo.

`captureInventory(root)` retorna `{files: {caminho: sha256}, digest}`.
`validateQuality(root, report, {stage: 'planning' | 'delivery', expectedContextDigest})` retorna
`{ok, errors}`; padrão `delivery`. CLI:

```text
node <diretório real da skill tdd-orchestrator>/bin/quality.mjs check <projeto> <relatório.json> delivery --quality-context <contexto-esperado.json>
```

O relatório contém `schema_version:1`, `baseline`, `revision` igual ao digest atual,
`changes:[{path,impact,reason,features:[],acceptance:[],tests:[],docs:[]}]`,
`documentation:{catalog,specification,guide,history}` (caminhos relativos),
`security:{risk,rationale,checks:[],findings:[]}` e
`review:{author,reviewer,independent:true,revision,evidence,documentation_current:true,security_reviewed:true}`.
Cada check tem `{id,status,method,evidence,revision,reason?}`; IDs `secrets`,
`dependencies`, `threat-model`; status `PASS|NA`. Findings têm
`{id,severity:'critical|high|medium|low',status:'open|fixed',evidence}` (valores
individuais, não a string com barras). Evidência é `{path,sha256}` de arquivo
regular dentro do projeto, inclusive `.omp`, com hash real. Autor e revisor são
identidades reais distintas; a revisão deve atestar a classificação de risco e as
justificativas de impacto, além da documentação e segurança.

O validador é somente leitura: não executa métodos/comandos do relatório, instala
ferramentas ou publica. Identidades e declarações do relatório não autenticam por
si mesmas uma execução humana/agente: o coordenador conserva os retornos reais e
confere sua origem. Hash prova conteúdo, não verdade semântica nem ausência de
vulnerabilidades. O inventário e a revisão são ligados ao mesmo conteúdo; qualquer
alteração posterior invalida as provas pertinentes e exige nova revisão e gate.

## Compatibilidade, eficiência e retomada

Descubra schemas atuais do OMP antes de despachar: batch e flat são configuráveis;
`name` identifica instância e `agent` seu tipo. Informe `solutionSpace` conforme o
schema exposto. Colete resultados efetivos, inclusive jobs assíncronos, antes de
promover. Nunca trate lançamento ou timestamp como conclusão.

Use capacidade disponível e orçamento observado, sem teto arbitrário. Escritores
com caminhos sobrepostos exigem isolamento efetivamente habilitado e confirmado;
sem ele serialize. Não forneça `isolated` quando o schema o omite. Modelos e
esforços seguem configuração atual; não invente disponibilidade, custo ou tokens.
Reutilize prova somente para o mesmo conteúdo, critérios, cobertura e ambiente;
mudanças invalidam apenas as provas afetadas, mantendo as anteriores como histórico.

Novos projetos configurados por `ship setup` habilitam `qualityPolicyVersion:1`
e `qualityReport:'.omp/state/quality.json'`. Migre configuração existente antes de
usar este fluxo atualizado. Configuração legada preserva a CLI com aviso explícito;
sem migração, não alegue gate automático. `--quality-report` ativa validação explícita
também no legado. Não há instalação de hooks ou vigilância contínua automática.
Mudanças que contornem o processo só são detectadas na próxima revalidação.


## Contexto esperado e recibos de origem

Delivery exige expectedContextDigest atual obtido pelo coordenador de contexto
aprovado independente do report/receipt avaliado. O fingerprint liga baseline,
revisão, critérios tipados, ambiente, finalidade/instruções, mudanças/vínculos,
documentos, risco/controles e identidades. Não aceitar digest autocertificado do
mesmo relatório nem recapturar baseline para aprovar prova antiga.

Recibo JSON auxiliar review/check conserva revisão e context_digest e referencia
retorno original por source:{path,sha256}; review também liga autor/revisor.
Conferir bytes dos dois, paths seguros/sem ciclos e origem real. Não reescrever
envelope nativo para caber no gate. Mutação de conteúdo/critério/risco/ambiente/
identidade/método invalida apenas provas dependentes, preservando histórico.
Hashes não autenticam identidade ou independência.

A API pública de qualidade0.2 permanece `qualityContextDigest(report)` e
`validateQuality(root, report, {stage = "delivery", expectedContextDigest} = {})`,
além de `captureInventory(root)`. A função de digest é pura; não autentica quem
aprovou o contexto. `planning` registra baseline/risco/contexto/plano atuais sem
exigir review final de produto futuro. `delivery` exige digest esperado atual de
fonte confiável independente: ausência, formato inválido ou divergência bloqueia.

Na CLI, `--quality-context <path>` fornece arquivo seguro contendo
`{schema_version:1, context_digest:"<64 hex minúsculos>"}`. Ship usa configuração
`qualityContext` junto de `qualityReport` e `qualityPolicyVersion:1`; a opção CLI
sobrescreve o caminho na chamada autorizada. O contexto não pode apontar ao próprio
report/receipt nem ser gerado dele para fazer um gate passar. `validateShipQuality`
preserva suas opções de report/contexto; funções auxiliares de leitura segura são
seams internos, não novas APIs públicas. Execução conserva o contrato canônico e
o estado existente; modelos usam somente os perfis geridos conforme a
[referência única](model-policy.md), sem API nova de modelos ou política global.
Prova nativa pendente não suspende o contrato público de qualidade0.2.

Recibos e retorno original são comparados por bytes/hash, revisão/contexto e
identidades pertinentes. O objetivo é detectar adulteração antes de consumir;
esta instrução não afirma que todo risco de troca durante uma operação esteja
resolvido ou que uma checagem estrutural seja congelamento universal. Exija provas
da implementação/revisão atuais para essa garantia, conservando limites apurados.

Revisão técnica e requisitos usam [dois eixos](../../deep-review/references/review-axes.md)
e [índice/contexto novo](../../deep-review/references/fresh-review.md).
Security-reviewer nativo é parecer auxiliar com gravidade/proveniência preservadas,
nunca yield deep-review fictício. Seis controles do run (requirements,
security_tests, secrets, dependencies, threat_model, security_review) conservam
provas no índice/gates existentes; não acrescentar IDs ao enum de checks por
prosa. Obrigação sem prova é bloqueio, não NA.

O contrato operacional único define a API de execução e os controles existentes;
a seleção de modelos permanece no frontmatter dos perfis geridos, sem launcher,
SDK ou guard global. Não usar comando legado sem contexto para alegar gate
ampliado. Consumidor deve conferir
contrato e implementação atuais antes de executar. Nenhuma skill substitui essa
política por cópia; instalação e E2E são provas separadas de revisão documental.
