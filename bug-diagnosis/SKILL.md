---
name: bug-diagnosis
description: Disciplina de diagnóstico para bugs difíceis e regressões de performance — construir feedback loop que fica vermelho no bug, minimizar, hipotetizar, instrumentar, corrigir com teste de regressão, limpar e registrar. Use quando o usuário disser "diagnostique"/"debugue isso" ou reportar algo quebrado, falhando, com erro ou lento; e como etapa do fluxo ship antes de implementar correção de bug.
---

# bug-diagnosis — disciplina de diagnóstico de bugs

Uma disciplina para bugs difíceis. Pule fases apenas com justificativa explícita.

## Redação de segredos

Esta skill exibe comandos, saídas e artefatos capturados. **Redija todo segredo
antes** — escreva `<REDACTED>` no lugar. Monte loops contra variáveis de ambiente,
para que a credencial fique no ambiente e não no que você mostra. Artefatos
capturados carregam headers de autenticação: cite apenas as linhas que carregam o
sinal. Se a saída redigida não bastar para diagnosticar, diga isso e pergunte ao
usuário.

## Fase 1 — Construir o feedback loop

**Esta é a fase que importa.** Todo o resto é mecânico. Se você tem um sinal
passa/falha APERTADO para o bug — um que fica vermelho NESTE bug — você encontrará
a causa; bisseção, teste de hipóteses e instrumentação apenas o consomem. Sem um,
nenhuma quantidade de leitura de código salvará.

Gaste esforço desproporcional aqui. Seja agressivo, criativo; recuse desistir.

### Maneiras de construir um — tente aproximadamente nesta ordem

1. **Teste que falha** na costura (seam) que alcança o bug — unitário, integração, e2e.
2. **Curl / script HTTP** contra um servidor de dev rodando.
3. **Invocação de CLI** com entrada de fixture, diffando o stdout contra um snapshot sabidamente bom.
4. **Script de browser headless** (Playwright/Puppeteer) — dirige a UI, asserta no DOM/console/rede.
5. **Replay de trace capturado.** Salve em disco uma request/payload/log de eventos real; replique pelo caminho de código em isolamento.
6. **Harness descartável.** Suba um subconjunto mínimo do sistema (um serviço, deps mockadas) que exercite o caminho do bug com uma única chamada.
7. **Loop de propriedade/fuzz.** Se o bug é "às vezes a saída está errada", rode 1000 entradas aleatórias e procure o modo de falha.
8. **Harness de bisseção.** Se o bug apareceu entre dois estados conhecidos (commit, dataset, versão), automatize "boot no estado X, cheque, repita" para rodar em `git bisect run`.
9. **Loop diferencial.** Rode a mesma entrada na versão antiga vs nova (ou duas configs) e diffe as saídas.
10. **Script bash humano-em-circulo.** Último recurso. Se um humano precisa clicar, dirija-o com `skill://bug-diagnosis/scripts/hitl-loop.template.sh` para o loop continuar estruturado. Em ambiente sem bash, conduza o loop com perguntas diretas ao usuário (ferramenta `ask`), registrando cada resposta.

Construa o feedback loop certo e o bug está 90% resolvido.

### Apertar o loop

Trate o loop como um produto. Uma vez que tenha UM loop, **aperte**:
- Dá para ficar mais rápido? (cache de setup, pular init irrelevante, estreitar o escopo do teste)
- Dá para o sinal ficar mais nítido? (assert no sintoma específico, não em "não crashou")
- Dá para ficar mais determinístico? (fixar tempo, seed de RNG, isolar filesystem, congelar rede)

Loop de 30s e flaky mal é melhor que loop nenhum; um de 2s e determinístico é um
superpoder de debugging.

### Bugs não determinísticos

O objetivo não é um repro limpo, mas uma **taxa de reprodução maior**. Loople o
gatilho 100×, paralelize, adicione estresse, estreite janelas de timing, injete
sleeps. Bug de 50% de flake é debugável; 1% não é — continue subindo a taxa até
ficar debugável.

### Quando realmente não for possível construir um loop

Pare e diga explicitamente. Liste o que tentou. Peça ao usuário: (a) acesso ao
ambiente onde reproduz, (b) artefato capturado redigido (HAR, dump de log, core
dump, gravação de tela com timestamps), ou (c) permissão para instrumentação
temporária em produção. **Não** prossiga para hipóteses sem loop.

### Critério de conclusão — loop apertado que fica vermelho

Fase 1 termina quando o loop é apertado e capaz de vermelho: você sabe nomear UM
comando (caminho de script, invocação de teste, curl) que **já rodou ao menos uma
vez** (mostre a invocação e a saída, redigidas) e que é:

- [ ] **Capaz de vermelho** — exercita o caminho real do bug e asserta o sintoma
      EXATO do usuário, podendo ficar vermelho neste bug e verde após corrigido.
