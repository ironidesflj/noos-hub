import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient } from '../lib/mielina/github.js';

// GitHub Actor exposes login, but id is only available on concrete Node types.
// Existing fetch doubles accepted invalid GraphQL and hid production 502s.
test('subject reads and comment writes select Actor IDs through typed fragments', async () => {
  const client = new GitHubClient({
    repo: 'ironidesflj/noos-hub', token: 'test-only',
    fetchImpl: async (_url, options) => {
      const { query } = JSON.parse(options.body);
      if (/author\s*\{\s*id\b/.test(query)) {
        return { ok: true, json: async () => ({ errors: [{ message: "Field 'id' doesn't exist on type 'Actor'" }] }) };
      }
      assert.match(query, /author\s*\{\s*login\s+\.\.\. on User\s*\{\s*id\s*\}/);
      const comment = { __typename: 'DiscussionComment', id: 'DC_TEST', author: { id: 'U_TEST', login: 'tester' }, discussion: { id: 'D_TEST', title: 'RAN-DBDEA-00001', repository: { nameWithOwner: 'ironidesflj/noos-hub' } } };
      return { ok: true, json: async () => ({ data: query.includes('addDiscussionComment') ? { addDiscussionComment: { comment } } : { node: comment } }) };
    },
  });
  assert.equal((await client.getSubject('DC_TEST')).authorId, 'U_TEST');
  assert.equal((await client.getDiscussionComment('DC_TEST')).authorId, 'U_TEST');
  assert.equal((await client.addDiscussionComment({ discussionId: 'D_TEST', body: 'Test' })).authorId, 'U_TEST');
});
