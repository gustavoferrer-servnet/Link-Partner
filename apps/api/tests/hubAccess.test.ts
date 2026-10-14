import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

test('Hub-assigned internal users see shared data without admin rights; unassigned, external and revoked access fail closed', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'hub-access', alg: 'RS256' };
  const deployment = '123456789012345678901234';
  let revoked = false, hubCalls = 0;
  const hub = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/certs')) { res.end(JSON.stringify({ keys: [jwk] })); return; }
    assert.equal(req.url, `/applications/link-partner/access?deploymentId=${deployment}`);
    hubCalls++;
    const claims = JSON.parse(Buffer.from(req.headers.authorization!.split('.')[1], 'base64url').toString());
    if (claims.sub === 'unassigned' || revoked) { res.writeHead(403); res.end('{}'); return; }
    if (claims.sub === 'unavailable') { res.writeHead(500); res.end('{}'); return; }
    if (claims.sub === 'malformed') { res.end('{}'); return; }
    res.end(JSON.stringify({ status: 'success', data: {
      application: { slug: claims.sub === 'wrong-app' ? 'another-app' : 'link-partner' },
      deployment: { _id: claims.sub === 'wrong-instance' ? '223456789012345678901234' : deployment },
      tenant: { name: 'Servnet', slug: claims.sub === 'external' ? 'external-customer' : 'servnet' },
      email: claims.sub === 'wrong-identity' ? 'another@example.test' : claims.email, hubRole: 'admin',
    } }));
  }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => hub.once('listening', resolve));
  const address = hub.address(); assert.ok(address && typeof address !== 'string');
  const issuer = `http://127.0.0.1:${address.port}`;
  Object.assign(process.env, { NODE_ENV: 'test', AUTH_MODE: 'oidc', DATA_BACKEND: 'memory', KEYCLOAK_AUTHORITY: issuer, HUB_API_URL: issuer, HUB_DEPLOYMENT_ID: deployment, HUB_INTERNAL_TENANT_SLUG: 'servnet', BOOTSTRAP_ADMIN_EMAILS: '' });
  const { app } = await import('../src/app.js');
  const { repository } = await import('../src/repositories/index.js');
  const { seedUser } = await import('../src/data/seed.js');
  await repository.upsertSupplierCoverage({ id: 'hub-qa-map', supplierId: 'SUP-SERVNET', supplierName: 'Red Servnet', sourceFileName: 'hub-qa.kmz', color: '#14789f', featureCount: 1, polygonCount: 1, updatedAt: new Date().toISOString(), updatedBy: 'QA', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } }] } }, seedUser, null);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const apiAddress = server.address(); assert.ok(apiAddress && typeof apiAddress !== 'string');
  const url = `http://127.0.0.1:${apiAddress.port}/api/v1`;
  const token = (sub: string, aud = 'link-partner-frontend') => new SignJWT({ email: `${sub}@example.test`, name: 'Usuario asignado' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject(sub).setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  try {
    const assigned = await token('assigned');
    const headers = { Authorization: `Bearer ${assigned}` };
    const session = await fetch(`${url}/session`, { headers });
    assert.equal(session.status, 200); assert.equal(session.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await session.json()).data.roles, ['viewer']);
    const calls = hubCalls;
    const responses = await Promise.all(['/opportunities', '/suppliers', '/supplier-coverages/versions', '/deliveries'].map(path => fetch(url + path, { headers })));
    for (const response of responses) { assert.equal(response.status, 200); assert.ok((await response.json()).data.length > 0); }
    assert.equal(hubCalls, calls, 'Concurrent downloads reuse the validated assignment within five seconds');
    const create = await fetch(`${url}/suppliers`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Denied', legalName: 'Denied', kind: 'Carrier' }) });
    assert.equal(create.status, 403);
    for (const [path,method,body] of [['/suppliers/SUP-SERVNET/coverages/hub-qa-map','DELETE',{expectedRevisionId:'revision'}],['/suppliers/SUP-SERVNET/coverages/hub-qa-map/restore','POST',{activityId:'12345678-1234-1234-1234-123456789012'}]] as const) {
      assert.equal((await fetch(url+path,{method,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
    }
    for (const sub of ['unassigned','external','wrong-app','wrong-instance','wrong-identity']) {
      const response = await fetch(`${url}/suppliers`, { headers: { Authorization: `Bearer ${await token(sub)}` } });
      assert.equal(response.status, 403, sub); assert.equal((await response.json()).data, undefined);
    }
    for (const sub of ['unavailable','malformed']) assert.equal((await fetch(`${url}/session`, { headers: { Authorization: `Bearer ${await token(sub)}` } })).status, 503);
    const beforeInvalid = hubCalls;
    assert.equal((await fetch(`${url}/session`)).status, 401);
    assert.equal((await fetch(`${url}/session`, { headers: { Authorization: `Bearer ${await token('assigned','another-client')}` } })).status, 401);
    assert.equal(hubCalls, beforeInvalid);
    revoked = true;
    await setTimeout(5100);
    const denied = await fetch(`${url}/suppliers`, { headers });
    assert.equal(denied.status, 403); assert.equal((await denied.json()).data, undefined);
    assert.equal((await fetch(`${url}/customers/me`)).status, 200, 'CX stays public and independent');
  } finally {
    server.closeAllConnections(); hub.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => hub.close(() => resolve()))]);
  }
});
