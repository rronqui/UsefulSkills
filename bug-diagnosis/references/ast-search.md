# Busca estrutural durante o diagnóstico

Use rg para texto/nome/caminho. AST só quando a pergunta depende de estrutura:
por exemplo, localizar chamadas a uma função com argumento específico, em vez
de cada ocorrência do nome. Busca auxilia o loop de reprodução, não o substitui.

Confirme identidade/versão de ast-grep e linguagem suportada; `sg` pode ser outro
programa. A skill não instala CLI. Consulte ajuda local e documentação oficial
para o schema de padrão/regra. Se indisponível, busca textual pode responder uma
questão limitada; informe a cobertura ausente.

Antes do repositório, crie fixture sintética positiva, negativa e de limite com
o mesmo parser. Inspecione árvore se padrão falhar. Defina deliberadamente
alcance de has/inside e parada de relações; stopBy não é requisito universal.
Restrinja áreas/exclusões do projeto e registre regra, linguagem, comando,
caminhos, resultados e falsos positivos inspecionados.

Zero matches significa apenas ausência daquele padrão/alcance. AST não resolve
autorização, fluxo de dados ou segurança semântica por si. Entregue arquivos,
linhas e contexto para hipótese falsificável. Reescrita exige escopo autorizado,
diff e verificações pertinentes; não usar busca como autorização de refatoração.
[Documentação oficial](https://ast-grep.github.io/reference/rule.html).
[Origem e limite de licença](../SOURCE.md).
