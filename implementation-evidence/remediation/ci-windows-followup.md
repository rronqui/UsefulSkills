# Windows hosted-CI follow-up

The first hosted run on `dea01dbe298432d8b6b18ad4be8c619d72176050`
passed security and Ubuntu, but failed four hook tests on Windows. The required
`quality` aggregate correctly failed because `tests` was not successful.

The runner selected Git for Windows 2.56.0 through its `bin` entrypoint. The
existing security contract admits the pinned 2.54.0.windows.1 image through
`cmd/git.exe` or `mingw64/bin/git.exe`. CI now prepares that supported image and
selects `cmd` first. The installer SHA-256 is checked against the immutable
[official release](https://github.com/git-for-windows/git/releases/tag/v2.54.0.windows.1):
`2b96e7854f0520f0f6b709c21041d9801b1be44d5e1a0d9fa621b2fbc40f1983`.
The installed version is checked before dependency preparation. No production
Git trust rule or admitted version was broadened.

The remaining failures came from TEMP using an 8.3 alias while the installer
uses physical long paths. Two expected diagnostics compared the different
spellings; the race observer also watched the wrong lexical transaction path.
The test fixture now canonicalizes its existing temporary root immediately,
so its expectations and observers identify the same physical directory as the
installer. All assertions and failure behavior are retained.

Directed validation: all four affected cases passed on the local Windows host,
and all four passed again with TEMP/TMP set to a real 8.3 alias. The native
consumer suite passed 42/42 after the separate route-receipt correction.
The renewed hosted matrix is recorded separately. No result here supersedes the original
complete platform reports or certifies final Native/release readiness.

Model cost decision: the coordinating Sol agent completed the already diagnosed
two-file correction without another model handoff. A fresh assignment of this
bounded task would start with Luna; the additional native driver diagnosis was
handled by the existing context-bearing Native agent. Regression execution uses
Node/Vitest and does not call a model.

The next hosted run, on `18b484c0620d72d19930922fd0af5b8ec9ed492d`,
stopped before tests because the in-place Git installer returned exit 1.
The correction was assigned to Luna at medium effort: a bounded workflow-only
task, with no Native context required. It now removes the runner's preinstalled
Git using only its expected absolute uninstaller before installing the verified
supported version, and reports discovery and version diagnostics. Installer and
uninstaller execution is restricted to the disposable hosted runner; neither
was run on the development host. YAML and PowerShell syntax parsing passed;
actual setup acceptance remains subject to the next hosted run.

Feature-branch push events previously produced an omitted `quality` job in
parallel with the real PR run. GitHub counted that skipped result as an
acceptable required check even while the PR matrix was pending or failing.
Push CI now runs only on the discovered default branch, `main`; pull requests
still run security, both platform suites and the same aggregate `quality`.
The merge gate must be assessed from that complete PR workflow.

On `1db4564dcc70b43d55e0d9e530f2674ce13eed80`, Windows preparation
successfully installed and selected Git 2.54.0.windows.1. `npm ci` then failed
in its hook preparation with the generic Windows metadata validation error,
approximately 30 seconds after invoking the bounded probe. Timeout remains a
hypothesis, not an established cause. The aggregate correctly failed.

A CI-only diagnostic now wraps the real `spawnSync` dependency of the existing
factory. It preserves arguments, environment, limits and returned results, and
records only status/error code/signal/elapsed time and bounded stderr. It does
not log the environment or metadata stdout. On the development Windows host,
the actual diagnostic passed admission: its metadata and binding probes exited
zero in 3005 ms and 722 ms. The subsequent Git query returned 1 because the
optional hooks configuration was absent, which the installer already accepts.
No timeout or trust check has been relaxed; hosted evidence is still pending.

The full hosted suite on `f14c572b1b174ec7cacb723173a6063bc15ee7e2`
reached tests and recorded 1323 passed, two failed and 46 platform/capability
skips (1371 total). Ubuntu and security passed. The stdin wrapper case took
109336 ms, exceeding its 90-second test budget; it invokes three independently
checked wrappers. Its test-only Windows budget is now 180 seconds. The native
PowerShell probe remains bounded at 30 seconds.

The rollback race's real watcher previously had no startup handshake. The
fixture now requires its ready signal after an initial observation poll before
starting the native transaction, bounded at ten seconds. A watcher that fails
to become ready is terminated and fails the test. Publication detection still
requires changed target bytes and transaction/stage evidence; no missing marker
or unobserved publication is accepted. Missing-marker assertions include the
child's error/stdout/stderr to diagnose any distinct subsequent failure.

Luna at medium effort implemented these bounded test-fixture changes. Both
affected Windows cases passed with the real Git 2.54.0 installation: two passed
in 84.29 seconds; 42 other cases were excluded by the directed selector rather
than certified as platform skips. Coordinator review retained all assertions
and added termination on readiness timeout. Syntax/diff checks passed. The
complete hosted matrix must validate the resulting candidate.
