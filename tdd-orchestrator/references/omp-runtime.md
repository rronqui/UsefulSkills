# Fronteira OMP observável

Referência de fonte: OMP **18.18.6**, commit
`9058ab9d229663e229e2867824ba6df6f21e9e59`.
[Discovery oficial](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/task-agent-discovery.md)
e [task oficial](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/tools/task.md)
ancoram o desenho; não provam binário/discovery/grants da sessão.

Observe schema antes de usar task: batch/flat e campos condicionais variam.
Agent é tipo; name/ID é instância. Colete job/retorno terminal real. Structured
habilita yield; output sozinho não garante contrato. Preserve schemas e rejeite
retorno incompleto mesmo quando runtime permissivo o aceita. Não enviar campos
ausentes ou inventar label/provider/resolvedModel como parâmetro de task.

No [RPC v18.18.6](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/rpc.md),
o ACK de `prompt`/`task` não é conclusão. Aguarde resultado terminal e sessão
settled; `agent_end` isolado não basta quando há trabalho assíncrono. Subagentes
exigem assinatura de eventos explícita ou leitura dos jobs reais. Falha HTTP
401 é de autenticação, não evidência de schema inválido ou retry técnico.

Confira origem e precedência projeto/usuário/extensões/builtin e colisões,
inclusive definição inválida que suprime fallback. Não sombrear tipos nativos.
Frontmatter tools/spawns não prova sandbox; ferramentas aditivas/overrides podem
alterar autoridade real. Isolamento requer workspace/backend observado.

Execução usa os contratos e APIs existentes do projeto. Modelos são selecionados
somente no frontmatter dos perfis geridos, conforme o contrato canônico e a
referência abaixo; caller, configurações globais e auxiliares OMP permanecem
existentes. Não há API nova de modelos, launcher, SDK ou guard global exigido.
Provas nativas de descoberta/resolução/saída continuam pendentes até execução
na fase autorizada; não inventar wire, flags ou telemetria.
Antes de nova sessão/rota, revalide [política de modelos](model-policy.md) e
[recursos/retomada](execution-and-resume.md). Leitura e fixtures não são E2E.
