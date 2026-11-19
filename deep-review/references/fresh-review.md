# Contexto novo, proveniência e reuso

Fonte única consumida por alignment, architecture, TDD e deep-review quando a
finalidade exige independência. Não cria fila, entrevista, spec ou aprovação nova.

O coordenador mantém um índice operacional único, com um escritor, ligado ao
checkpoint por run/revisão/hash. Se schema fechado não aceitar índice, use
auxiliar hashado; nunca acrescente campo silencioso. Cada registro identifica
instância e tipo, autor responsável, finalidade, eixo/critérios, alvo/revisão,
dependências e hashes, instruções/versão, cenário/ambiente relevante, runtime,
prova/limite de não herança, retorno nativo original path/hash/ID, status,
achados e resolução. Tipo de agente não é identidade de execução.

Observe schema e origem do papel. Crie instância distinta do autor com briefing
autossuficiente, sem conversa/raciocínio do autor, memórias ou resposta esperada.
Não transfira flags de outro host: a forma OMP de contexto/isolamento deve estar
exposta e comprovada. Para compreensão, só documento e definições ligadas; para
arquitetura/requisitos, código/consumidores necessários à finalidade. Revisor
devolve fontes efetivamente lidas e limitações; arquivo inacessível, processo
interrompido ou retorno ausente é INCOMPLETE, não ausência de achados.

Na primeira estratégia/runtime, uma prova de marcador só no contexto do pai
pode detectar herança indevida: briefing não contém o valor, filho deve responder
UNKNOWN. Preserve retorno real. UNKNOWN é evidência limitada de não herança,
não prova contexto vazio, sandbox, ausência de instruções do host ou de acesso a
arquivos. Ferramentas restritas ajudam; enforcement só é alegado se observado.

Reuso exige retorno terminal acessível, finalidade/cobertura/critérios iguais,
mesmo conteúdo de alvo e dependências, instruções, cenário e ambiente relevante,
independência e estratégia válidas. Mudança invalida apenas dependentes; conserve
histórico. Troca de runtime exige conferir capacidades, sem invalidar teste de
produto não afetado automaticamente. Compreensão prévia não substitui crítica
estrutural ou revisão final de código. Não recomeçar tudo para preencher papel.

Agrupe mesmo problema/alvo/revisão preservando IDs e fontes originais. Não use
deduplicação para suprimir bloqueio. Contestar requer evidência; resolver requer
nova prova pertinente. Sem capacidade independente exigida, avance outras frentes
e bloqueie consumidor dependente. Autorinspeção ou template/modelo diferente não
cumpre independência. Hash prova bytes, não verdade ou permissão.
