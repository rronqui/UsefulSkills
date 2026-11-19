# Entrega Git e passagem integrada

Use ship quando entrega Git/publicação faz parte do pedido. Chamador/TDD conclui
entrega local sem inicializar Git/ship/bootstrap. Em ambos, entendimento e
[qualidade compartilhada](../../tdd-orchestrator/references/quality-policy.md)
continuam atuais. New/ship/deploy preservam o motor existente e seus recursos.

Antes de qualquer efeito commit/push/issue/PR/merge/release/deploy, confira ação
e autorização exatas, arquivo/delta, revisão e contexto esperado aprovado
independente. Nenhuma dessas ações autoriza as seguintes por inferência.
Automerge/rollback existentes continuam disponíveis quando explicitamente
autorizados. Não contornar E_UNSAFE_GIT_EXECUTABLE ou grants do runtime.

Roteie mudança simples ao caminho direto proporcional, bug ao diagnóstico e
comportamento complexo ao TDD. Reuse alignment e RED/regressão atuais; não
reiniciar entrevista ou outro ciclo TDD para a mesma prova. No TDD external,
receba resultado, evidências e revisão; ship faz somente sua responsabilidade.
Conflito usa protocolo próprio e revisão do snapshot resolvido antes de efeitos.

Conteúdo final exige eixos de revisão atuais, segurança e documentação, conjunto
exato de retornos e gate, com risco/critério/ambiente vinculados. Aprovação de
conteúdo anterior não acompanha mudança posterior. Retorno inválido/ausente e
controle indisponível não viram PASS/NA. Guardar relatórios brutos e recibos com
source path/hash, sem reescrever schemas/gravidade. Detalhes novos de APIs são
reconciliados no contrato único antes da integração; não inventar opções CLI.

Depois da entrega concluída, ship é único dono da
[triagem retro](../../retro/references/protocol.md) na rota external. TDD não
duplica triagem. Retro não reabre delivery nem implementa propostas. Relatório
final distingue produto entregue, ações externas realmente realizadas, limites
e estado pós-entrega. Instalar skill não publica nem acessa host.
