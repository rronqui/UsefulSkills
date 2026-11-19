# Origem, alterações e licenças

A base UsefulSkills preexistente é preservada, `rronqui`, v0.4.0/commit
`02582a867f660bf8aa387fe51f71b7fffd3a7dfd`, MIT. As instruções locais são
adaptações modificadas para OMP, 2026-11-08; não são autoria dos projetos
upstream nem nova revisão oficial. Fontes técnicas instaladas foram consultadas
somente leitura. A correção de proveniência atual tem fontes públicas fixadas,
hashes e limites no [recibo versionado](../implementation-evidence/remediation/provenance/public-source-captures.json).

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

FastAPI e Vue também pertencem ao snapshot de segurança fixado:
[FastAPI](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices/references/python-fastapi-web-server-security.md) e
[Vue](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices/references/javascript-typescript-vue-web-frontend-security.md).
A [licença do skill no mesmo commit](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices/LICENSE.txt)
é Apache-2.0; seu texto corresponde a LICENSE.application-security.md após
normalizar somente quebras de linha. O recibo registra Git blob SHA verificado,
SHA-256 upstream e hashes locais. Os avisos adicionados em 2026-11-19 identificam
as modificações preexistentes sem inventar copyright ou data delas.

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
`tdd-orchestrator/references/react/` têm proveniência separada e autoria local
declarada; o cutover registrou a exclusão do artefato auxiliar de licença obsoleto.
O registro anterior citava `agent://ProvenancePeer`, mas seu retorno bruto não
está retido aqui; essa citação histórica não é aprovação reproduzível atual.
A revisão estática atual das nove referências React, separada da autoria
histórica e sem editá-las, está no recibo público: hashes, nove fontes upstream
fixadas comparadas, links técnicos observados, diferenças de prosa/exemplos e
limites por arquivo. Ela sustenta a descrição de reescrita local no escopo
comparado; não prova autoria individual, ausência universal de cópia, opinião
jurídica, licença adicional ou aprovação de discovery/instalação/runtime Native.
A classificação de R-02 no receipt live continua separada dessa revisão limitada.

Licença base integral: [`LICENSE.usefulskills.md`](LICENSE.usefulskills.md).
Avisos integrais adicionais permanecem ao lado; licenças não transferem
autoria. Antes de distribuir alteração, confira proveniência, avisos e links
atuais.
