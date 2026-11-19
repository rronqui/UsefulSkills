# Revisão independente — integração C/D/E e proveniência

Data: 2026-11-19. Revisão read-only da implementação, com gravação exclusiva deste parecer.
Baseline Git: `0da9310ef8753782869b0aa38975ccfd5368d2f1`; candidato é a working tree com alterações locais, não apenas esse commit. Os hashes abaixo delimitam os arquivos examinados ao encerrar.

## Veredito

**APROVAÇÃO DELIMITADA de C/D/E e da correção documental de proveniência. Nenhum achado P1/P2/P3 válido identificado nesse escopo.** Não é aprovação da integração completa, da onda 3, de Native, de instalação final nos dois sistemas ou de release.

O usuário confirmou durante a revisão que B/native-release continua em edição e determinou revisão B separada após freeze. B está expressamente excluído deste veredito. A leitura e os probes preliminares de B não são usados para aprová-lo. A observação preliminar de fallback comunicada na conversa deve ser reconciliada pelo revisor B com seu candidato congelado, não tratada como revisão final daquele módulo.

## Método e cobertura

Lidos o plano de remediação, os ledgers remediation-filesystem-git, remediation-state-alignment, remediation-provenance, remediation-native e remediation-root, os diffs relativos a HEAD e o código/contratos pertinentes. As disposições dos ledgers foram confrontadas com implementação e testes; seus rótulos de PASS não foram adotados como prova independente.

- **C — filesystem/instalação:** a reserva de quarentena POSIX usa link exclusivo, compara identidade/hash dos aliases antes de remover o nome original e conserva entrada estrangeira em EEXIST. A recuperação do alias próprio antes do unlink e o rollback por descritor preservam a fronteira de diretório; os testes determinísticos cobrem pivôs e preservação. Verify compara desiredHash, incluindo content. sourceScopes vazio nega leitura de source nos dois backends; content permanece independente de source. O planejamento identifica arquivos iguais e o Windows só reabre divergentes para escrita, revalidando identidade/hash. O limite inicial do hook precede readFileSync. A inspeção de hooksPath anterior à normalização rejeita symlink/junction ou prefixo ausente seguido de '..' e mantém o caso seguro com componentes existentes.
- **D — confiança Git:** a sessão reexecuta o probe completo da extensão Windows admitida antes dos spawns posteriores e compara binding, host e closure de objetos/loader. Alterações de DLL, Git e ancestral são negativas exercitadas nas duas factories. O probe tem timeout/maxBuffer limitados. As refs continuam argv com shell:false e restrições estruturais; a ampliação de nomes não cria interpolação. O guard gerado coincide com a fonte única. A preservação do caminho legado nlink=1 é explícita no contrato, não uma omissão nova da correção.
- **E — estado:** RUNNING stale da onda atual produz E_HISTORY e conserva ocupação; um terminal posterior com histórico inválido não libera escritor conflitante. Os testes também mantêm tarefa independente pronta. Os limites dos nomes canônicos e do token AC evitam os falsos positivos especificados. A emenda explícita de contrato permite vários ACs exclusivamente normativos com prova individual; matriz mista, prova ausente/trocada e review sem independência continuam rejeitados. A CLI normaliza contextPath absoluto e conserva confinamento.
- **E — instruções/SpecKit:** review semântico do fluxo normativo DOC → REVIEW → VALIDATE, validator, classificação NA e exemplo separado. O exemplo foi parseado e consumido por validateCriteriaMatrix, com vínculos inversos válidos e globs disjuntos. Alignment exige fronteira/pergunta/rodada e request/run selados, fontes atuais e COMPLETE válido para promover dependentes, sem tratar sucesso de transporte como leitura. T-013C atribui a conferência terminal de AC-001 após T-013B, sem ciclo pré-publicação. A ordem RED/prova da primitive/GREEN dependente e o escritor exclusivo de NOTICE estão explicitados. Não foram criados testes de frases nem reexecutadas tarefas históricas.
- **Proveniência:** SOURCE/AMENDMENTS relacionam FastAPI/Vue a URLs com commit fixado, licença e aviso de modificação. React separa comparação estática de autoria declarada, parecer jurídico, licença e aprovação Native; a antiga referência privada sem transcript não é apresentada como aprovação reproduzível atual. O recibo possui 15 identificações de blobs upstream e 12 hashes locais verificáveis; os 12 hashes raw e LF foram recalculados e conferem.

