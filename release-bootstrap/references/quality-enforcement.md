# Integração de qualidade em CI e releases

Use ao preparar maquinário solicitado, não em toda entrega local. Leia a
[política única](../../tdd-orchestrator/references/quality-policy.md), examine
jobs/hooks/comandos atuais e preserve versões/proteções/recursos existentes.

Configure o gate já existente antes dos efeitos autorizados; não crie outro
motor de review. Separe checks locais, CI e ruleset obrigatório: hook pode ser
contornado e job não obrigatório não impede merge. Demonstre na plataforma quais
checks/regras estão ativos; sem acesso, reporte proposta/configuração local.

Runner confere baseline/origem, inventário/contexto esperado de fonte confiável,
provas atuais, documentos, segurança e revisão independente. Não gerar aprovação
confiável a partir do próprio relatório. Planejamento não exige receipt de review
futuro. Na entrega, controlos obrigatórios sem ferramenta/prova bloqueiam;
NA só por conteúdo inaplicável. Escopo de segredos/dependências inclui pipeline
e ferramentas de desenvolvimento relevantes, sem valores em logs.

Audite compatibilidade dos hooks antes de instalar; preserve hooks alheios e
alteração concorrente, sem remoção/force por conveniência. Mudanças em rulesets,
GitHub/remote e publicação exigem autorização correspondente. Ship continua dono
de operação Git; host Linux é fluxo separado. Prove cenário positivo e falha
negativa em ambiente isolado pertinente; não anuncie enforcement servidor por
arquivo YAML ou documentação apenas. Migração legada mantém aviso e estado
anterior, sem alegar política nova ativa antes da conferência.
