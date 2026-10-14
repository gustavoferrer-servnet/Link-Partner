import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { seedUser, seedDeliveryProjects, seedSuppliers } from '../src/data/seed.js';
import { signLocation } from '../src/services/addressValidation.js';
import { reserveConsultation } from '../src/services/consultationCodes.js';
import { publicConsultation, internalConsultation } from '../src/services/prefeasibility.js';
import { consultationEmailMessage } from '../src/services/consultationEmail.js';
import { customerCookie, tokenHash, csrfForToken } from '../src/services/customerAuth.js';
import type { ConsultationRecord, SupplierCoverageRecord } from '../src/types.js';

function anonymous(value: unknown) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /CarrierPrivate|SecretPoP|PrivateMap|PrivateReason|supplierNames?|supplierId|providerIds|sourceFileName|revisionId|sha256|nearestPop"|nearbyPops|policyLevel|locationValidation|versions"/);
}
const input: ConsultationRecord['input'] = { channel: 'ENTERPRISE', address: 'Sitio QA anonimización', city: 'CDMX', product: 'Internet dedicado', capacityMbps: 100, latitude: 0, longitude: 0, fullName: 'Cliente QA', email: 'anonymous-qa@example.com', company: 'QA' };
const layer = (index: number): SupplierCoverageRecord => ({ id: `PrivateMap-${index}`, supplierId: `CarrierPrivate-${index}`, supplierName: `CarrierPrivate ${index}`, sourceFileName: `CarrierPrivate-${index}-MW.kmz`, color: '#123456', featureCount: 2, polygonCount: 1, updatedAt: new Date().toISOString(), updatedBy: 'QA', data: { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { technology: 'MW' }, geometry: { type: 'Polygon', coordinates: [[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]] } },
  { type: 'Feature', properties: { name: `SecretPoP ${index}`, __linkPartnerLayerPath: ['PoPs MW'] }, geometry: { type: 'Point', coordinates: [index * .01,0] } },
] } });

test('all CX channels allow only anonymous summaries, including historical recovery, account history, preference updates and email; internal evidence remains complete', async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const root = `http://127.0.0.1:${address.port}/api/v1`;
  const key = randomUUID();
  const call = async (path: string, method = 'GET', body?: unknown, headers: Record<string,string> = {}) => {
    const response = await fetch(root + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, `${path}: ${response.status}`); return (await response.json()).data;
  };
  try {
    for (const index of [1,2]) await repository.createSupplier({ ...seedSuppliers[1], id: `CarrierPrivate-${index}`, name: `CarrierPrivate ${index}`, legalName: `CarrierPrivate ${index}` }, seedUser);
    await repository.upsertSupplierCoverage(layer(1), seedUser); await repository.upsertSupplierCoverage(layer(2), seedUser);
    const payload = { ...input, locationToken: signLocation({ ...input, latitude: 0, longitude: 0, originalAddress: input.address, originalCity: input.city }) };
    const created = await call('/prefeasibility', 'POST', payload, { 'Idempotency-Key': key }); anonymous(created);
    assert.equal(created.coverage.routeCount, 2); assert.equal(created.proposalOptions.routeCount, 2);
    assert.equal(created.coverage.technologies[0].nearestPopDistanceMeters, 1112);
    anonymous(await call('/prefeasibility', 'POST', payload, { 'Idempotency-Key': key }));
    const original = (await repository.getConsultation(created.code))!;
    const historicalKey = randomUUID(); const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const historical = await reserveConsultation(repository, { ...original, accessHash: hash(historicalKey), requestHash: randomUUID(),
      coverage: { ...original.coverage, reason: 'PrivateReason CarrierPrivate' },
      services: [{ product: 'Internet dedicado', capacityMbps: 100, locationIndexes: [0], coverage: original.coverage }],
      pricing: { ...original.pricing, reason: 'PrivateReason CarrierPrivate' },
    }, () => 'ABCDEFGH');
    assert.equal(historical.code.length, 8);
    const before = structuredClone(historical);
    anonymous(publicConsultation(historical)); anonymous(consultationEmailMessage(historical));
    assert.deepEqual(internalConsultation(historical).coverage, before.coverage);
    assert.deepEqual(internalConsultation(historical).services, before.services);
    assert.deepEqual(historical, before);
    anonymous(await call(`/consultations/${historical.code}`, 'GET', undefined, { 'X-Consultation-Key': historicalKey }));
    anonymous(await call(`/consultations/${historical.code}/retrieve`, 'POST', { email: input.email }));
    anonymous(await call(`/consultations/${historical.code}/proposal-options`, 'PATCH', { email: input.email, carrierRedundancy: false }, { 'X-CX-Request': '1' }));
    const privateResult = await call(`/digital-consultations/${historical.code}`);
    assert.deepEqual(privateResult.coverage, before.coverage); assert.deepEqual(privateResult.services, before.services);
    assert.match(JSON.stringify(privateResult), /CarrierPrivate|SecretPoP|PrivateMap/);
    const token = randomBytes(32).toString('hex'); const customerId = randomUUID();
    await repository.createCustomer({ id: customerId, fullName: input.fullName!, company: input.company!, email: input.email!, passwordHash: 'unused-fixture', createdAt: new Date().toISOString() });
    await repository.saveCustomerSession({ tokenHash: tokenHash(token), customerId, expiresAt: new Date(Date.now() + 60000).toISOString() });
    const headers = { Cookie: `${customerCookie}=${token}`, 'X-CX-Request': '1', 'X-CSRF-Token': csrfForToken(token) };
    anonymous(await call(`/customers/consultations/${historical.code}`, 'POST', {}, headers));
    await repository.saveDeliveryProject({ ...structuredClone(seedDeliveryProjects[0]), opportunityId: historical.opportunity.id, stage: 'CarrierPrivate delivery', nextAction: 'Contactar CarrierPrivate', currentCommitment: 'PrivateReason CarrierPrivate' }, seedUser);
    const owned = await call(`/customers/consultations/${historical.code}`, 'GET', undefined, headers); anonymous(owned); assert.equal(owned.tracking.commitmentDate, null);
    anonymous(await call('/customers/consultations', 'GET', undefined, headers));
    assert.deepEqual((await repository.getConsultation(historical.code))!.coverage, before.coverage);
    // Additional historical/extension fields must never escape through object spreading.
    const extended = structuredClone(historical) as ConsultationRecord & { privateEvidence: string };
    extended.privateEvidence = 'CarrierPrivate'; Object.assign(extended.services![0], { privateEvidence: 'CarrierPrivate' }); Object.assign(extended.input, { privateEvidence: 'CarrierPrivate' });
    anonymous(publicConsultation(extended));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('unknown PoP reference or invalid distance never fabricates a public PoP distance', () => {
  const coverage = { status: 'PENDING', suppliers: [], versions: [], providerIds: [], checkedAt: '', reason: 'CarrierPrivate', technologies: [{ technology: 'MW', status: 'PENDING', nearestPop: { kind: 'NETWORK_REFERENCE', name: 'SecretPoP', distanceMeters: 20 } }] } as unknown as ConsultationRecord['coverage'];
  const record = { input, coverage, opportunity: { id: 'QA' }, pricing: { status: 'PENDING' }, code: 'ABCDEFGH' } as ConsultationRecord;
  assert.equal(publicConsultation(record).coverage.technologies[0].nearestPopDistanceMeters, null);
  Object.assign(coverage.technologies![0].nearestPop!, { kind: 'POP', distanceMeters: Infinity });
  assert.equal(publicConsultation(record).coverage.technologies[0].nearestPopDistanceMeters, null); anonymous(publicConsultation(record));
});