## Evidência executada nesta revisão

| Verificação | Resultado observado |
|---|---|
| Windows Node 22.23.2 / Vitest 4.1.12: fs-transaction + git-trust + tdd-state + execution + state-evolution + ship-quality-cli | 6 arquivos; **348 PASS, 19 skips POSIX**, zero falhas; 9,20 s. Corresponde a C/D 107 + E 208 + CLI 33. |
| Factory Git real, sem DTO de metadata: check-ref-format de refs/heads/ação-東京; tag com aspas, ponto-e-vírgula, dólar e parênteses; rev-parse --git-dir, na mesma sessão | **3/3 status 0**, stderr vazio; última saída '.git'. |
| node scripts/generate-git-trust.mjs --check | Exit 0; nenhum arquivo regenerado. |
| JSON do exemplo schema 2.3 → validateCriteriaMatrix e vínculos inversos | Duas tarefas válidas, tipos separados e globs disjuntos. |
| Hashes do recibo de proveniência | **12/12 raw e 12/12 LF** iguais ao recibo; inventário upstream contém 15 blobs. |
| git diff --check nos arquivos do escopo, com cr-at-eol | Exit 0. A execução sem essa opção acusa CR de linhas CRLF; não foi apresentada como check limpo nem classificada como defeito funcional. |

A primeira chamada ad hoc à factory Git omitiu suas dependências obrigatórias e retornou TypeError antes de executar Git. A chamada correta forneceu fs/path/crypto/os/spawnSync/windowsHostPath reais, como o instalador, produzindo os três resultados acima. Nenhuma alteração de produção foi necessária.

## Objeções consideradas e limites

1. **Review13-02/KnownDLL:** não reaberto. O descarte é específico aos loads secur32/ucrtbase via INIT_PROC_ADDR/LOAD_LIBRARY_SEARCH_SYSTEM32 no Git fixado, documentados com referência e hashes no ledger; não autoriza confiança genérica em DLLs. Não houve rede nem nova consulta à fonte upstream nesta revisão.
2. **Linux121:** é evidência dirigida anterior declarada pelo ledger, não execução independente desta revisão. O código e os casos POSIX foram examinados, mas os 19 skips do Windows não contam como teste Linux. Esta aprovação de código não renova o resultado Linux nem certifica a matriz final por OS.
3. **15 blobs upstream:** URLs/identidades e limites do recibo foram inspecionados; os corpos upstream não foram obtidos novamente, conforme proibição de rede. Não alego ter recomputado independentemente os 15 Git blob SHAs nem repetido a comparação integral React/upstream. A comprovação independente executada aqui é a dos 12 arquivos locais; a captura upstream permanece evidência atribuída ao ledger/recibo.
4. **Alignment e documentação normativa:** avaliação semântica e integração com o consumidor local, sem alegar execução OMP real. A autorização de vários ACs normativos foi conferida na emenda; não é expansão implícita por teste.
5. **Concorrência filesystem:** verificados os cenários concretos e as garantias delimitadas dos backends. Não se exige nem se afirma ausência universal de corridas ou resistência a administrador hostil.

Nenhuma suíte completa, rede, modelo, novo agente, stage, commit, instalação global, publicação ou alteração de produção foi executada. Os testes usam fixtures descartáveis. A única entrega escrita pelo revisor na árvore de trabalho é este parecer. Mudanças posteriores nos arquivos abaixo exigem avaliação do delta; resultados dirigidos não substituem a revisão B nem a validação final do plano.

## Identidade dos arquivos examinados

SHA-256 dos bytes locais, preservando CRLF/LF; capturados em 2026-11-19T16:55:19.102Z.

