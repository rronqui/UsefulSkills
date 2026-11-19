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
