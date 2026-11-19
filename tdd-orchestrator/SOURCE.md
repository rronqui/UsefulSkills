# Origem, alterações e licenças

A base UsefulSkills preexistente é preservada, `rronqui`, v0.4.0/commit
`02582a867f660bf8aa387fe51f71b7fffd3a7dfd`, MIT. As instruções locais são
adaptações modificadas para OMP, 2026-11-08; não são autoria dos projetos
upstream nem nova revisão oficial. Fontes técnicas instaladas foram consultadas
somente leitura. Fontes fixadas, hashes e revisão delimitada atual estão no
[recibo público versionado](../implementation-evidence/remediation/provenance/public-source-captures.json).

| Fonte pertinente | Origem fixada | Licença/proveniência recebida |
|---|---|---|
| tdd-orchestrator | [snapshot](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills) | MIT; `LICENSE.mattpocock.md` + `LICENSE.usefulskills.md`; drift EGM: `LICENSE.egm.md` |
| frontend-design | [snapshot](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design) | Apache-2.0; `LICENSE.frontend-design.md` |
| vercel-react-best-practices (histórico) | [árvore fixada](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices) | SKILL.md declara MIT; metadata.json declara Vercel Engineering. A evidência registra árvore completa (`truncated:false`), inventário sem nomes `LICENSE`, `NOTICE` ou `COPYING` e limita a observação de copyright aos blobs consultados |
| supabase-postgres-best-practices | [snapshot](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | MIT; `LICENSE.postgresql.md` |

## Corte de proveniência React

A fonte React acima é uma identidade histórica e um limite de proveniência,
não uma licença confirmada para distribuir texto de terceiros. O relatório
histórico privado `ship-license-primary-evidence.json` não era reproduzível por
um leitor público. A observação foi refeita em 2026-11-19 e está no recibo
versionado acima, sem caminhos de máquina: árvore fixada com 477 entradas e
`truncated:false`, inventário de nomes sem `LICENSE`/`NOTICE`/`COPYING`, e
README.md, SKILL.md e metadata.json identificados por URL pública, Git blob SHA
e SHA-256. SKILL.md declara MIT; metadata.json declara Vercel Engineering.
Não foi observado aviso copyright nesses três blobs; isso não afirma ausência
em todo conteúdo, não resolve licença por inferência nem fabrica titular/aviso.
O recibo também identifica os nove rules históricos efetivamente comparados.

O cutover T-010A registrou a substituição das nove referências por texto e
exemplos locais de autoria declarada UsefulSkills e a remoção do artefato
auxiliar de licença sem aviso. Isso é histórico; não é prova universal de
originalidade. A antiga aprovação `agent://ProvenancePeer` não tem retorno bruto
retido neste repositório e não é apresentada como prova atual.

A revisão atual leu cada um dos nove arquivos e os nove rules no commit fixado,
sem editar os arquivos React nem depender do parecer antigo. O recibo registra
hashes, diferenças concretas de narrativa e exemplos, coincidência esperada de
temas/títulos/APIs e links técnicos por arquivo. A comparação sustenta reescrita
local substancial nesses arquivos e nessa fonte examinada; não atesta identidade
do autor nem exclui cópia de toda fonte possível. Não cria copyright, aviso MIT
upstream ou parecer jurídico; NOTICE/licenças dos demais assets são preservados.
R-02 e aprovação Native/release dependem de seus gates próprios, não desta
conferência estática de proveniência.

As fontes técnicas de apoio estão indicadas em cada referência: documentação
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
