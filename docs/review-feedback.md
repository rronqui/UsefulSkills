# Feedback de review

- 2026-08-07 [P1] hook-wrapper: geradores de wrapper sh precisam repassar os argumentos do git ao sidecar (`"$@"`) e nunca embutir caminhos absolutos sem escape — caso contrário hooks instalados viram no-op silencioso (arquivo: scripts/install-hooks.mjs)
- 2026-08-07 [P1] release-as-sticky: `release-as` fixado na config é permanente e congela todo release futuro na mesma versão — removido; primeiro release controlado por `initial-version`, nunca override persistente (arquivo: release-please-config.json)
- 2026-08-07 [P1] initial-version: manifest `0.0.0` é sentinel de bootstrap (excluído do fallback) e sem `initial-version` o primeiro release sai v1.0.0 — fixe `initial-version: 0.1.0` na config (arquivo: release-please-config.json)
- 2026-08-07 [P1] shell-quoting: `spawnSync(..., {shell:true})` com caminho absoluto sem quoting divide caminhos com espaços no Windows — invoque `node <cli.js>` com argv array, sem shell (arquivo: scripts/hooks/commit-msg.mjs)
- 2026-08-07 [P2] pre-push: checar só o local ref (campo 1) deixa passar refspecs como `HEAD:main` — valide também o remote ref (campo 3) (arquivo: scripts/hooks/pre-push.mjs)
