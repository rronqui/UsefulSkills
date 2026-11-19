---
name: architecture
description: Avaliar fronteiras, dependências, contratos e migrações de um sistema real; criticar especificação estrutural antes de implementar. Use em arquitetura/refatoração estrutural e APIs incertas; não substitui revisão de defeitos ou coordenação TDD.
---

# Arquitetura proporcional

Entregue decisão verificável ou recomendação de manter a estrutura. Reutilize
alignment e a [política comum](../tdd-orchestrator/references/quality-policy.md).
Mudança simples pode receber SKIP justificado pelo chamador; disponibilidade de
um papel não agenda chamada.

1. Delimite objetivo e leia glossário/ADRs/restrições atuais. Identifique entradas,
   consumidores, invariantes, dependências e testes reais; histórico é pista.
2. Procure responsabilidade espalhada, invariantes repetidas pelo chamador,
   interfaces que expõem detalhes e fronteiras que impedem teste útil. Cite
   arquivos e um cenário do custo atual. No teste de remoção mental, pergunte
   se a complexidade reaparece em vários consumidores ou só some indirection.
3. Defina comportamento público, erros, ordenação, efeitos, falhas parciais e
   limites relevantes. Para API, leia [contratos](references/api-contracts.md).
   Compare manter com alternativa concreta; segunda alternativa independente
   apenas quando a incerteza importar. Não impor camadas/tamanho por estética.
4. Examine todas as capacidades afetadas para distribuir papéis: tipo existente,
   referência ou tipo próprio exigem justificativa de propósito/ferramentas/
   autoridade/saída. Independência é da instância, não do modelo ou template.
   Preserve os nove tipos originais; não crie outro coordenador de execução.
5. Proponha migração incremental/reversão com consumidores e provas por etapa.
   Para desenho relevante ou contrato incerto, leia [crítica prévia](references/spec-review.md).
6. Retorne situação atual, opções, decisão proposta, tradeoffs, recursos, riscos,
   confiança, fontes e verificação necessária. Diagrama curto pode ajudar.

Use [architect](agents/architect.md) para contrato durável de análise. Quando
risco, fronteira ou independência justificarem delegação, use a mesma ferramenta
nativa `task`, com `agent: "architect"`, escopo/fontes/revisão e finalidade
proposta ou crítica explícitos; recolha o parecer antes de consolidar o contrato.
Crítica independente usa outra instância. Reutilize análise atual equivalente;
caller/referência basta no caso simples, com SKIP fundamentado quando aplicável.
Architect é somente leitura; spec-kit-author
escreve o contrato único. Análise não aprova código, não escreve testes/progresso
nem cria DAG. Implementação autorizada segue TDD/diagnóstico e revisão existente.
Mantenha cobertura ao mudar fronteiras; exclusão de testes não é efeito implícito.

Verificação: benefício ligado a problema observado, consumidores examinados,
compatibilidade e recuperação testáveis, hipóteses distinguidas de execução.
[Origem e licenças](SOURCE.md).
