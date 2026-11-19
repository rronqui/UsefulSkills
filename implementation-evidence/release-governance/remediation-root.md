# Remediação — qualidade, sanitização, ship e integração

Data: 2026-11-19. Escopo: plano Windows/Linux aprovado, sem atualização manual
de versão. Evidências completas de execução ficam em `.omp/remediation/`;
os resumos finais devem declarar revisão e hashes, sem paths privados de host.

| ID | Disposição local | Verificação |
|---|---|---|
| Review16-01 | Corrigido | ship.config ativa policy 1, report e contexto independente; CLI quality positivo e rejeições. |
| Review06-01 | Corrigido | whole_native_approved histórico não promove o candidato; escopo restrito às fontes capturadas explicitado. |
| Review06-02 | Corrigido | Ledger de plataforma usa filenames e hashes retidos; paths privados removidos inclusive de diagnósticos. JSON parse válido. |
| Review06-03 | Corrigido | QA público usa locators portáveis com semântica de disponibilidade; hashes e resultados históricos preservados. |
| Review08-01 | Corrigido e verificado | APROVADO com P0/P1 rejeitado; BLOQUEADO válido preservado; protocolo e regressões positivas verdes. |
| Review08-02 | Corrigido | Lista de exports inclui aggregateReviewInstances com assignments; API existente e testes do consumidor. |
| Review11-01 | Corrigido | Manifesto de bootstrap inclui mesmos campos obrigatórios de qualidade. |
| Review11-02 | Corrigido localmente | CI quality executa Gitleaks fixado com checksum e npm audit high; matriz Windows/Linux Node22 fixado e npm ci. Execução hospedada integra entrega final. |
| Review11-03 | Corrigido e verificado localmente | CI valida referência de fechamento contra issue real da API, rejeita PR/não existente/placeholders; exceção release-please exige origem, autor, branch, título e label. |
| Review09-06 | Corrigido | Recipe distingue SQL PREPARE/EXECUTE de protocolo e configuração do PgBouncer; revisão semântica com documentação primária. |
| Review09-07 | Corrigido | SeqScan, buffers e filtro descritos como observações para investigar, sem diagnóstico automático de índice/memória. |
| Review15-01 | Corrigido e verificado | AWS STS sintético em stdout e trace; regras de scanner e redaction cobrem ASIA/AKIA. |
| Review15-02 | Corrigido e verificado | Expressão determinística documentada exercitada com ambiente falso, taxa zero, amostra insuficiente e taxa abaixo do limiar. |
| Review15-03 | Corrigido e verificado | Leitura de bullet termina no próximo bullet ou heading; testes não consomem instrução de outra operação. |
| Review12-01 | Corrigido e verificado | Atribuições indexadas sensíveis removidas de stdout e trace; diagnósticos preservados. |
| Review12-02 | Corrigido e verificado | YAML explícito escalar encerra estado; diagnóstico indentado posterior preservado. |
| Review03-01 | Corrigido e verificado | Parser new rejeita opções/posicionais não consumidos antes de efeitos. |
| Review03-02 | Corrigido e verificado | body-file duplicado bloqueia antes de ler arquivos/publicar. |
| Review03-03 | Corrigido e verificado | Uma unidade exige include-component-in-tag=false; múltiplas exigem true. |
| Review03-04 | Corrigido e verificado | SemVer incluindo prerelease/build respeita piso initial-version, sem alterar versão do pacote. |
| Review03-05 | Corrigido e verificado | Python de sistema protegido e isolado >=3.8 resolvido antes de stop e rechecado para backup direto; preflight negativo e backup real Linux passaram. Ensaio descartável comprovou deploy/rollback com DB e snapshots preservados. |

Review07-01 também toca quality.mjs: revalidação final de todos os proofs
(relatório/contexto/receipts/fontes). Regressão determinística troca cada classe
de artefato após consumo e exige bloqueio; ledger Native mantém o ID canônico.

Runner: Node Windows22.23.2/Vitest4.1.12 atual coleta e executa; arquivo
representativo deep-review65/65 passou antes de alterações. A falha histórica
27/27 não reapareceu no candidato atual; não se atribui causa retrospectiva ou
upgrade desnecessário. Node padrão WSL era wrapper Windows; validação Linux usa
executável nativo observado. Suporte continua limitado às combinações executadas.

Provas dirigidas observadas: root-followup367/367, ship-and-ci80/80; esses
resultados antecedem o candidato final e não substituem suíte final ou revisão.
Auditoria npm: zero vulnerabilidades reportadas, consulta datada, sem garantia
de inexistência de vulnerabilidades. Scanner permite somente oito fingerprints
de fixtures sintéticas HITL revisadas, sem exclusão genérica de testes.
