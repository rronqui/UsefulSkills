# Revisão independente delimitada — conjunto root A/F/G e integração

Data: 2026-11-19. Revisão somente leitura do working tree, sem edição de
implementação e sem subagentes/suíte completa. Não inclui o conjunto E nem a
proveniência implementados pelo mesmo revisor.

Resultado final desta revisão: **aprovação estática delimitada, sem achado
concreto válido aberto**. Um P2 foi comunicado e corrigido diretamente pelo
integrador durante esta mesma revisão, conforme registro abaixo. Isso não é
aprovação de Linux real, CI hospedado, OMP/Native ou candidato final.

## P2 corrigido — probe de Python executava fora do contexto contratado

Arquivo: `ship/bin/lib.mjs`, `requireBackupPrerequisites`, linhas 274–277 no
candidato examinado. Referência contratual: specs005
`contracts/interface-contract.md`, seção backup Linux, linhas 535–537.

O novo probe executa `spawnSync("python3", ["-I", "-S", ...], options)` sem `env`
nem `cwd`. Portanto escolhe o programa pelo PATH herdado e permite que esse
processo auxiliar carregue no ambiente herdado completo, inclusive `LD_*`.
O retorno `sys.executable` e a conferência de arquivo regular só acontecem após
essa execução e não estabelecem que o programa já executado era Python do OS.

O contrato existente autoriza somente Python3 do OS em contexto protegido e
allowlist scrubbed sem PATH/PYTHONPATH/PYTHONHOME/LD_*. `-I/-S` não limpa o
ambiente do loader do executável. O helper principal já usa cwd `/` e ambiente
limitado a LANG/LC_ALL; o probe introduz uma execução nova fora dessa fronteira.
Isso contraria o plano de preservar os controles ao resolver a portabilidade
do intérprete e pode executar um `python3` de PATH não admitido antes de stop.

Prova mínima sintética, sem executar processo externo: uma invocação Node
isolada substituiu spawnSync por gravador, sincronizou o export builtin e
projetou process.platform como linux. Ao chamar a função real, observou:

```json
{"fixtureOnly":true,"errorCode":"E_BACKUP_PREREQUISITE","callCount":1,"command":"python3","hasExplicitEnvironment":false,"hasExplicitCwd":false}
```

Correção esperada: resolver/admitir o intérprete do OS antes de executá-lo;
executar o probe no mesmo cwd protegido e allowlist de ambiente do helper,
mantendo limite de tempo, erro controlado e falha antes de parar serviço.
Conferir no Linux real o caminho suportado e um caso de pré-requisito ausente
que preserve serviço/arquivos. Não se exige adulterar instalação ou executar
código malicioso para essa prova.

### Correção observada durante a mesma revisão

O integrador alterou diretamente a função: somente os candidatos absolutos
`/usr/bin/python3`, `/usr/local/bin/python3` e `/bin/python3` são considerados;
realpath do executável e ancestrais são inspecionados como uid 0, sem escrita de
grupo/outros, e o programa precisa ser arquivo regular executável. Probe e
helper usam cwd `/` e env limitado a LANG/LC_ALL. O sys.executable observado
precisa resolver para o mesmo intérprete admitido. As instruções Ship foram
alinhadas com instalação protegida, sem exigência de PATH do caller.

O revisor leu essa correção e invocou novamente a função real com FS/processo
sintéticos, sem executar subprocesso. Observou comando absoluto, env
`{"LANG":"C","LC_ALL":"C"}`, cwd `/` e timeout 10000. Isso resolve o achado
de herança/admissão no escopo inspecionado. A projeção sintética não substitui
a operação de backup Linux real nem prova todas as plataformas de instalação.

## Escopo examinado sem outro achado concreto

- Protocolo TDD recusa APROVADO com P0/P1 e mantém validação/diagnósticos;
  documentação inclui aggregateReviewInstances.
- Configuração atual e bootstrap ativam explicitamente report/context/policy.
- Revalidação quality percorre todos os proofs consumidos antes de devolver a
  decisão e mantém confinement e hashes; regressões observadas cobrem troca de
  contexto, receipt e fonte pelo seam existente, sem alegação universal de CAS.
- Sanitização cobre atribuição indexada, AWS STS e reset de YAML explícito;
  testes verificam ausência de segredo e preservação de diagnósticos. Predicado
  determinístico e limite dos bullets de operação foram corrigidos sem suíte nova.
- Parsing de new e body-file repetido falha antes de efeitos; comparação SemVer
  considera prerelease/build e política single/multi-package permanece explícita.
- CI mantém privilégios read-only, verifica issue real por API, restringe a
  exceção release-please, fixa Node e scanner/checksum e prepara dependências
  antes da matriz Windows/Linux. A configuração é inspecionada; a execução CI
  real não foi presumida.
- Os três ledgers públicos deixam de renovar whole-Native por equivalência
  derivada e removem caminhos privados preservando hashes e classificação
  histórica. Os nomes portáveis são explicitamente locators de artefatos não
  incluídos; não se afirma que os raw reports estejam no repositório.
- As duas correções PostgreSQL distinguem PREPARE SQL do protocolo e tratam
  Seq Scan como hipótese contextual, sem diagnosticar índice ausente por si só.

Os resultados dirigidos informados pelo integrador (367 testes e 80 Ship/CI)
foram considerados contexto, não execuções independentes deste revisor. A prova
Linux do backup e os gates finais continuam necessários na integração final.
