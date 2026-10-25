import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalServer } from '../src/local-server.mjs';

test('local callable server verifies identity, preserves handler restrictions, and hides internal errors', async t => {
  let calls = 0;
  const server = createLocalServer({
    verifyToken: async token => { if (token !== 'valid-test-token') throw new Error('private'); return { uid: 'tester' }; },
    handlers: {
      nessieAccounts: async request => { calls++; assert.equal(request.auth.uid, 'tester'); return [{ id: 'account' }]; },
      nessieSnapshot: async () => { const error = new Error('Not an allowed tester.'); error.code = 'permission-denied'; throw error; },
      broken: async () => { throw new Error('Never return a secret'); },
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (name, token, body = { data: {} }) => fetch(`${origin}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await fetch(`${origin}/health`)).status, 200);
  assert.equal((await post('nessieAccounts')).status, 401);
  assert.equal((await post('nessieAccounts', 'invalid')).status, 401);
  assert.equal(calls, 0);
  assert.deepEqual(await (await post('nessieAccounts', 'valid-test-token')).json(), { result: [{ id: 'account' }] });
  assert.equal((await post('nessieSnapshot', 'valid-test-token')).status, 403);
  assert.equal((await post('nessieAccounts', 'valid-test-token', {})).status, 400);
  const failure = await post('broken', 'valid-test-token');
  assert.equal(failure.status, 500); assert.ok(!(await failure.text()).includes('secret'));
  assert.equal((await post('no-such-route', 'valid-test-token')).status, 404);
});
