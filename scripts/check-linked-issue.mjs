// Read-only CI guard: a closing keyword must resolve to a real issue in this repo.
import { readFileSync } from "node:fs";

export async function checkLinkedIssue(event, { repository, token, fetchImpl = fetch }) {
  const pr = event.pull_request;
  if (!pr) throw Error("pull_request event required");
  // release-please's own generated update is identified by its machine branch,
  // release label and Conventional Commit title, all required together.
  const release = pr.head?.repo?.full_name === repository
    && ["github-actions[bot]", "release-please[bot]", repository?.split('/')[0]].includes(pr.user?.login)
    && /^release-please--branches--/.test(pr.head?.ref ?? "")
    && pr.labels?.some(label => label.name === "autorelease: pending")
    && /^chore\([^)]*\): release /i.test(pr.title ?? "");
  if (release) return { status: "NA", reason: "release-please generated release PR; its source changes were issue-linked before integration" };
  const numbers = [...new Set([...String(pr.body ?? "").matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#([1-9]\d*)\b/gi)].map(match => match[1]))];
  if (!numbers.length) throw Error("PR requires a closing issue reference such as Closes #47");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error("invalid repository identity");
  for (const number of numbers) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues/${number}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`Linked issue #${number} could not be verified (${response.status})`);
    const issue = await response.json();
    if (issue.pull_request || issue.number !== Number(number)) throw Error(`#${number} is not the referenced issue`);
  }
  return { status: "PASS", issues: numbers };
}

if (process.env.GITHUB_EVENT_PATH && process.argv[1]?.replaceAll('\\', '/').endsWith('/check-linked-issue.mjs')) {
  try {
    console.log(JSON.stringify(await checkLinkedIssue(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")), { repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
