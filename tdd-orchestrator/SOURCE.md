# Origem, alterações e licenças

A base UsefulSkills preexistente é preservada, `rronqui`, v0.4.0/commit
`02582a867f660bf8aa387fe51f71b7fffd3a7dfd`, MIT. As instruções locais são
adaptações modificadas para OMP, 2026-11-08; não são autoria dos projetos
upstream nem nova revisão oficial. Fontes técnicas instaladas foram consultadas
somente leitura; hashes e escopo humano estão no relatório operacional.

| Fonte pertinente | Origem fixada | Licença/proveniência recebida |
|---|---|---|
| tdd-orchestrator | [snapshot](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills) | MIT; `LICENSE.mattpocock.md` + `LICENSE.usefulskills.md`; drift EGM: `LICENSE.egm.md` |
| frontend-design | [snapshot](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design) | Apache-2.0; `LICENSE.frontend-design.md` |
| vercel-react-best-practices (histórico) | [árvore fixada](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices) | O metadata declara MIT e autoria organizacional Vercel Engineering; a evidência registra árvore completa (`truncated:false`), inventário sem nomes `LICENSE`, `NOTICE` ou `COPYING` e limita o aviso copyright aos blobs consultados |
| supabase-postgres-best-practices | [snapshot](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | MIT; `LICENSE.postgresql.md` |

## Corte de proveniência React

A fonte React acima é uma identidade histórica e um limite de proveniência, não
uma licença confirmada para distribuir texto de terceiros. A evidência fixada
em [`local://ship-license-primary-evidence.json`](local://ship-license-primary-evidence.json)
registra `sourceCommit: 1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`, árvore completa
(`treeComplete:true`, `truncated:false`), inventário sem nomes `LICENSE`/`NOTICE`/
`COPYING` e três blobs consultados (`README.md`, `SKILL.md`, `metadata.json`) sem
aviso copyright fornecido. Isso delimita a observação; não infere ausência legal
em conteúdo não consultado, nem fabrica copyright, aviso MIT ou parecer jurídico.

No cutover T-010A, as nove referências em `references/react/` foram substituídas
por texto e exemplos novos de autoria UsefulSkills. O artefato auxiliar de
licença sem aviso foi removido porque nenhum conteúdo adaptado React permanece
nas referências; `NOTICE` e licenças obrigatórias de outros assets continuam
inalterados. A substituição preserva tópicos, capacidades e aconselhamento
aplicável, mas não copia expressão criativa upstream. A revisão independente
`agent://ProvenancePeer` aprovou a autoria atual das nove referências em revisão
estática; R-02 é `PASS (ESTÁTICA)` com evidência delimitada, sem opinião jurídica
e sem prova de discovery, instalação, runtime nativo ou licença adicional.

As fontes atuais são originais e estão indicadas em cada referência: documentação
React (`react.dev`), Next.js (`nextjs.org`), APIs de navegador/JavaScript (MDN,
WHATWG e Node.js) e, quando a orientação depende do produto, documentação SWR.
Esses links sustentam a orientação técnica; não constituem prova de execução,
compatibilidade instalada, segurança de uma aplicação ou licença de terceiros.

O entrypoint OMP e a política compartilhada prevalecem em gatilhos, autoridade,
runtime e saída; referências técnicas são conhecimento seletivo. Não importamos
transporte, manutenção/instalação ou caminhos do host de origem. Não alegamos
execução instalada, certificação de segurança ou compatibilidade universal por
leitura.

Regras PostgreSQL continuam com emendas locais recebidas de 2026-11-08:
prepared SQL versus protocolo/pooler, RLS/helper, constraint por relação e
locks UPDATE. A documentação PostgreSQL mantém sua própria proveniência e
licença neste diretório.

Licença base integral: [`LICENSE.usefulskills.md`](LICENSE.usefulskills.md).
Avisos integrais adicionais permanecem ao lado; licenças não transferem
autoria. Antes de distribuir alteração, confira proveniência, avisos e links
atuais.
