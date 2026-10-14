import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { callbackReturnTo } from '../../web/src/auth/navigation.js';

test('OIDC callbacks restore only local routes', () => {
  const origin = 'https://linkpartner.example.com';
  assert.equal(callbackReturnTo('/coverage?site=1#result', origin), '/coverage?site=1#result');
  for (const value of [undefined, {}, 'https://outside.example', '//outside.example', '/\\outside.example', '/callback?code=old', '/%63allback']) {
    assert.equal(callbackReturnTo(value, origin), '/');
  }
});

test('staff OIDC and CX customer sessions are independent; private endpoints never accept a customer cookie', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'access-boundary', alg: 'RS256' };
  const issuerServer = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => issuerServer.once('listening', resolve));
  const issuerAddress = issuerServer.address(); assert.ok(issuerAddress && typeof issuerAddress !== 'string');
  const issuer = `http://127.0.0.1:${issuerAddress.port}`;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'oidc';
  process.env.DATA_BACKEND = 'memory';
  process.env.KEYCLOAK_AUTHORITY = issuer;
  const { app } = await import('../src/app.js');
  const { seedUser } = await import('../src/data/seed.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  const token = (audience = 'link-partner-frontend', expiration = '5m') => new SignJWT({ email: seedUser.email, name: seedUser.displayName })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject(seedUser.authUid).setIssuer(issuer)
    .setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey);
  try {
    for (const path of ['/opportunities', '/suppliers', '/supplier-coverages', '/digital-consultations']) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).data, undefined);
    }
    assert.equal((await fetch(`${url}/locations/config`)).status, 200);
    assert.equal((await fetch(`${url}/customers/consultations`)).status, 401);
    const registered = await fetch(`${url}/customers/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CX-Request': '1' },
      body: JSON.stringify({ fullName: 'Cliente de prueba', email: 'boundary@example.com', company: 'Cliente CX', password: 'Aa!bcdef' }),
    });
    assert.equal(registered.status, 201);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(`${url}/customers/consultations`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${url}/opportunities`, { headers: { Cookie: cookie } })).status, 401);
    const bearer = `Bearer ${await token()}`;
    assert.equal((await fetch(`${url}/opportunities`, { headers: { Authorization: bearer } })).status, 200);
    const staffCustomer = await fetch(`${url}/customers/me`, { headers: { Authorization: bearer } });
    assert.equal((await staffCustomer.json()).data, null);
    assert.equal((await fetch(`${url}/customers/consultations`, { headers: { Authorization: bearer } })).status, 401);
    for (const invalid of [await token('cx-customer'), await token('link-partner-frontend', '-1m')]) {
      assert.equal((await fetch(`${url}/opportunities`, { headers: { Authorization: `Bearer ${invalid}` } })).status, 401);
    }
  } finally {
    server.closeAllConnections(); issuerServer.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => issuerServer.close(() => resolve()))]);
  }
});
