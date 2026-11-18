---
name: retro
description: Analisar uma entrega concluída, falhas relevantes ou retrabalho com evidências e propor até três melhorias de processo. Use para retrospectiva solicitada e para a triagem pós-entrega de ship ou TDD standalone; não implementa propostas, não reabre produto entregue nem cria monitoramento recorrente.
---

# Retrospectiva com evidências

Esta skill cuida da aprendizagem após entrega. `ship` continua dono da publicação,
`tdd-orchestrator` do desenvolvimento e `bug-diagnosis` de defeitos do produto.
Não é outro orquestrador. Leia [o protocolo](references/protocol.md) antes da
triagem ou execução; ele é a fonte dos gatilhos, artefatos e condições de avanço.

1. Identifique execução, escopo autorizado, revisão entregue, relatório de
   qualidade e evidências. Revalide a entrega atual pelo gate já usado pelo
   chamador antes de considerar a decisão completa.
2. Registre `retro-decision.json` separado dos gates de produto. Respeite pedido
   explícito de não executar; falta de prova resulta em `INCOMPLETE`, nunca em
   dispensa silenciosa. Apenas `COMPLETE` com `required: true` inicia análise.
3. Reabra a decisão e reconfirme as provas antes de analisar. Distinga problema
   de produto, ambiente, instrução e execução; consulte apenas fontes autorizadas.
4. Registre em `retro.md` achados e até três propostas priorizadas, cada qual com
   evidência, consequência, hipótese de causa e critério verificável de benefício.
   Sem problema demonstrado, zero propostas é uma conclusão válida. Não invente
   duração, custo, recorrência ou economia.
5. Preserve a entrega e reporte separadamente o estado da retrospectiva. Proposta
   não é melhoria implementada. Aplicação de qualquer proposta entra em demanda
   própria com escopo, autorização, revisão, testes e versionamento pertinentes.

Use leitura progressiva e referências por caminho no OMP. Se a análise for
delegada, observe o schema real `task`, slots, resultados terminais e permissões;
não crie novo agente permanente. A skill não concede escrita no produto,
configuração, perfil, memória, agenda ou serviços externos.

Conclusão: decisão completa com prova atual, análise quando requerida, no máximo
três propostas verificáveis, nenhuma autoalteração e pendências explícitas. Falha
pós-entrega não desfaz aprovação histórica, mas impede chamar o ramo inteiro de
sucesso. [Origem e licença](SOURCE.md).


## Política e modelos

Use [contexto e provas](../deep-review/references/fresh-review.md) e
[política única de modelos](../tdd-orchestrator/references/model-policy.md) quando
análise exigir inferência adicional. Não reabra execução TDD ou altere perfil.
O protocolo distingue UNKNOWN de zero; julgamento de causa continua semântico,
mesmo com controle puro válido. Fixtures documentais não são uma retro executada.
