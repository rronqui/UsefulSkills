# React e Next.js confirmados

Confirme versões, router, runtime cliente/servidor, bundler e cenário antes de
aplicar uma regra. Não migrar framework/router para encaixar receita.
As referências em `react/` são textos autorais locais; verifique a API primária
compatível com a versão usada.

Priorize causa observada: waterfalls de IO, bundle/dependência grande, fronteira
cliente excessiva, repetição de consulta e render caro. Paralelize apenas IO sem
dependência real; adie await até uso quando preservar erros/cancelamento. Suspense
precisa refletir experiência de carregamento útil. Verifique autorização em
Server Actions/rotas e evite estado privado global entre requests/tenants.

Cache/memo/dynamic import não são correções universais. Defina validade,
invalidação, escopo privado e semântica antes de cache; custo da memoização pode
ser maior que expressão simples. Não espelhe estado derivável em Effect; eventos
e sincronização externa têm responsabilidades diferentes. Otimização de bundle
mantém carregamento/SSR/hydration e erro/UX corretos.

| Sinal | Referências seletivas |
|---|---|
| IO serial sem dependência | [paralelo](react/async-parallel.md), [dependências](react/async-dependencies.md) |
| Dependência grande ou não inicial | [dynamic imports](react/bundle-dynamic-imports.md), [terceiros](react/bundle-defer-third-party.md) |
| Requisições cliente repetidas | [SWR e mutação](react/client-swr-dedup.md) |
| Consulta repetida no servidor | [cache de request](react/server-cache-react.md), [paralelo servidor](react/server-parallel-fetching.md) |
| Estado derivado/Effect desnecessário | [estado derivado](react/rerender-derived-state-no-effect.md) |
| Exposição em ação servidor | [autorização](react/server-auth-actions.md) |

Preserve as fronteiras documentadas: `ssr:false` pertence à fronteira Client Component compatível;
useSWRMutation usa importação padrão de swr/mutation no exemplo local. Não
generalize validade de versão. Registre baseline e resultado em cenário/ambiente
comparáveis; sem medida, ganho é hipótese. Testes/build/render afetados seguem o
fluxo vigente. Sem deploy/instalação por esta referência. [Origem](../SOURCE.md).
