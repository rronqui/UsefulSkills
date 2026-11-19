# Emendas locais — 2026-11-08

As referências de segurança abaixo são cópias técnicas seletivas mantidas no
caminho local de `deep-review/references/security/`. As emendas corrigem
parsing/origem de redirects, escopo de SVG ativo, requisitos CSP, triagem de
dependências de desenvolvimento e limites de parsing/roteamento. O aviso no topo
de cada referência identifica a adaptação local; o escopo é consultivo e não
substitui validação na aplicação real.

## Arquivos locais e origem fixada

A origem histórica é o snapshot `openai/skills`, revisão
`49f948faa9258a0c61caceaf225e179651397431`, no caminho upstream
`skills/.curated/security-best-practices/references/`. Os caminhos locais reais
são:
| Arquivo local | Caminho upstream no snapshot fixado |
|---|---|
| `deep-review/references/security/golang-general-backend-security.md` | `skills/.curated/security-best-practices/references/golang-general-backend-security.md` |
| `deep-review/references/security/javascript-express-web-server-security.md` | `skills/.curated/security-best-practices/references/javascript-express-web-server-security.md` |
| `deep-review/references/security/javascript-general-web-frontend-security.md` | `skills/.curated/security-best-practices/references/javascript-general-web-frontend-security.md` |
| `deep-review/references/security/javascript-jquery-web-frontend-security.md` | `skills/.curated/security-best-practices/references/javascript-jquery-web-frontend-security.md` |
| `deep-review/references/security/javascript-typescript-nextjs-web-server-security.md` | `skills/.curated/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md` |
| `deep-review/references/security/python-django-web-server-security.md` | `skills/.curated/security-best-practices/references/python-django-web-server-security.md` |
| `deep-review/references/security/javascript-typescript-react-web-frontend-security.md` | `skills/.curated/security-best-practices/references/javascript-typescript-react-web-frontend-security.md` |
| `deep-review/references/security/python-flask-web-server-security.md` | `skills/.curated/security-best-practices/references/python-flask-web-server-security.md` |
| `deep-review/references/security/python-fastapi-web-server-security.md` | `skills/.curated/security-best-practices/references/python-fastapi-web-server-security.md` |
| `deep-review/references/security/javascript-typescript-vue-web-frontend-security.md` | `skills/.curated/security-best-practices/references/javascript-typescript-vue-web-frontend-security.md` |

A omissão histórica de FastAPI e Vue nesta tabela foi corrigida em 2026-11-19.
Os dois blobs e a licença do próprio skill foram obtidos na revisão fixada,
com SHA Git verificado a partir dos bytes e SHA-256 registrado no
[recibo público](../implementation-evidence/remediation/provenance/public-source-captures.json).
A [licença Apache-2.0 fixada](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices/LICENSE.txt)
corresponde ao texto local de LICENSE.application-security.md após normalizar
somente CRLF/LF. Não se inventa aviso copyright para os documentos.

FastAPI preserva o corpo upstream e acrescenta o footer consultivo OMP; Vue
também contém a correção local de parsing/origem do redirect. Ambos recebem
aviso explícito de modificação/proveniência. Os hashes distinguem upstream,
bytes locais e conteúdo normalizado; essas comparações não são prova executada.

## Fontes primárias consultadas

- [URL Standard](https://url.spec.whatwg.org/)
- [SVG 2 — conformidade](https://www.w3.org/TR/SVG2/conform.html)
- [Strict CSP](https://web.dev/articles/strict-csp)
- [`npm audit`](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
- [Next.js `cookies()`](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Express 5 `urlencoded`](https://expressjs.com/en/5x/api.html#express.urlencoded)
- [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)

## Estado e limites

O registro de validação de 2026-11-08 é histórico: houve leitura semântica das
receitas, comparação das cópias equivalentes e um probe de URL em Node sem
dependências instaladas. Isso não comprova build Next/Express, configuração
CSP, renderização SVG, execução SQL/RLS nem comportamento de uma aplicação real.
Ajustes atuais devem citar a fonte primária e continuar rotulados como
consultivos até serem exercitados no cenário autorizado.

A adaptação OMP de 2026-11-08 atualizou os links para este documento, renomeou
o aviso de adaptação e explicitou o escopo. Os hashes de inventário local e os
bytes finais da correção de proveniência estão no recibo público acima; a revisão
upstream acima continua sendo a origem fixada destes assets de segurança.
