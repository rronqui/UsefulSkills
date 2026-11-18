# Execução, recursos e retomada no estado existente

TDD é o único dono de DAG, ondas, tentativas, checkpoints, escrita de estado e
completude. Use IDs e schema2.3 existentes; lib/state.mjs e contrato canônico do
produto são a autoridade mecânica. APIs de execução validam observações no fluxo
existente, sem despachar ou promover. Modelos pertencem ao frontmatter dos perfis
geridos conforme a [referência única](model-policy.md), sem nova API de modelos,
launcher ou política global. Prova nativa continua pendente até a fase autorizada;
não invente assinatura/CLI. Esta referência não implementa scheduler.

Antes de despacho/retomada, observe schema task batch/flat, async/isolation/yield,
slots/configuração do runtime e política de modelos. Valide IDs únicos,
dependências conhecidas/acíclicas, predecessores e revisões atuais, recursos e
resultados esperados. Plano auxiliar só quando schema fechado exigir, ligado por
run/revisão/hash ao progress e revalidado antes da promoção.

Recursos não são apenas globs: normalize paths reais, caixa/aliases, pai/filho,
worktrees, caches, outputs, banco, estado, temporários, instalação e host. Um
escritor por recurso; isolamento é backend/workspace observado, não promessa
do briefing. Sem ele, serialize conflitos e aproveite todas frentes independentes
prontas até capacidade real, sem teto extra arbitrário. Leitores não escrevem
caches sem declaração. Pai não integra enquanto filho escreve o mesmo recurso.

RUNNING exige dono/instância e job/processo atuais observados; atribuição,
timestamp ou plano não bastam. Colete terminais reais e hashes dos artefatos.
Completude compara conjunto exato de IDs/tarefas/retornos, não contagem: ausente,
duplicado, stale, erro ou predecessor mudado bloqueia consumidor. Integração e
revisão/validação atuais são necessárias depois dos retornos. Não reusar resultado
do snapshot anterior no conteúdo integrado modificado.

Falha técnica: preserve diagnóstico e tentativas no mesmo task/run. Após terminal
anterior, só nova instância/job por tentativa com modelo OpenAI autorizado e cap
de três vigente. Nunca reutilizar ID terminal como sucesso posterior ou trocar
identidade para zerar cap. Falha de shell/config/auth não autoriza escalada de
solução/modelo ou contorno de política. Falha de uma frente libera continuidade
das independentes; encerre tarefa como falha/incompleta quando provas faltarem.

Na retomada, confira dono, recurso e job real antes de relançar. Preserve histórico,
revalide revisão, ferramentas, capacidades, política e permissões. Migre2.1/2.2
explicitamente para2.3; mantenha mapas válidos e evidência. Onda legada completed
sem prova suficiente volta integrating pela migração;2.3 inválido não se corrige
rebaixando versão. Preserve validateProgress/migrateProgress/canPromoteWave.
Para promover, use os AC globais do progresso e o gate atual; não criar chave
silenciosa ou apagar achado de outra revisão para satisfazer aggregate vazio.

Antes de parar, estado atualiza tarefas concluídas/falhas e registra responsável,
fase, evidências, processo/job observado, próxima ação e mecanismo existente de
retomada. [Handoff](handoff.md) é índice legível, não gate. Não criar rotina,
daemon ou segundo scheduler. Tempo/custo/retrabalho só medidos; ausentes ficam
desconhecidos. O mecanismo de retomada só é prometido se verificado.
