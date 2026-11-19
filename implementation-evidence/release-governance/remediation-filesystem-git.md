# Remediação de filesystem, instalação e confiança Git

Escopo: ondas 1 C/D do plano Windows/Linux, em 2026-11-19. Os diffs locais anteriores de `fs-transaction/index.mjs` e `fs-transaction.test.mjs` foram preservados. Nenhuma instalação global, alteração do Git instalado, publicação, stage ou commit foi feita nesta execução.

## Disposições dos apontamentos

| ID | Disposição | Correção ou evidência concreta |
| --- | --- | --- |
| Review01-02 | Corrigido e verificado | O ramo POSIX `verify` compara `desiredHash(operation)`, que inclui `content`, com o hash capturado do destino. Regressão positiva com content idêntico readonly, negativa com content diferente e regressão anterior de origem alterada após o plano. Windows e Linux reais exercitados. |
| Review01-03 | Corrigido e verificado | `sourceScopes: []` agora nega operações de leitura de `source` nos dois backends. O padrão Windows já negava; POSIX passa a negar também. Operações com bytes `content` não leem uma origem e continuam funcionando. Todos os consumidores de instalação fornecem escopos explícitos. Teste confirma ausência de publicação e de diretório transacional após rejeição. |
| Review14-01 | Corrigido e verificado | Quarentena POSIX usa `linkSync` exclusivo, valida identidade/hash de ambos os aliases e só depois remove o nome original. `EEXIST` preserva a entrada estrangeira. Recuperação remove apenas o alias próprio comprovado quando a falha precede o unlink. A seam determinística já existente cria a reserva estrangeira após o ENOENT; Linux confirma preservação de bytes e identidade do destino e da reserva. Regressões anteriores de pivot/rollback permanecem verdes. |
| Review02-01 | Corrigido e verificado | Inspeção dos componentes de `core.hooksPath` ocorre antes de `path.resolve`. Symlink/junction ou componente ausente seguido de `..` falha fechado, preservando os destinos possíveis. `..` com componentes anteriores existentes e sem links continua aceito. Não se afirma que o destino lexical seja o destino efetivo do Git no caso ambíguo. |
| Review02-02 | Corrigido e verificado | Skills, agentes e NOTICE usam hash/equality também no planejamento Windows. Arquivos iguais recebem `verify`, sem classificação artificial como atualização. O backend Windows abre os destinos inicialmente para leitura; somente os divergentes são reabertos para escrita, com identidade/hash revalidados. POSIX não exige W_OK para verify. Reinstalação de arquivo readonly preserva inode, mtime, modo e conteúdo nos dois OS. |
| Review02-03 | Corrigido e verificado | O tamanho de `lstat` é limitado antes de `readFileSync` da fonte do hook; a checagem pós-leitura e a detecção de mudança permanecem. Fixture de 8 MiB + 1 é recusada antes da instalação de qualquer wrapper/sidecar. |
| Review13-01 | Corrigido e verificado | Cada spawn posterior da sessão Windows admitida recolhe e valida novamente o inventário completo: wrapper, Git, aliases, DLLs, ancestrais, ACLs e resolução do loader. A closure é comparada com a admissão inicial, além da observação independente do candidato. Mudança de hash de Git/DLL ou identidade de ancestral bloqueia antes do segundo spawn. Casos rodam na fonte e no factory materializado no pre-push. |
| Review13-02 | Improcedente com evidência | Os dois nomes excepcionados pelo coletor, `secur32.dll` e `ucrtbase.dll`, são carregados no Git fixado por `INIT_PROC_ADDR`; o helper usa `LoadLibraryExA` com `LOAD_LIBRARY_SEARCH_SYSTEM32`. Uma DLL no diretório da aplicação não precede esses carregamentos. Não se implementou um bloqueio com base nessa hipótese falsa. Imports com busca padrão continuam sujeitos às verificações existentes; KnownDLLs e ACLs do ambiente são observados pelo probe real. Veja as fontes imutáveis abaixo. |
| Review13-03 | Corrigido e verificado | A validação de refs aceita Unicode e caracteres legítimos de Git mantendo restrições estruturais de refs e tuplas somente leitura. Nomes remotos hierárquicos também são aceitos. Não há interpolação em shell: o spawn mantém argv, `shell:false`, stdout, stderr, input e status. Operação Git Windows real confirmou refs com Unicode, aspas, ponto-e-vírgula, dólar e parênteses. |
| Review13-04 | Corrigido e verificado | Todos os probes PowerShell da admissão têm timeout de 30 s e maxBuffer de 4 MiB. Timeout retorna erro terminal controlado de confiança, sem executar Git nem escrever no candidato. A fonte única regenerou o guard do pre-push; `generate-git-trust.mjs --check` passou. |

