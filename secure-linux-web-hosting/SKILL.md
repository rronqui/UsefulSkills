---
name: secure-linux-web-hosting
description: Configurar ou revisar host Linux para web com SSH, recuperação, firewall, Nginx/proxy e TLS. Use em operação de host com alvo/efeitos autorizados; não para CI/releases, feature de aplicação, Windows, Workers ou Kubernetes.
---

# Hospedagem Linux verificável

Instalação/discovery desta skill não abre SSH nem altera servidor. Exija pedido
operacional, alvo, modo inspeção|mutação, efeitos autorizados, recursos e acesso
de recuperação adequados. Sem isso, registre INCOMPLETE antes de efeitos. Use
credenciais por mecanismo seguro do ambiente, nunca valores em chat/logs.

1. Leia [procedimento](references/operations.md) e somente fase necessária.
   Identifique distro/versão, serviço, usuário/privilégio, DNS, firewall do
   provedor/host e objetivo estático ou proxy. Verifique documentação oficial
   atual antes de comandos dependentes de versão. Não repetir bootstrap na
   correção de instalação existente.
2. Preserve configuração/backup e caminho de reversão. Antes de restringir SSH,
   comprove chave em segunda sessão independente e mantenha primeira/console.
3. Configure exposição mínima e branch web correta; aplicação proxy fica
   loopback quando compatível. Valide sintaxe antes de reload e probes depois.
4. Confira DNS/HTTP antes da emissão ACME pertinente; HTTPS antes de redirect;
   renovação pelo método suportado do cliente. Tuning opcional não entra sem
   necessidade e recuperação.
5. Retorne alvo/modo/autoridade referenciada, mudanças exatas, provas sanitizadas,
   backup/reversão, estado e pendências. Serviço ativo não prova fluxo público.

[Host-operator](agents/host-operator.md) concentra o contrato operacional. Só
quando houver pedido explícito de host Linux com alvo e efeitos autorizados,
delegue pela mesma ferramenta nativa `task`, com `agent: "host-operator"`,
modo, recuperação e recursos definidos; recolha provas/probes e pendências.
Inspeção simples autorizada pode ficar com caller. Instalação/discovery, TDD de
aplicação e deploy do ship não disparam esse agente automaticamente nem tornam
operação de host uma fase implícita. Não concede host a
developer GREEN ou reviewer por desvio de fase. TDD conserva recursos/estado;
release-bootstrap trata CI, ship entrega Git e código segue desenvolvimento.
Segurança sensível usa revisão independente existente, sem outro scheduler.
Segurança geral de aplicação/dados/autorização/dependências/segredos permanece
na [política comum](../tdd-orchestrator/references/quality-policy.md) e na
[revisão de aplicação](../deep-review/references/application-security.md), em
qualquer plataforma conforme stack e cobertura confirmadas. Host-operator não
substitui esses revisores/gates nem é perfil universal de segurança.
Esta skill não promete cobertura completa de SRE/DR. [Origem/licenças](SOURCE.md).
