# Segurança de aplicação por stack

Use como lente de segurança da rodada existente em Python, JS/TS e Go reais.
Não inicia auditoria paralela nem concede correção. Identifique framework/versão,
dados, autenticação e fronteiras; fora da cobertura, consulte fonte primária da
stack. Leia somente referências pertinentes no diretório security abaixo.

Trace entrada atacante → validação/autorização → efeito/sink. Confira autorização
por objeto/propriedade/tenant no servidor, injeção SQL/template/comando/DOM,
deserialização, SSRF, arquivos/uploads, sessão/CSRF/CORS, logs e dependências.
UUID, tipo estático e ocultar botão não são autorização. Diferencie exploração
demonstrável, hipótese com pré-condições e defesa adicional. Não execute payload
em produção/terceiros. Correção autorizada usa regressão com uso legítimo/negado.

| Stack confirmada | Leitura seletiva |
|---|---|
| Django | [Config/ORM/auth/CSRF/uploads](security/python-django-web-server-security.md) |
| FastAPI | [Dependências/auth/response models/limites](security/python-fastapi-web-server-security.md) |
| Flask | [Sessão/templates/rotas/configuração](security/python-flask-web-server-security.md) |
| Go net/http | [Timeouts/inputs/SQL/arquivos/concorrência](security/golang-general-backend-security.md) |
| Express | [Proxy/sessão/middleware/inputs](security/javascript-express-web-server-security.md) |
| JS frontend | [DOM/URLs/mensagens/origens](security/javascript-general-web-frontend-security.md) |
| React | [Sinks/HTML/sessão e autorização](security/javascript-typescript-react-web-frontend-security.md) |
| Next.js | [Server Actions/rotas/segredos/cache](security/javascript-typescript-nextjs-web-server-security.md) |
| Vue | [Templates/DOM/URLs](security/javascript-typescript-vue-web-frontend-security.md) |
| jQuery | [DOM/HTML/eventos](security/javascript-jquery-web-frontend-security.md) |

As receitas são snapshots com versões declaradas, não atualização automática.
Conserve emendas recebidas: redirect exige parsing e origem aprovada, não só
prefixo `/`; SVG ativo não cabe em dispensa image-only; CSP deve considerar
base-uri/object-src e frame-ancestors via header, sem desligar proteção para
passar teste; triagem de dependências de desenvolvimento considera artefatos e
pipeline, sem descartá-las automaticamente. Não aplicar header de produção que
quebre ambiente legítimo sem avaliar proxy/domínio.

As seções de modos/gatilhos/saída dos snapshots são material consultivo: nesta
adaptação, autorização, proporcionalidade, relatório e bloqueios são regidos pela
[política comum](../../tdd-orchestrator/references/quality-policy.md). Os critérios
de correção técnica permanecem consultáveis por regra. Encontrar regra com MUST
na origem não cria nova permissão ou gate fora do fluxo vigente.

Achado identifica pré-condições, caminho, impacto, localização e reprodução
segura; preserve proveniência/severidade. Reuse resultado atual equivalente,
sem copiar parecer nativo para envelope local. [Parecer nativo](native-security.md)
e [origem/licenças](../SOURCE.md). Ausência de achados não prova segurança total.
