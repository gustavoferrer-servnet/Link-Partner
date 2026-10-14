import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { signLocation } from '../src/services/addressValidation.js';
import { consultationEmailMessage } from '../src/services/consultationEmail.js';
import { repository } from '../src/repositories/index.js';

test('email sends only saved consultation to its registered address; rejects wrong access, CSRF, duplicates and unavailable transport', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const root = `http://127.0.0.1:${address.port}/api/v1`;
  const from = config.mailFrom, createTransport = nodemailer.createTransport;
  const sent: unknown[] = [];
  let fail = false;
  nodemailer.createTransport = (() => ({ sendMail: async (message: unknown) => { if (fail) throw new Error('Private SMTP credentials must not leak'); sent.push(message); return { accepted: ['email-qa@example.com'] }; }, close() {} })) as typeof createTransport;
  const call = (path: string, body: unknown, headers: Record<string,string> = {}) => fetch(root + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CX-Request': '1', ...headers }, body: JSON.stringify(body) });
  async function create(email: string) {
    const input = { fullName: 'Correo QA', email, company: 'Prueba local', address: 'Dirección de prueba', city: 'CDMX', latitude: 5, longitude: 5, channel: 'ENTERPRISE', product: 'Internet dedicado', capacityMbps: 100 };
    const response = await call('/prefeasibility', { ...input, locationToken: signLocation({ ...input, originalAddress: input.address, originalCity: input.city }) }, { 'Idempotency-Key': randomUUID() });
    assert.equal(response.status, 201); return (await response.json()).data.code as string;
  }
  try {
    const code = await create('email-qa@example.com');
    const path = `/consultations/${code}/email`;
    config.mailFrom = undefined;
    assert.equal((await call(path, { email: 'email-qa@example.com' })).status, 503);
    config.mailFrom = 'authorized@servnet.mx';
    assert.equal((await call(path, { email: 'wrong@example.com' })).status, 404);
    assert.equal((await call(path, { email: 'email-qa@example.com', to: 'arbitrary@example.com' })).status, 400);
    assert.equal((await call(path, { email: 'email-qa@example.com' }, { 'X-CX-Request': '' })).status, 403);
    assert.equal((await call(path, { email: 'email-qa@example.com' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    const response = await call(path, { email: ' EMAIL-QA@EXAMPLE.COM ' });
    assert.equal(response.status, 200); assert.equal((await response.json()).data.status, 'ACCEPTED');
    assert.equal(sent.length, 1);
    const message = sent[0] as { to: string; text: string };
    assert.equal(message.to, 'email-qa@example.com'); assert.match(message.text, new RegExp(code));
    assert.match(message.text, /Sujeta|sujeta/); assert.doesNotMatch(message.text, /accessHash|requestHash|locationToken|password/);
    assert.deepEqual(consultationEmailMessage((await repository.getConsultation(code))!), sent[0]);
    const retry = await call(path, { email: 'email-qa@example.com' }); assert.equal(retry.status, 429); assert.ok(retry.headers.get('Retry-After'));
    fail = true;
    const failedCode = await create('failed-email-qa@example.com');
    const failed = await call(`/consultations/${failedCode}/email`, { email: 'failed-email-qa@example.com' });
    assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(await failed.json()), /Private|credentials/);
    assert.equal(sent.length, 1);
  } finally { nodemailer.createTransport = createTransport; config.mailFrom = from; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
