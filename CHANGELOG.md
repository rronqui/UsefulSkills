# Changelog

## [0.2.0](https://github.com/rronqui/UsefulSkills/compare/v0.1.0...v0.2.0) (2026-08-07)


### Features

* Correções apontadas na análise ([#5](https://github.com/rronqui/UsefulSkills/issues/5)) ([e966eca](https://github.com/rronqui/UsefulSkills/commit/e966eca3b98c319b1d0c7c12d33097ff8ea8be3d))

## 0.1.0 (2026-08-07)


### Features

* adiciona skill deep-review com agente deep-reviewer extraido do /review do omp ([7406339](https://github.com/rronqui/UsefulSkills/commit/74063395a78a6615073706decda293c0e6fe893d))
* adiciona skill tdd-orchestrator com integração de entrega (delivery internal/external, PR standalone e gate deep-review via skill ship) ([2602e19](https://github.com/rronqui/UsefulSkills/commit/2602e1908b1d013c65d19a8afb12c38c6fd15f91))
* Bootstrap do pipeline de releases ([#2](https://github.com/rronqui/UsefulSkills/issues/2)) ([378ad1e](https://github.com/rronqui/UsefulSkills/commit/378ad1e585f5dae320513a9774e2c00ad1606f61))
* gate de revisão com roteamento, mini-RED, cláusula de doc e feedback persistente ([1d6eb06](https://github.com/rronqui/UsefulSkills/commit/1d6eb062b73d7317cc348958e59e215039f2505b))
* gate de revisao deep-review no fluxo ship com loop de correcao; motor tolera arvore limpa e --body-file; release-bootstrap documenta o fluxo integrado ([cb59ece](https://github.com/rronqui/UsefulSkills/commit/cb59ece1f610335f8096f6311c1453d253c7a619))
* integra alinhamento, diagnóstico de bugs e resolução de conflitos no fluxo ship/tdd-orchestrator ([2b94469](https://github.com/rronqui/UsefulSkills/commit/2b94469628afeeddbfc3c8a9611f5be468ed9e00))
* skills alignment, bug-diagnosis e conflict-resolution adaptadas de mattpocock/skills ([9d18732](https://github.com/rronqui/UsefulSkills/commit/9d187324347229d34e89e759f3a50dd4e8efd72d))


### Bug Fixes

* achados da auditoria — contradições e ambiguidades nas skills e agentes ([85fe198](https://github.com/rronqui/UsefulSkills/commit/85fe198c9c4d616d67f8c7df7c048473b2f9f0e3))
* gate revisa commits antes do deep-review; feedback idempotente; log fora do escopo de achados ([09c922a](https://github.com/rronqui/UsefulSkills/commit/09c922a41cd9df5e5d30836dadbecf227d4c652b))
* progress.md fica fora do git, alinhando o passo DONE ao estado gitignored ([828642b](https://github.com/rronqui/UsefulSkills/commit/828642b71e8cc261f198a393a9a252f389849156))
* ship.mjs — aviso de backup pulado, branch default interpolada na mensagem, guarda de package.json ausente no versionCheck ([8daabb4](https://github.com/rronqui/UsefulSkills/commit/8daabb41b9f061e46ebed6816ae6260927c543b9))