- [ ] **Determinístico** — mesmo veredito a cada execução.
- [ ] **Rápido** — segundos, não minutos.
- [ ] **Rodável pelo agente** — executa sem supervisão; humano no loop apenas via
      script humano-em-circulo ou perguntas diretas.

Se você se pegar lendo código para criar teoria antes deste comando existir, PARE —
pular direto para hipótese é exatamente a falha que esta skill previne. Sem comando
capaz de vermelho, sem Fase 2.

## Fase 2 — Reproduzir + minimizar

Rode o loop. Veja-o ficar vermelho — o bug aparece.

Confirme:
- [ ] O loop produz o modo de falha que o USUÁRIO descreveu — não uma falha diferente próxima. Bug errado = fix errado.
- [ ] A falha é reproduzível em múltiplas execuções (ou, para bugs não determinísticos, reproduzível em taxa alta o bastante para debugar).
- [ ] Você capturou o sintoma exato (mensagem de erro, saída errada, timing lento) para fases posteriores verificarem que o fix o endereça.

### Minimizar

Uma vez vermelho, encolha o repro para o **menor cenário que ainda fica vermelho**.
Corte entradas, chamadores, config, dados e passos **um de cada vez**, re-rodando o
loop após cada corte — mantenha apenas o que é load-bearing para a falha.

O repro mínimo encolhe o espaço de hipóteses da Fase 3 e vira o teste de regressão
limpo da Fase 5. Termine quando **todo elemento restante for load-bearing** —
remover qualquer um deles faz o loop ficar verde. Não prossiga sem reproduzir E
minimizar.

## Fase 3 — Hipotetizar

Gere **3–5 hipóteses ranqueadas** antes de testar qualquer uma. Hipótese única
ancora na primeira ideia plausível. Cada hipótese deve ser **falsificável**: diga a
predição que ela faz.

> Formato: "Se <X> é a causa, então <mudar Y> faz o bug sumir / <mudar Z> piora."

Se não consegue dizer a predição, a hipótese é um palpite — descarte ou afie.

**Mostre a lista ranqueada ao usuário antes de testar.** Ele costuma ter contexto
que re-ranqueia na hora ("acabamos de subir uma mudança que é a #3") ou conhece
hipóteses já descartadas. Checkpoint barato, grande economia. Não bloqueie nele —
prossiga com seu ranking se o usuário estiver ausente.

## Fase 4 — Instrumentar

Cada probe deve mapear para uma predição específica da Fase 3. **Mude uma variável
por vez.** Preferência de ferramenta:
1. **Debugger/REPL** se o ambiente suportar. Um breakpoint vale dez logs.
2. **Logs pontuais** nas fronteiras que distinguem as hipóteses.
3. Nunca "logar tudo e grep".

**Marque todo log de debug** com prefixo único, ex.: `[DEBUG-a4f2]`. A limpeza no
final vira um único grep. Logs não marcados sobrevivem; marcados morrem.

**Ramo de performance.** Para regressões de performance, logs geralmente estão
errados. Em vez disso: estabeleça medição de baseline (harness de timing, profiler,
plano de query) e depois bissecione. Meça primeiro, corrija depois.

## Fase 5 — Corrigir + teste de regressão

Escreva o teste de regressão **antes do fix** — mas apenas se houver **costura
(seam) correta**. Costura correta é aquela em que o teste exercita o **padrão real
do bug** como ele ocorre no call site. Se a única costura disponível é rasa demais
(teste de chamador único quando o bug precisa de múltiplos chamadores; teste unitário
que não replica a cadeia que disparou o bug), um teste de regressão ali dá falsa
confiança.

**Se não existe costura correta, isso em si é o achado.** Registre. A arquitetura
do codebase está impedindo o bug de ser travado. Sinalize para o relatório final.

Se existe costura correta:
1. Transforme o repro minimizado em teste que falha nessa costura.
2. Veja-o falhar.
3. Aplique o fix.
4. Veja-o passar.
5. Re-rode o feedback loop da Fase 1 contra o cenário original (não minimizado).

## Fase 6 — Limpeza + registro

Obrigatório antes de declarar concluído:
- [ ] O repro original não reproduz mais (re-rodar o loop da Fase 1)
- [ ] Teste de regressão passa (ou a ausência de costura está documentada)
- [ ] Toda instrumentação `[DEBUG-...]` removida (grep no prefixo)
- [ ] Protótipos descartáveis apagados
- [ ] A hipótese que se confirmou está registrada no relatório final — no fluxo ship,
      no arquivo de evidência do PR (a mensagem de commit é one-line gerada pelo motor) —
      para o próximo debugger aprender

**Então pergunte: o que teria prevenido este bug?** Se a resposta envolver mudança
de arquitetura (sem costura de teste boa, chamadores emaranhados, acoplamento
oculto), registre o achado no relatório ao usuário com os detalhes específicos — a
recomendação vem DEPOIS do fix aplicado, não antes: há mais informação agora do que
no início.
