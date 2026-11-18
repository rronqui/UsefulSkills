# Origem, alterações e licenças

A base UsefulSkills preexistente é preservada, `rronqui`, v0.4.0/commit
`02582a867f660bf8aa387fe51f71b7fffd3a7dfd`, MIT. As instruções locais são
adaptações modificadas para OMP, 2026-11-08; não são autoria dos projetos
upstream nem nova revisão oficial. Fontes técnicas instaladas foram consultadas
somente leitura; hashes e escopo humano estão no relatório operacional.

| Fonte pertinente | Origem fixada | Licença recebida |
|---|---|---|
| deep-review | [snapshot](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/code-review) | MIT; `LICENSE.mattpocock.md` + `LICENSE.usefulskills.md` |
| accessibility | [snapshot](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00/skills/accessibility) | MIT; `LICENSE.accessibility.md` |
| security-best-practices | [snapshot](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices) | Apache-2.0; `LICENSE.application-security.md` |

## Referências de segurança

Os caminhos locais reais são `deep-review/references/security/*.md`. A lista de
emendas e o mapa de origem histórica ficam em
[`AMENDMENTS.md`](AMENDMENTS.md); eles distinguem o caminho local do caminho
upstream `skills/.curated/security-best-practices/references/` na revisão
`49f948faa9258a0c61caceaf225e179651397431`.

As referências são cópias técnicas seletivas com emendas recebidas em
2026-11-08 (redirect parsing/origem, SVG ativo, CSP, dependências de
 desenvolvimento e limites de parsing/roteamento). Elas não representam nova
 revisão upstream. O aviso no topo de cada referência identifica adaptação local
e preserva o aviso/licença aplicável ao asset de segurança; a emenda não é
prova de build, runtime ou aplicação real.

O entrypoint OMP e a política compartilhada prevalecem em gatilhos, autoridade,
runtime e saída; referências técnicas são conhecimento seletivo. Não importamos
transporte, manutenção/instalação ou caminhos do host de origem. Não alegamos
execução instalada, certificação de segurança ou compatibilidade universal por
leitura.

Accessibility é guia reescrito com correção pt/CSS px preservada, sem copiar
padrões de modal incompletos. A referência de segurança React frontend pertence
à origem de segurança acima; as nove referências de práticas React em
`tdd-orchestrator/references/react/` têm proveniência separada, atual e
autoral; o artefato auxiliar de licença obsoleto foi excluído no cutover.
A revisão independente `agent://ProvenancePeer` aprovou em revisão estática a
autoria atual das nove referências; R-02 é `PASS (ESTÁTICA)` com evidência
delimitada, sem opinião jurídica e sem prova de discovery, instalação, runtime
nativo ou licença adicional. O artefato auxiliar de licença obsoleto permanece
excluído; limites nativos e de distribuição são separados.

Licença base integral: [`LICENSE.usefulskills.md`](LICENSE.usefulskills.md).
Avisos integrais adicionais permanecem ao lado; licenças não transferem
autoria. Antes de distribuir alteração, confira proveniência, avisos e links
atuais.
