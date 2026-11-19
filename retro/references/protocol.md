# Protocolo pós-entrega

## Uma triagem por entrega

Quem conclui a entrega coordena a triagem. Se TDD opera com `delivery: external`,
ele transfere fontes e revisão ao ship e não executa outra triagem. Em TDD
standalone, o próprio chamador coordena após a entrega local ou Git autorizada.
Invocação explícita de `retro` fora desses fluxos usa o mesmo protocolo. Não
altere schemas de produto, ondas ou gates para representar aprendizagem.

Guarde `retro-decision.json` e `retro.md` em diretório operacional da execução,
separado de documentos funcionais e dos arquivos inventariados do produto. Não
sobrescreva entregas, decisões ou relatórios anteriores; reexecuções preservam o
histórico e identificam o novo conjunto de provas.

## Triagem

Revalide o relatório de qualidade/entrega do chamador no conteúdo atual antes de
avaliar suas fontes. Cite a revisão histórica separadamente da revisão atual.
Acione análise se houver qualquer gatilho comprovado:

- rota full/trabalho complexo;
- primeiro piloto real do processo;
- falha relevante;
- retrabalho significativo;
- intervenção do usuário para destravar execução;
- pedido explícito de retrospectiva.

Uma autorização normal ou decisão de produto não é intervenção para destravar.
Versão nova, fixture e simulação textual não demonstram piloto real. Se não for
possível saber se o piloto é o primeiro, registre a incerteza como pendência,
sem inventar histórico. Opt-out explícito prevalece sobre gatilhos automáticos;
preserve-o e explique eventual conflito com pedido anterior.

A decisão identifica execução, relatório de entrega, revisão, escopo mínimo,
gatilhos, motivo e evidências relativas à raiz autorizada com hashes reais.
`decision_status: COMPLETE` exige `delivery_status: PASS` obtido por revalidação
atual e fontes suficientes. `required` é booleano nesse estado. Sem prova atual,
use `decision_status: INCOMPLETE`, `delivery_status: UNKNOWN`, `required: null`,
diagnóstico e próxima ação. Falta de prova nunca significa `required: false`.
Opt-out não transforma entrega desconhecida em PASS; deve ser preservado mesmo
quando a decisão ficar incompleta. Apenas COMPLETE + required true libera análise.

## Análise e propostas

Reabra a decisão e revalide a entrega antes de ler suas evidências. Considere
somente execução/período e fontes autorizados. Para cada episódio demonstrado,
registre consequência, categoria (produto/ambiente/instrução/execução), hipótese
de causa e recorrência observada. Separe hipótese de fato e desconhecido de zero.

Até três propostas devem ter prioridade, evidência, consequência, causa provável,
ação e critério para observar benefício. Prefira corrigir a fonte de verdade ou
controle já existente. Erro mecânico repetível favorece teste/validação; julgamento
pode precisar de exemplo claro. Antes de propor uma regra, procure a existente e
explique por que a mudança não duplica responsabilidades. Sem evidência
suficiente, identifique a proposta como experimento. Nunca implemente nesta fase.

`retro.md` registra execução, revisão entregue e revalidada, fontes consultadas,
achados, propostas (zero a três), limites, estado COMPLETE/INCOMPLETE e próxima
ação. Se faltarem fontes para uma análise requerida, INCOMPLETE preserva a
conclusão do produto como registro histórico e mantém a pendência pós-entrega.

## Contrato do controle mecânico

A implementação do controle e sua cobertura são uma frente separada em revisão;
a forma contratada é a seguinte. `triageRetro(root, input)` revalida o relatório
de qualidade atual com estágio `delivery` e cada prova relativa `{path, sha256}`.
Não executa comandos contidos no input. Recebe `run_id`, `delivery_report`,
`route: full|short`, `reason`, `evidence` e flags booleanas estritas `requested`,
`opt_out`, `first_pilot`, `significant_failure`, `significant_rework`,
`user_unblock` e `expectedContextDigest` atual de fonte confiável independente
do relatório avaliado. Nunca derive confiança do próprio report. Campo ausente/inválido não é convertido silenciosamente em falso.

O resultado identifica `schema_version: 1`, `run_id`, `delivery_revision`,
`delivery_report`, `delivery_status: PASS|UNKNOWN`,
`decision_status: COMPLETE|INCOMPLETE`, `required: boolean|null`, `triggers`,
`reason`, `evidence` e `errors`. Sem revalidação válida, INCOMPLETE/UNKNOWN/null
preserva a pendência; opt-out explícito é retido sem fabricar PASS.

`validateRetro(root, decision, report, {expectedContextDigest})` valida a análise contra a decisão e provas
atuais. `report` contém `run_id`, `delivery_revision`, `status: COMPLETE|INCOMPLETE`,
`sources` (provas), `findings` (categoria product/environment/instruction/execution,
evidência, consequência, causa e recorrência opcional), `proposals` (zero a três
itens com id, evidência, ação, prioridade e critério de sucesso), `limitations` e
`next_action`. Validade estrutural não comprova correção semântica das causas.
Este controle não concede permissão para executar propostas nem altera delivery.

## Fronteiras de responsabilidade

O registro pós-entrega não substitui testes/review nem vira gate retroativo de
publicação. Corrigir produto segue bug-diagnosis/TDD em demanda separada. Esta
skill não instala ferramentas, altera outras skills, cria rotinas ou se executa
em laço. Um retorno textual de sucesso não é prova de revisão atual; se houver
validador mecânico disponível para a decisão, execute-o e preserve o resultado,
sem alegar que ele verifica sozinho a qualidade semântica das propostas.


A API detalhada do módulo puro é reconciliada pelo contrato canônico vigente antes
da integração final. Este documento descreve responsabilidade, gatilhos e saída;
não afirma que o controle foi implementado ou que a entrega atual foi concluída.
