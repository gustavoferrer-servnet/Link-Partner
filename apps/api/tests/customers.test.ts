import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { signLocation } from '../src/services/addressValidation.js';
import { seedUser, seedDeliveryProjects } from '../src/data/seed.js';
import { tokenHash, verifyPassword } from '../src/services/customerAuth.js';

test('customer accounts: private ownership, recovery, sessions, CSRF, live milestones and persistence', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  const password = 'Aa!bcdef'; // Exactly eight characters; a number is not required.
  const profile = { email: ' ANA.CUENTA@EXAMPLE.COM ', fullName: 'Ana María Pérez', company: 'Cuenta Demo' };
  type Session = { cookie: string; csrf: string; id: string };
  const call = (path: string, body?: unknown, session?: Session, extra?: Record<string,string>) => fetch(`${url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CX-Request': '1' }), ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const readSession = async (response: Response) => {
    const setCookie = response.headers.get('set-cookie'); assert.ok(setCookie); assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const body = await response.json(); assert.equal(body.data.customer.passwordHash, undefined);
    return { cookie: setCookie.split(';')[0], csrf: body.data.csrfToken, id: body.data.customer.id };
  };
  const input = { fullName: profile.fullName, email: profile.email.trim().toLowerCase(), company: profile.company, channel: 'ENTERPRISE' as const, address: 'Av. Reforma 222', city: 'CDMX', product: 'Internet dedicado', capacityMbps: 500, latitude: 5, longitude: 5 };
  const submit = (session?: Session, access = randomUUID(), email = input.email) => call('/prefeasibility', { ...input, email, locationToken: signLocation({ address: input.address, city: input.city, latitude: input.latitude, longitude: input.longitude, originalAddress: input.address, originalCity: input.city }) }, session, { 'Idempotency-Key': access });
  let directory = '';
  try {
    assert.equal((await call('/customers/consultations')).status, 401);
    assert.equal((await call('/customers/me')).headers.get('Cache-Control'), 'no-store');
    assert.equal((await call('/customers/me')).status, 200);
    assert.equal((await call('/customers/login', { email: input.email, password }, undefined, { 'X-CX-Request': '' })).status, 403);
    assert.equal((await call('/customers/register', { ...profile, password: 'short' })).status, 400);
    const invalidPasswords = ['Aa!bcde', 'aa!bcdef', 'AA!BCDEF', 'Aabcdef1', 'Aabcdef '];
    for (const [index, invalid] of invalidPasswords.entries()) {
      const response = await call('/customers/register', { ...profile, email: `invalid-password-${index}@example.com`, password: invalid });
      assert.equal(response.status, 400);
      assert.match((await response.json()).message, /8 a 128 caracteres.*mayúscula.*minúscula.*carácter especial/);
    }
    assert.equal((await call('/customers/register', { ...profile, password, roles: ['internal_admin'] })).status, 400);
    assert.equal((await call('/customers/register', { ...profile, password }, undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    const anonymous = await submit(); assert.equal(anonymous.status, 201); const anonymousCode = (await anonymous.json()).data.code;
    const registered = await call('/customers/register', { ...profile, password }); assert.equal(registered.status, 201); const ana = await readSession(registered);
    const customer = await repository.getCustomer(ana.id); assert.ok(customer); assert.equal(customer.email, input.email); assert.notEqual(customer.passwordHash, password); assert.match(customer.passwordHash, /^scrypt:/); assert.equal(await verifyPassword(password, customer.passwordHash), true);
    assert.equal((await repository.getCustomerSession(tokenHash(ana.cookie.split('=')[1])))?.customerId, ana.id);
    assert.equal((await call('/customers/register', { ...profile, password })).status, 409);
    assert.deepEqual((await (await call('/customers/consultations', undefined, ana)).json()).data, []); // No bulk email-based disclosure.
    assert.equal((await call(`/customers/consultations/${anonymousCode}`, undefined, ana)).status, 404);
    assert.equal((await call(`/customers/consultations/${anonymousCode}`, {}, ana, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await call(`/customers/consultations/${anonymousCode}`, {}, ana)).status, 200);
    assert.equal((await call(`/customers/consultations/${anonymousCode}`, {}, ana)).status, 200); // Idempotent import.
    const otherResponse = await call('/customers/register', { ...profile, email: 'otro.cuenta@example.com', password }); assert.equal(otherResponse.status, 201); const other = await readSession(otherResponse);
    assert.equal((await call(`/customers/consultations/${anonymousCode}`, undefined, other)).status, 404);
    assert.equal((await call(`/customers/consultations/${anonymousCode}`, {}, other)).status, 404);
    assert.deepEqual((await (await call('/customers/consultations', undefined, other)).json()).data, []);
    const access = randomUUID(); const createdResponse = await submit(ana, access); assert.equal(createdResponse.status, 201); const created = (await createdResponse.json()).data;
    assert.equal((await repository.getConsultation(created.code))?.customerId, ana.id);
    assert.equal((await submit(ana, access)).status, 201);
    assert.equal((await submit(other, access)).status, 400);
    assert.equal((await submit(undefined, access)).status, 409);
    assert.equal((await submit(ana, randomUUID(), 'no-coincide@example.com')).status, 400);
    assert.equal((await submit({ ...ana, csrf: '' })).status, 403);
    const history = (await (await call('/customers/consultations', undefined, ana)).json()).data;
    assert.equal(history.length, 2); assert.equal(history[0].customerId, undefined); assert.equal(history[0].accessHash, undefined); assert.equal(history[0].requestHash, undefined);
    const internal = await call('/digital-consultations'); assert.equal(internal.status, 200); assert.ok((await internal.json()).data.some((item: {code: string}) => item.code === created.code));
    const project = { ...structuredClone(seedDeliveryProjects[0]), opportunityId: created.opportunityId, stage: 'Instalación', nextAction: 'Confirmar visita con CARRIER-PRIVADO', currentCommitment: '2026-10-30' };
    await repository.saveDeliveryProject(project, seedUser);
    const tracking = (await (await call(`/customers/consultations/${created.code}`, undefined, ana)).json()).data.tracking;
    assert.equal(tracking.stage, 'Instalación'); assert.equal(tracking.commitmentDate, '2026-10-30'); assert.equal(tracking.nextAction, 'Tu asesor confirmará los avances y la fecha de entrega.'); assert.doesNotMatch(JSON.stringify(tracking), /CARRIER-PRIVADO/); assert.equal(tracking.tasks, undefined); assert.equal(tracking.installationStarted, true);
    const bad = await call('/customers/login', { email: input.email, password: 'incorrecta' }); const unknown = await call('/customers/login', { email: 'nadie@example.com', password: 'incorrecta' }); assert.equal(bad.status, 401); assert.deepEqual(await bad.json(), await unknown.json());
    const loginResponse = await call('/customers/login', { email: input.email, password }, ana); assert.equal(loginResponse.status, 200); const newSession = await readSession(loginResponse);
    assert.notEqual(newSession.cookie, ana.cookie); assert.equal((await call('/customers/consultations', undefined, ana)).status, 401);
    assert.equal((await call('/customers/logout', {}, newSession, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await call('/customers/logout', {}, newSession)).status, 200);
    assert.equal((await call('/customers/consultations', undefined, newSession)).status, 401);
    directory = await mkdtemp(join(tmpdir(), 'cx-accounts-'));
    const filePath = join(directory, 'state.json'); const files = new FileRepository(filePath);
    const account = { ...customer, email: 'persist@example.com' };
    const races = await Promise.allSettled([files.createCustomer(account), files.createCustomer({ ...account, id: randomUUID() })]); assert.equal(races.filter(item => item.status === 'fulfilled').length, 1);
    const record = (await repository.getConsultation(created.code))!; record.input.email = account.email;
    await files.createConsultation(record);
    await files.saveCustomerSession({ tokenHash: 'file-session', customerId: account.id, expiresAt: new Date(Date.now() + 60000).toISOString() });
    const reload = new FileRepository(filePath); assert.equal((await reload.getCustomerByEmail(account.email))?.id, account.id); assert.equal((await reload.listCustomerConsultations(account.id)).length, 1); assert.equal((await reload.getCustomerSession('file-session'))?.customerId, account.id);
    assert.equal(await reload.claimCustomerConsultation(record.code, 'thief', account.email), false);
    await reload.deleteCustomerSession('file-session'); assert.equal(await new FileRepository(filePath).getCustomerSession('file-session'), null);
    await repository.saveCustomerSession({ tokenHash: tokenHash(other.cookie.split('=')[1]), customerId: other.id, expiresAt: new Date(Date.now() - 1).toISOString() });
    assert.equal((await call('/customers/consultations', undefined, other)).status, 401);
    let limited: Response | undefined;
    for (let index = 0; index < 12; index++) { limited = await call('/customers/login', { email: 'rate-limit@example.com', password }); if (limited.status === 429) break; }
    assert.equal(limited?.status, 429); assert.ok(limited?.headers.get('Retry-After'));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); if (directory) await rm(directory, { recursive: true, force: true }); }
});
