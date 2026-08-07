# Feedback de review

- 2026-08-07 [P1] hook-wrapper: geradores de wrapper sh precisam repassar os argumentos do git ao sidecar (`"$@"`) e nunca embutir caminhos absolutos sem escape — caso contrário hooks instalados viram no-op silencioso (arquivo: scripts/install-hooks.mjs)
- 2026-08-07 [P1] release-please: `release-as` fixado na config é permanente e congela todo release futuro na mesma versão — use manifest baseline (0.0.0) e bump convencional, nunca override persistente (arquivo: release-please-config.json)
