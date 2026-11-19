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
