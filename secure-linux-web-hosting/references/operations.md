# Procedimento de host e recuperação

## Entrada e observação

Registre host/domínios autorizados, inspeção ou mutação, efeitos/comandos
permitidos, janela pertinente, dono dos recursos e recuperação. Obtenha fatos
disponíveis antes de perguntar; não peça senha/chave em chat. Identifique comando
local versus remoto no registro. Sem alvo/autorização suficiente, zero efeito.

Leia os-release, serviços/listeners/configuração pertinente e DNS no escopo.
Confirme distro, package manager, SSH unit/includes, firewall já em uso,
SELinux/AppArmor e layout Nginx pelas fontes oficiais atuais. Não assumir apt/ufw
para todo Linux. Debian/Ubuntu, Fedora/RHEL e Arch diferem em pacotes, units,
políticas e persistência. Não desabilite política de segurança por conveniência.

## Recuperação e acesso

Antes de mudanças, guarde configuração com identidade/hash/permissões e destino
seguro autorizado; prove como restaurar sem sobrescrever mudança concorrente.
Preserve console/rescue ou recuperação equivalente. Mudança de acesso SSH exige
segunda sessão independente com chave, usuário e sudo pertinentes; mantenha
primeira aberta. Verifique config com utilitário real do serviço (por exemplo
sshd -t, conforme docs/instalação) antes de reload. Teste login novo depois.
Nunca desabilitar senha/root ou trocar porta a partir do único acesso não
recuperável; sem prova de segunda sessão, pare esse dependente.

## Firewall e exposição

Inventarie regras no host e provedor, portas/interfaces reais e caminho de
administração. Preserve permissão SSH correta antes de política inbound restrita;
habilite web80/443 quando necessário. Backend proxy fica privado, sem exposição
de porta app como atalho. Inspecione IPv4/IPv6 e persistência relevantes; regra
escrita não prova tráfego. Probe acesso permitido e recusa esperada no escopo,
sem varredura externa indiscriminada. Falha: restaure configuração autorizada
pelo acesso preservado, valide e confirme administração antes de seguir.

## Nginx estático ou proxy

Estático: document-root/índice/permissões reais e política MAC corretos;
try_files e fallback dependem da aplicação. Proxy: app responde primeiro no
loopback esperado; configure Host/proxy headers somente conforme fronteira de
confiança; não confiar header arbitrário como identidade/HTTPS. Streaming,
WebSocket e timeout pedem configuração específica da versão/serviço.

Edite bloco mínimo preservando sites existentes. Sequência: validar sintaxe
(nginx -t quando disponível), reload só com validação positiva, conferir serviço,
probe local com Host/SNI correto, depois DNS/HTTP público autorizado e logs
sanitizados. Resposta200 de página errada não aprova alvo. Falha de reload/probe
preserva diagnóstico e rollback seletivo com validação/probe repetidos.

## TLS e renovação

Confirme domínio/DNS, A/AAAA pertinentes, alcance e challenge escolhido antes de
emitir certificado. HTTP-01 depende do caminho HTTP; DNS-01 requer controle DNS
autorizado. Cliente ACME/pacote/plugin/timer vêm de documentação atual, sem
instalar pelo tutorial antigo. HTTPS exige cadeia, hostname/SNI e validade;
não contornar erro de certificado. Só então habilite redirecionamento permanente
apropriado e confirme ausência de loop. Não exponha chave privada no relatório.

Verifique timer/hook e dry-run/renovação suportada pelo cliente, observando
rate limits e efeitos. DNS/HTTP/TLS e renovação têm provas distintas. Registre
o que foi lido, executado ou não verificado. Tuning de kernel/BBR/rede só em
demanda explícita, depois do web path estável, com recuperação testável.

## Saída e falha parcial

HOST_OPERATION_V1 conserva target/mode, autoridade referenciada, fontes/hash,
comandos/resultados sanitizados, alterações, backup/reversão/probes, limites e
next_action. COMPLETE significa operação solicitada verificada, não segurança
universal; recuperação/probe necessário ausente produz INCOMPLETE. Não retomar
mutação sem conferir dono/estado atual do host. Instalador nunca executa este
procedimento. [Origem e limites](../SOURCE.md).