## Verificação dirigida

Nenhuma suíte completa foi executada por este módulo. Resultados abaixo são dirigidos; não certificam a integração final ou todo o produto.

| Ambiente | Comando/seleção | Resultado |
| --- | --- | --- |
| Windows x64, Node 22.23.2, Vitest 4.1.12 | `node node_modules/vitest/vitest.mjs run scripts/fs-transaction.test.mjs scripts/git-trust.test.mjs` | 107 PASS; 19 casos exclusivos POSIX omitidos explicitamente. |
| Windows x64 | `git-trust.test.mjs`, após ajuste final de nomes remotos hierárquicos | 101 PASS; 6 casos exclusivos POSIX omitidos explicitamente. |
| Ubuntu 24.04 em WSL2, Node Linux nativo 22.22.1, Vitest 4.1.12 | Mesmos dois arquivos, em cópia descartável no filesystem Linux, com dependências Linux | 121 PASS; 5 casos exclusivos Windows omitidos explicitamente. Inclui a corrida determinística de quarentena e todas as regressões POSIX do arquivo. |
| Windows x64 | `install.test.mjs -t readonly` | 1 PASS. Demais casos fora da seleção. |
| Windows x64 | `install-hooks.test.mjs`: source acima do limite e symlink/.. | 2 PASS. Demais casos fora da seleção. |
| Windows x64 | `install-hooks.test.mjs`: caminho configurado, entrada vazia, conflito estrangeiro e segunda instalação | 4 PASS. Demais casos fora da seleção. |
| Windows x64 e Ubuntu 24.04 / Node Linux nativo | Rechecagem final `install-hooks.test.mjs`: path com symlink/.. ou prefixo ausente/.., e path positivo com `..` sem links anteriores | 2 PASS por OS. Demais casos fora da seleção. |
| Ubuntu 24.04 / Node Linux nativo | `install.test.mjs` e `install-hooks.test.mjs`: readonly, inventário/--check, size limit, path ambíguo, caminho configurado, entrada vazia, conflito estrangeiro e idempotência | 8 PASS. Demais casos fora da seleção. |
| Windows x64 / Git for Windows 2.54.0.windows.1 | Factory de sessão real: `check-ref-format refs/heads/ação-東京`; ref de tag contendo `;$HOME`/aspas/parênteses; `rev-parse --git-dir`, na mesma sessão | 3/3 status 0; stdout preservado (`.git` na última operação); stderr vazio. As revalidações usam o probe nativo de Windows, sem DTO de teste. |

O teste anterior de sucesso de replacement possuía asserção de shape POSIX apesar de rodar no Windows. A asserção foi alinhada ao resultado de cada backend, mantendo exigência de `ok`, evento terminal, bytes esperados e arquivo regular com link único. A execução final dirigida ficou verde nos dois OS. Falhas históricas não são usadas como aprovação.

Os testes Windows exclusivos usam APIs Windows reais; WSL não foi usado como substituto dessas APIs. Os testes Linux usam Node Linux nativo, não o wrapper de Node Windows presente no PATH inicial do WSL. São duas combinações reais, sem promessa de certificação de toda versão de Windows/Linux/Node.

## Fonte do loader e limite da conclusão

- [Git for Windows v2.54.0.windows.1, compat/mingw.c](https://github.com/git-for-windows/git/blob/v2.54.0.windows.1/compat/mingw.c): usos de `DECLARE_PROC_ADDR`/`INIT_PROC_ADDR` para os dois nomes; SHA-256 dos bytes raw consultados: `54401088f2f9757d07fbcb8668ebf9878dd07ed2141bed96eedf9a46e44fd48d` (120137 bytes).
- [Mesmo tag, compat/win32/lazyload.h](https://github.com/git-for-windows/git/blob/v2.54.0.windows.1/compat/win32/lazyload.h): `get_proc_addr` restringe a busca a System32; SHA-256 dos bytes raw consultados: `4cd57791baed5cbea4e279bd2e4d331387feb4ae1f432a21ccc802de6b6b7610` (1764 bytes).
- [Microsoft: ordem de busca de DLLs](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order): KnownDLLs precedem a busca no diretório da aplicação; flags de busca explícitas alteram a busca aplicável. O coletor atual também verifica ACLs, links e objetos da instalação fixada antes de admiti-la.

A conclusão Review13-02 se limita ao cenário descrito desses dois loads no release fixado. Não afirma ausência universal de falhas do loader, proteção contra administrador hostil ou certificação de binários arbitrários. Nenhum malware, alteração de instalação global ou privilégio administrativo foi necessário para a prova.