| Arquivo | SHA-256 |
|---|---|
| `install.mjs` | `0518558893b2b72193dcb991591c11a1698d1d405e4c29ebcf527c780276db03` |
| `scripts/install-hooks.mjs` | `465573737a321aff83c7d09f2247a14f5d9b1b83797e6f11eac083bd48ecb18b` |
| `scripts/lib/git-trust-source.mjs` | `2e03a0bc661eff978a0d6ce1fa1e2b8a996a904cac4f44894458a806edf45e97` |
| `scripts/hooks/pre-push.mjs` | `f5aba83620b1b5d013cc1dc3e3ef800fbba6f416bb0cb329debeb6718d05bd12` |
| `tdd-orchestrator/lib/fs-transaction/index.mjs` | `ee17ec3327d2bdb10bfcb0ffe20174cb72f374fffb5450088cfefc83076469dc` |
| `tdd-orchestrator/lib/execution.mjs` | `214083b5d9b2cf9edf176c2462f0a10ff43c1acc65e29d0deb8381ada9df2b95` |
| `tdd-orchestrator/lib/state.mjs` | `56be21ecb8f56d5ef505eb964161354c7a9800aa6e877bc1f591f6ceb3615173` |
| `tdd-orchestrator/bin/quality.mjs` | `42b44c538be9d9b0aeabd838e4dc4872b3c5bac5816facd96eccb6f36dc585f2` |
| `alignment/SKILL.md` | `199ff8b2bb5546a1861666905d7098693076fc393a68ef33f81a9c5f65eb56b5` |
| `alignment/agents/requirements-reader.md` | `4dce707a9af220d638ef862c45d723b79834f7dd4185ce05ddcc4af1f7702186` |
| `alignment/references/comprehension-review.md` | `9c40f76171fa2b297dbbb4df7207a27f09175d362f1ac228318f5248d1214bc8` |
| `alignment/references/routing-and-persistence.md` | `2a54023f5973eabf18e763e2922410ac2bbb4ff01e07a9b517bb121a72087c9a` |
| `tdd-orchestrator/SKILL.md` | `fe87e1a7778b3e214056bd3dd0e559920c853f9e5d9884dd035db5f0c8c23d11` |
| `tdd-orchestrator/agents/test-author.md` | `746c8cb81de971c38816aacede3e6494ef337a8291e7968283f23f47c7e809d0` |
| `tdd-orchestrator/agents/validator.md` | `6930a7cb5f488b2a44eb6209b9c2c3849a77e243a52d729e665e9a294b834220` |
| `specs/specs003-convivencia-robusta-skills/tasks.md` | `d2df4fb68a510ac239ebc19754177c0987daeaa6fa97759534f1e3be6a3a869e` |
| `specs/specs005-omp-compatible-release/spec.md` | `6dde43f768c95ecf71b5cede17591910b7f8a4fc8cffbfaecac4a8a4aa255cd8` |
| `specs/specs005-omp-compatible-release/plan.md` | `0daff343c4af21524ac2a78415027db6ad5cdab987f9f259db05a85014f78360` |
| `specs/specs005-omp-compatible-release/tasks.md` | `00b450e51bdf4840c16bcb911e24416461f3649fac2b91bf7daa49bd9a4c065c` |
| `specs/specs005-omp-compatible-release/contracts/interface-contract.md` | `2a9403e90a3cf35143d97427609299bd74183bc320036f2e111b929626839a25` |
| `deep-review/SOURCE.md` | `ff3fa116d91baafb412155fd07137c2c160fc54476496b2f20490f8f29c877cd` |
| `deep-review/AMENDMENTS.md` | `539c27a67965105e6237ae8c17d09dcb000e28f5e2ea31af09ea719d101e9419` |
| `tdd-orchestrator/SOURCE.md` | `707a40e9777053de8d58e3e123d6354e48f0a5b12ba2eb404afeb2fcd9cf07dd` |
| `implementation-evidence/remediation/provenance/public-source-captures.json` | `61a24d41f5f9e943eda453efdb41d15fe95ebd1503fc613b9e947ed40a203901` |
| `scripts/fs-transaction.test.mjs` | `ea9f9cca60f094cecfa8287c1eefbaf722e11b3fcc4d2cca1275ed3a5f2de4d6` |
| `scripts/git-trust.test.mjs` | `a0a672eba10a64ea8036bb956c12c63267fcae45ec004ce2b458672911117ec0` |
| `scripts/tdd-state.test.mjs` | `19a8e28a6cee6a604594f290c266de0de317977196927c766fc4f5bccaa48bb6` |
| `scripts/execution.test.mjs` | `20eaffdde2efb9ddb7dceb98b09736c6f249fdf14f1e09d8bc3ba939a033010c` |
| `scripts/state-evolution.test.mjs` | `98e183adfe2cce411a5647f23577d3cbbbe73fa09169a67a74c02d5e44425f26` |
| `scripts/ship-quality-cli.test.mjs` | `d2dbb217df3538db1328b2450598fc2f16bd4c41a9e6bfb3cc948b594b65832d` |
