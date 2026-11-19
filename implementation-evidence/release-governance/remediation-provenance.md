# Onda 2 — proveniência FastAPI, Vue e React

Data: 2026-11-19. Escopo: Review08-03 e Review09-08. Alterações documentais;
nenhuma tarefa histórica, execução Native, instalação ou release repetida.

| ID | Disposição | Evidência |
|---|---|---|
| Review08-03 | Corrigido e verificado | SOURCE e AMENDMENTS relacionam FastAPI/Vue aos mesmos paths no commit OpenAI fixado. A licença do próprio security-best-practices foi obtida nesse commit e comparada à cópia local após somente normalização CRLF/LF. Avisos de modificação foram adicionados aos dois arquivos sem mudar receitas. Recibo registra Git blob SHA recomputado, SHA-256, bytes, licença e modificações por arquivo. |
| Review09-08 | Corrigido e verificado no escopo estático | URI privada não é necessária para auditar a observação React: fontes públicas fixadas, Git blob SHA, SHA-256, inventário da árvore completa e comparação atual dos nove arquivos estão no recibo versionado. Ambos SOURCE distinguem a alegação histórica de peer sem transcript retido e a revisão atual independente da reescrita histórica. Sem copyright inventado, licença inferida ou afirmação universal de ausência de cópia. |

Recibo: [public-source-captures.json](../remediation/provenance/public-source-captures.json).
O recibo contém fatos/hashes e diferenças semânticas por arquivo; não redistribui
os corpos históricos React cuja licença integral não foi estabelecida. A licença
Apache existente dos assets OpenAI continua integral no pacote e seu hash é
verificado contra a fonte pública fixada.

## Fontes observadas

- OpenAI/skills, commit `49f948faa9258a0c61caceaf225e179651397431`:
  LICENSE.txt do skill e os dois arquivos de referência FastAPI/Vue.
- Vercel-labs/agent-skills, commit `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`:
  árvore recursiva com 477 entradas e `truncated:false`; README.md, SKILL.md,
  metadata.json e os nove rules correspondentes às referências React atuais.
- Os nove arquivos locais React foram lidos integralmente, sem edição. Foram
  observadas diferenças concretas de narrativa, exemplos, limites e fontes em
  cada par; títulos, assuntos e sintaxe convencional de APIs continuam em comum.
  O recibo detalha esse escopo e não conclui originalidade universal.

## Verificação observada

As três fontes OpenAI foram confirmadas por navegação pública e obtidas também
pelo conector GitHub em base64, permitindo conferir bytes e hashes Git. O mesmo
conector obteve os 13 objetos React (três documentos, nove rules e a árvore).
HTTP direto no shell retornou reset de conexão; não foi contado como validação.

O SHA Git foi reconstruído como SHA-1 de `blob <byte-length>\0<bytes>` para cada
um dos 15 blobs. A licença de 10.776 bytes tem SHA-256
`4dd13869245e356246a5b770723247bbb80a8f07a181d1d3d873a1734297cdb9` e é igual ao
texto local depois de normalizar apenas quebras de linha. SHA-256 do upstream
`7383c7f4fc271190b05e562ada7e825982a2c76b6c79a9f95a1da7687b65a616` corresponde
ao documento FastAPI; `77c6a747f9f17e3df03aad0fcb20d99ac7898001b81aef8b80908e45ac14a688`
corresponde ao documento Vue.

Validação local ad hoc conferiu os hashes do recibo para as duas cópias de
segurança, licença e nove arquivos React; links relativos dos documentos
alterados e ausência de paths privados no recibo. `git diff --check` dos arquivos
de ownership passou. Não se adicionou teste de frase documental ou suíte nova;
não há mudança de runtime que justifique suíte completa nesta frente.

Esta revisão documenta proveniência estática limitada. R-02 live, conformidade
jurídica, instalação, segurança de aplicações e aprovação Native/release não são
inferidos dela; permanecem sob seus próprios contratos e gates.
