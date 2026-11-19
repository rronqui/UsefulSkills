# Fechamento dos achados da revisão B

O parecer independente `review-native-independent.md` permanece íntegro.
Os dois achados foram aceitos e corrigidos diretamente pelo integrador, sem
abrir outra rodada global de revisão.

- B-IND-01/P1: a entrada real RpcSession recusa Root END com error, failed,
  success:false ou aborted, no frame e no resultado, antes de admitir detalhes.
  A tabela exerce um controle limpo e sete contradições sobre o consumidor real.
- B-IND-02/P2: extração offline valida o canal progress e o Root dispatch,
  conserva exitCode:null e exige igualdade do valor observado no caso retido.
  Não fabrica zero. A regressão cobre null válido, exit não zero e Root ausente.

Verificação dirigida observada em Windows/Node22.23.2/Vitest4.1.12:
`scripts/native-evidence.test.mjs`: 41/41 passaram. Os achados ficam encerrados
por implementação e regressão discriminante, sem apresentar este fechamento
do integrador como nova aprovação independente. O parecer original cobre os
demais controles; os testes finais e OMP real são evidências separadas.
