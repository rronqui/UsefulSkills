import { describe, it, expect } from 'vitest';
import { checkLinkedIssue } from './check-linked-issue.mjs';
const repository = 'owner/repo';
const event = body => ({ pull_request: { body, title: 'fix: behavior', head: { ref: 'fix/47-behavior', repo: { full_name: repository } }, user: { login: 'contributor' }, labels: [] } });
describe('CI issue linkage', () => {
  it('verifies an actual issue and deduplicates closing references', async () => {
    const calls = [];
    const result = await checkLinkedIssue(event('Closes #47\nFixes #47'), { repository, token: 'synthetic', fetchImpl: async url => { calls.push(url); return { ok: true, json: async () => ({ number: 47 }) }; } });
    expect(result).toEqual({ status: 'PASS', issues: ['47'] });
    expect(calls).toHaveLength(1);
  });
  it.each(['', 'Closes #N', 'Related #47'])('rejects placeholders and nonclosing text: %s', async body => {
    await expect(checkLinkedIssue(event(body), { repository })).rejects.toThrow(/closing issue/);
  });
  it.each([
    { ok: false, status: 404 },
    { ok: true, json: async () => ({ number: 47, pull_request: {} }) },
  ])('rejects absent issues and PR numbers', async response => {
    await expect(checkLinkedIssue(event('Closes #47'), { repository, fetchImpl: async () => response })).rejects.toThrow();
  });
  it('limits the generated release exception to trusted authors in this repository', async () => {
    const generated = event('');
    Object.assign(generated.pull_request, { title: 'chore(main): release 0.5.0', labels: [{ name: 'autorelease: pending' }], user: { login: 'owner' } });
    generated.pull_request.head.ref = 'release-please--branches--main';
    expect((await checkLinkedIssue(generated, { repository })).status).toBe('NA');
    generated.pull_request.user.login = 'contributor';
    await expect(checkLinkedIssue(generated, { repository })).rejects.toThrow(/closing issue/);
  });
});
