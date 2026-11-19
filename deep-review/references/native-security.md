# Parecer security-reviewer do runtime

Reutilize condicionalmente o builtin OMP para análise estática de segurança,
após conferir discovery/origem/toolset, autorização e compatibilidade reais,
sem shadowing. Preserve modelo e configuração OMP existentes: o mapa OpenAI do
pacote cobre somente os doze perfis geridos, não este builtin ou serviços internos.
Não distribuir cópia, desligar ou reconfigurar security-reviewer para selecionar
modelo. Registre metadados efetivamente disponíveis; dado ausente é null/unverified,
não execução inferida. Se o parecer opcional faltar ou for incompatível, preserve
diagnóstico e use a revisão independente existente para os controles obrigatórios;
ausência não é NA nem revisão automática do autor.

O parecer tem schema próprio, com coverage_summary/findings/severity, caminhos,
evidência, cobertura e limites. Preserve retorno bruto, identidade de instância,
revisão, finalidade, fontes path/hash e gravidade. Ele não executa scanner de
segredos/dependências nem substitui threat-model, requisitos/testes de segurança,
ou revisão consolidada. Não adicionar ferramentas operacionais ao revisor para
que aprove a própria alteração.

O coordenador vincula parecer por recibo auxiliar ao gate existente. Nunca
rebatizar resultado como DEEP_REVIEW/VALID, inventar yield ou inseri-lo em
aggregateReviewInstances como deep-reviewer/peer-reviewer. High/critical aberto
continua bloqueio; não existe conversão automática para P2/P3. Se apresentar
prioridade consolidada, mantenha severidade original e razão independente.

Fontes oficiais de versão/commit, fronteiras de modelo e discovery estão em
[runtime](../../tdd-orchestrator/references/omp-runtime.md) e
[política de modelos](../../tdd-orchestrator/references/model-policy.md).
Nenhum desses documentos comprova execução instalada por leitura.
