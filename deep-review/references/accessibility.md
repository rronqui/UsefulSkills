# Acessibilidade como lente da revisão

Acione para critérios a11y/WCAG ou auditoria pedida. Delimite páginas, estados e
fluxos. Sem meta acordada, WCAG 2.2 AA pode ser referência técnica proposta,
nunca obrigação legal/certificação presumida. Design visual e desempenho têm
referências próprias; correções retornam ao implementador vigente.

Confira com teclado Tab/Shift+Tab/Enter/Espaço/Escape e setas onde o componente
exige: ordem lógica, foco visível/não oculto, ausência de armadilha, entrada/saída
de diálogos e restauração ao acionador. Prefira controles nativos; nome acessível
corresponde ao rótulo, relações/estados ARIA refletem o estado real. Não adicionar
papel sem implementar sua interação. Conteúdo visual não pode depender só de cor.

Formulários: label associado, instruções, required/erro programáticos e claros,
preservação dos dados e foco orientado para corrigir; anúncios não interrompem
desnecessariamente. Estados loading/erro/vazio/sucesso e conteúdo dinâmico precisam
ser examinados, não apenas página inicial. Drag deve ter alternativa de ponteiro
simples e caminho por teclado quando pertinente; alvos e espaçamento seguem
critério aplicável, com exceções justificadas.

Contraste de texto normal AA 4.5:1; texto grande 3:1, considerando 18 pt (24 CSS px)
ou 14 pt em negrito (aproximadamente 18.67 CSS px), sem confundir px com pt.
Componentes/estados e informações visuais não textuais pertinentes precisam de
3:1. Confira zoom/reflow, largura pequena, texto aumentado, orientação e movimento
reduzido nos cenários acordados; não usar screenshot para alegar teclado testado.

Combine análise automática disponível e interação manual no ambiente autorizado.
AX/DOM não prova experiência de leitor de tela; registre qual leitor/cenário foi
realmente executado ou cobertura ausente. Pontuação sem falhas não certifica
WCAG. Retorno: barreira, página/estado, reprodução, critério, arquivo/linha,
impacto, método, resultado e limite. Prova integra eixos/gates existentes.
[Origem/licença e emendas](../SOURCE.md).
