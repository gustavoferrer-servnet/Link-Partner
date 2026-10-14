import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

test('supplier manager directory is scoped to Hub app, instance and tenant; malformed, foreign, duplicate and revoked directories fail closed', async () => {
  const deploymentId = '123456789012345678901234';
  let mode = 'valid';
  const hub = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-hub-token');
    assert.equal(req.url, `/applications/link-partner/users?deploymentId=${deploymentId}&tenantSlug=servnet`);
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'revoked') { res.writeHead(403).end('{}'); return; }
    if (mode === 'unavailable') { res.writeHead(503).end('{}'); return; }
    if (mode === 'malformed') { res.end('{}'); return; }
    const user = { authUid: 'hub-user-1', email: 'gestor@example.test', displayName: 'Gestor asignado' };
    res.end(JSON.stringify({ status: 'success', data: {
      application: { slug: mode === 'app' ? 'another-app' : 'link-partner' },
      deployment: { _id: mode === 'deployment' ? 'wrong-instance' : deploymentId },
      tenant: { slug: mode === 'tenant' ? 'another-tenant' : 'servnet' },
      users: mode === 'duplicate' ? [user, user] : mode === 'empty' ? [] : [user],
    } }));
  }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => hub.once('listening', resolve));
  const address = hub.address(); assert.ok(address && typeof address !== 'string');
  Object.assign(process.env, { NODE_ENV: 'test', AUTH_MODE: 'oidc', HUB_API_URL: `http://127.0.0.1:${address.port}`, HUB_DEPLOYMENT_ID: deploymentId, HUB_INTERNAL_TENANT_SLUG: 'servnet' });
  const { supplierManagerUsers } = await import('../src/services/hubUsers.js');
  try {
    assert.deepEqual(await supplierManagerUsers('Bearer test-hub-token'), [{ authUid: 'hub-user-1', email: 'gestor@example.test', displayName: 'Gestor asignado', source: 'application-hub' }]);
    for (mode of ['app', 'deployment', 'tenant', 'duplicate', 'malformed', 'revoked', 'unavailable']) await assert.rejects(supplierManagerUsers('Bearer test-hub-token'));
    mode = 'empty'; assert.deepEqual(await supplierManagerUsers('Bearer test-hub-token'), []);
    await assert.rejects(supplierManagerUsers(), /Configura/);
  } finally { hub.closeAllConnections(); await new Promise<void>(resolve => hub.close(() => resolve())); }
});
