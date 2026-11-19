# Instruções executáveis por agentes

Use para escrever/revisar skills, papéis ou guias. Não instala nem registra
pacotes. Leia versão atual, instruções superiores, contratos consumidos e
responsabilidades próximas antes de editar. Uma responsabilidade principal por
entrypoint; referências fornecem conhecimento, sem outro orquestrador.

Descrição deve separar gatilho positivo e pedido vizinho: “busca estrutural em
código com linguagem confirmada” distingue AST de “buscar uma palavra”. No
corpo, indique entrada necessária, ordem das decisões, ações permitidas,
saída/consumidor, tratamento de evidência ausente e condição de conclusão.
Escreva passos observáveis (“compare revisão do retorno com snapshot”) em vez
de adjetivos (“faça revisão rigorosa”).

Mantenha no entrypoint o necessário para começar; cada link diz quando carregar
a referência. Referências locais usam caminho relativo; skills irmãs são
resolvidas no catálogo atual quando instaladas em raízes diferentes. Uma regra
tem uma fonte de verdade: consumidores apontam para ela. Não duplicar política
de qualidade ou modelos para tornar cada texto aparentemente autocontido.

Preserve schemas, fases, erros e protocolos validados por código. Distinga campos
do briefing/envelope local de campos aceitos pelo runtime. Não importar flags,
nomes de ferramenta, caminhos pessoais ou modelos de outro host. Disponibilidade,
slots, grants, preços e APIs voláteis precisam de observação atual. Texto de
toolset não comprova sandbox, nem novo nome de papel comprova independência.

Faça simulação de mesa com: gatilho positivo; vizinho negativo; entrada
incompleta; ferramenta ausente. Registre fonte, decisão prevista, conflito/lacuna
e revisão feita. Exemplo: pedido só de prosa usa short e validação documental;
não agenda TDD/host. Isso testa instrução, não inferência de todos os modelos.
Valide links locais, uma fonte por regra, licenças/avisos e compatibilidade dos
consumidores. Instalação segue mecanismo OMP autorizado e revisão do pacote;
nunca editar uma cópia instalada para ocultar drift. [Origem](../SOURCE.md).
