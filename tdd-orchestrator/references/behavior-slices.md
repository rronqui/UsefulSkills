# Fatias verticais e testes observáveis

Use na especificação/testes de funcionalidade complexa. Short permanece
proporcional; prosa/cosmética reversível não exige RED artificial. Especificação
vigente é única: fatias usam seus IDs, dependências, ondas e recursos.

Divida por comportamento demonstrável ponta a ponta, não apenas por camada.
Cada fatia tem AC, cenário normal/limite/erro, fronteiras, dependências, áreas e
prova. Comece pequena pela maior incerteza. Migração pode exigir expandir,
migrar e contrair, com compatibilidade/reversão/gates próprios.

Spec-kit-author registra; test-author cria teste da interface e regra observável,
com esperado vindo do AC/exemplo independente. Não repetir o algoritmo de produção
no teste nem conferir detalhe interno sem risco. Mocks representam fronteiras
externas/caras com contrato realista; não chamar produção/pago por conveniência.
RED é falha de asserção do comportamento, distinguida de infraestrutura/import.
GREEN cobre todos critérios, refactor preserva comportamento e testes; integre e
valide cada fatia. Não iniciar outro ciclo TDD ao receber diagnóstico válido.

TDD coordena único DAG/barreira conforme [execução](execution-and-resume.md).
Especialidades alimentam o mesmo critério, não criam outra fila/gate.
