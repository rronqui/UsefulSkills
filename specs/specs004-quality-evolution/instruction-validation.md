# Conferência das instruções

## Leitura e escopo

Foram lidos os sete SKILL.md completos, os oito agentes TDD, deep-reviewer,
README, contrato de estado/API e consumidores relevantes de revisão. A leitura
dos trechos de schema e promoção foi repetida após a mudança 2.3 para reconciliar
os protocolos. O frontmatter OMP e os formatos de saída nativos foram preservados.
As fontes oficiais de descoberta, skills e task estão citadas em
[omp-compatibility.md](../../docs/omp-compatibility.md).

## Simulação de mesa

| Pedido ou condição | Rota esperada | Conferência |
|---|---|---|
| Nova regra de autorização | alignment → TDD; baseline/risco; RED; docs; review; gates | Existe responsabilidade por código, teste, documento e revisão; P0/P1 aberto não libera |
| Correção de texto sem mudança funcional | Caminho trivial do ship; delta `none` com razão; revisão proporcional | Não cria TDD artificial nem novo orquestrador; mantém classificação/documentação pertinentes |
| Pedido com decisões abertas | alignment mantém checkpoint bloqueado até resposta | Nenhuma resposta é inferida; fatos do ambiente são buscados pelo agente |
| Scanner obrigatório ausente | Método equivalente verificável ou gate FAIL/TOOLING | Ausência de ferramenta não produz NA nem PASS |
| Documentação alterada após REVIEW | DOC devolve conteúdo alterado à revisão antes de VALIDATE | Não exige revisão antecipada dos documentos futuros |
| Batch off, async on ou isolamento não exposto | Adaptar chamada ao schema, coletar resultados; serializar escritores sobrepostos sem isolamento | Atribuição/job/configuração não prova execução |

## Conferência mecânica local

Os nove blocos JSON concretos nos arquivos de instrução/documentação foram
parseados sem falha após corrigir o exemplo de batch que carecia de `context`,
`solutionSpace` e fechamento de array. `git diff --check` retornou zero; os arquivos
lidos não contêm caractere de substituição Unicode. Esses checks conferem formato,
não execução real de agentes OMP.

## Limites

Esta conferência é autoria e simulação de mesa, não revisão independente nem
certificação de todas as versões, tecnologias e modelos OMP. A aprovação do
contrato depende de revisão contra o motor final e de suas regressões. Não houve
instalação, commit, publicação ou deploy por esta frente.
