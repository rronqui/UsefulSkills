# Modelos dos agentes nomeados

Skills orientam o agente chamador; não declaram modelo próprio. A seleção do
pacote pertence somente ao frontmatter `model`/`thinkingLevel` dos perfis
geridos, com principal e fallback `openai-codex` concretos por papel. O mapa único
fica no contrato de desenvolvimento do checkout:
`specs/specs005-omp-compatible-release/contracts/interface-contract.md`, seção
"Decisão de provider e mapa canônico (0.4.0)". Esse artefato pertence ao repositório,
não à instalação runtime da skill; consulte-o ao revisar perfis, sem manter outra
tabela de candidatos nesta referência.
Preserve os nove originais e os três papéis adicionais aprovados, com seus nomes,
ferramentas, fases, autoridade e protocolos de saída. Não crie perfil por skill.

O provedor fixado exige autenticação válida no `openai-codex`; login em outro
provedor não autentica esses candidatos. A decisão explícita do release mantém
as famílias e níveis por função, sem mudar o Root, aliases globais ou enviar
override de modelo por chamada. HTTP 401 é falha de autenticação e
`usage_limit_reached` é limite de uso: ambos bloqueiam a execução afetada, não
autorizam retry técnico e não comprovam defeito no schema. Não trocar provider
ou candidatos para transformar esse bloqueio em uma prova favorável.

Antes de usar um perfil, confira discovery e precedência projeto/usuário no OMP,
a origem/hash da definição selecionada e candidatos/`thinkingLevel` no catálogo
atual. Ambos os candidatos precisam admitir o mesmo nível. Substituir `@slow`
no próprio perfil não altera o alias global. A chamada `task` escolhe o papel
pelo campo `agent`; `name` identifica a instância. Não adicionar `model` ao
wire como requisito para essa seleção. Use batch quando exposto/habilitado e
flat no caso contrário, preservando os resultados nativos.

Registre separadamente requested (perfil e hash), resolved (definição/candidato
escolhidos, quando observáveis) e observed (metadados reais do job). Configuração,
catálogo e relato do agente não provam execução: metadado ausente permanece
`actual:null`/`observation:unverified`. Pedido de esforço também não prova
esforço efetivo. Falha de discovery, candidato ou saída bloqueia a rota afetada,
com diagnóstico original; frentes independentes podem continuar.

O fallback nativo usa os candidatos concretos do mesmo perfil e a semântica OMP.
Recuperação técnica TDD é distinta: após FAIL terminal elegível de solução ou
capacidade, use nova instância/job, preservando tarefa/run/histórico e cap de três
tentativas. Auth/network/quota/tooling/configuration não autorizam escalada
técnica. Perfil inadequado exige diagnóstico e revisão autorizada do próprio
perfil, sem override global ou por chamada para contornar a fronteira.

Sessão principal/caller, títulos/rótulos, scout, advisor, prewalk, compactação e
outros auxiliares/builtins permanecem sob OMP e configuração existente do usuário.
Não os copiar, sombrear, desligar ou reconfigurar para controlar modelos. Este
pacote não exige launcher, extensão, SDK, Bun, política global, grants novos ou
guard universal. A proposta ampla anterior não rege esta integração.

Discovery, resolução e resultados reais exigem provas nativas na fase
autorizada; leitura/fixtures não são piloto. O contrato canônico NATIVE-01–10
delimita essas provas. Há capturas de execução dos doze papéis e de saídas
TDD positivas/negativas aceitas pelo consumidor real. Uma saída malformed
corrigida pelo produtor não demonstra rejeição nativa; os negativos derivados
do consumidor são registrados separadamente. O fallback nomeado de capacidade
foi observado com duas instâncias e consumidor real; isso não comprova fallback
de modelo/provedor. Serving físico e fallback de provedor permanecem **NÃO
OBSERVADOS**, limite de observabilidade explicitamente aceito para esta entrega
no contrato do checkout. Essa decisão não os converte em PASS observado nem
autoriza mudar os doze perfis. A avaliação integrada e o retry técnico ainda
exigem suas próprias provas; capturas parciais não aprovam o release.
O modo `TDD_PEER_REVIEW` preserva APROVADO/BLOQUEADO; o deep-review incremental
e seu fallback usam VALID. Texto legado não é alternativa ao yield nativo.
Metadados de modelo inicializados pelo cliente a partir do candidato solicitado
não atestam o modelo servido pelo endpoint. Não afirmar sandbox, custo,
latência ou qualidade sem prova observada.
[Runtime e fonte OMP](omp-runtime.md).
