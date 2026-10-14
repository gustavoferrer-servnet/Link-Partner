import { internalConsultation } from '../src/services/prefeasibility.js';
import { config } from "../src/config.js";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { seedUser } from '../src/data/seed.js';
import { MemoryRepository } from '../src/repositories/MemoryRepository.js';
import { generateConsultationCode, reserveConsultation } from '../src/services/consultationCodes.js';
import { signLocation, verifyLocation, normalizeAddress, validateAddress, suggestAddress } from '../src/services/addressValidation.js';
import { featureTechnology } from '../src/services/coverageTechnology.js';
import { presentConsultation } from '../src/services/coverageEngine.js';
import { checkCoverage, containsPoint } from '../src/services/prefeasibility.js';
import type { AppUser, SupplierCoverageRecord } from '../src/types.js';

const input = { fullName: 'Ana María Pérez López', email: 'ana.perez@example.com', company: 'Empresa de Prueba', channel: 'ENTERPRISE' as const, address: 'Av. Reforma 222', city: 'CDMX', product: 'Internet dedicado' as const, capacityMbps: 500, latitude: 5, longitude: 5 };
const polygon = { type: 'Polygon', coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]], [[2,2],[3,2],[3,3],[2,3],[2,2]]] };
const layer: SupplierCoverageRecord = { id: 'coverage-test', supplierId: 'SUP-SERVNET', supplierName: 'Red Servnet', sourceFileName: 'test.kml', color: '#123456', featureCount: 1, polygonCount: 1, updatedAt: new Date().toISOString(), updatedBy: 'test', data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: polygon }] } };
test('coverage uses polygons and holes; absent evidence stays pending', () => {
  assert.equal(containsPoint(polygon, 5, 5), true);
  assert.equal(containsPoint(polygon, 2.5, 2.5), false);
  assert.equal(containsPoint(polygon, 20, 20), false);
  assert.equal(checkCoverage(input, []).status, 'PENDING');
  assert.equal(checkCoverage(input, [layer]).status, 'AVAILABLE');
  assert.equal(checkCoverage({ ...input, longitude: 20 }, [layer]).status, 'NO_COVERAGE');
  assert.equal(checkCoverage({ ...input, longitude: undefined, latitude: undefined }, [layer]).status, 'PENDING');
});
test('CX API: atomic opportunity, parallel retry, conflicts, private recovery and persistence', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  const key = randomUUID();
  const submit = (body = input, access = key, token = signLocation({ address: body.address, city: body.city, latitude: body.latitude, longitude: body.longitude, originalAddress: body.address, originalCity: body.city })) => fetch(`${url}/prefeasibility`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': access }, body: JSON.stringify({ ...body, locationToken: token }) });
  let directory = '';
  try {
    await repository.upsertSupplierCoverage(layer, seedUser);
    const responses = await Promise.all([submit({ ...input, email: ' ANA.PEREZ@EXAMPLE.COM ' }), submit()]);
    assert.ok(responses.every(r => r.status === 201));
    const [a,b] = await Promise.all(responses.map(r => r.json()));
    assert.equal(a.data.code, b.data.code);
    assert.match(a.data.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(a.data.code.length, 6);
    assert.equal(a.data.qualificationStatus, 'PRICING_PENDING');
    assert.equal(a.data.pricing.amount, null);
    assert.equal(a.data.accessHash, undefined);
    assert.equal(a.data.coverage.providerIds, undefined);
    assert.equal(a.data.coverage.technologies.find((item: {technology: string}) => item.technology === 'FO').status, 'AVAILABLE');
    assert.equal(a.data.coverage.suppliers, undefined);
    assert.equal((await repository.getConsultation(a.data.code))?.coverage.technologies?.find(item => item.technology === 'FO')?.status, 'AVAILABLE');
    assert.equal((await repository.listOpportunities(seedUser)).filter(o => o.id === a.data.opportunityId).length, 1);
    assert.equal((await submit({ ...input, capacityMbps: 1000 })).status, 409);
    assert.equal((await submit(input, 'invalid')).status, 400);
    assert.equal((await submit(input, randomUUID(), 'unvalidated-location-token')).status, 422);
    const validLocationToken = signLocation({ address: input.address, city: input.city, latitude: input.latitude, longitude: input.longitude, originalAddress: input.address, originalCity: input.city });
    assert.equal((await submit({ ...input, latitude: 6 }, randomUUID(), validLocationToken)).status, 422);
    assert.equal((await submit({ ...input, address: 'Otra avenida 100' }, randomUUID(), validLocationToken)).status, 422);
    const coverage = await fetch(`${url}/coverage/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: 5, longitude: 5 }) });
    assert.equal(coverage.status, 200);
    const evaluated = (await coverage.json()).data;
    assert.equal(evaluated.suppliers[0].classification, 'on-net');
    assert.equal(evaluated.policyVersion, 'lp-map-v3');
    assert.equal((await fetch(`${url}/consultations/${a.data.code}`)).status, 404);
    assert.equal((await fetch(`${url}/consultations/${a.data.code}`, { headers: { 'X-Consultation-Key': randomUUID() } })).status, 404);
    const recovered = await fetch(`${url}/consultations/${a.data.code}`, { headers: { 'X-Consultation-Key': key } });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).data.opportunityId, a.data.opportunityId);
    const recoverByEmail = (email: string, code = a.data.code) => fetch(`${url}/consultations/${code}/retrieve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    for (const email of ['  ANA.PEREZ@EXAMPLE.COM  ', input.email]) {
      const recovery = await recoverByEmail(email);
      assert.equal(recovery.status, 200);
      const result = (await recovery.json()).data;
      assert.equal(result.code, a.data.code);
      assert.equal(result.input.fullName, input.fullName);
      assert.equal(result.input.email, input.email);
      assert.equal(result.input.company, input.company);
      assert.equal(result.accessHash, undefined);
    }
    for (const email of ['otro@example.com', 'ana.perez+otra@example.com', input.company, '']) assert.equal((await recoverByEmail(email)).status, 404);
    assert.equal((await recoverByEmail(input.email, 'ZZZZZZZZ')).status, 404);
    const withoutContact = { ...input };
    delete (withoutContact as Partial<typeof input>).email;
    assert.equal((await submit(withoutContact, randomUUID())).status, 400);
    assert.equal((await submit({ ...input, company: '   ' }, randomUUID())).status, 400);
    assert.equal((await submit({ ...input, fullName: '   ' }, randomUUID())).status, 400);
    assert.equal((await submit({ ...input, email: 'no-es-email' }, randomUUID())).status, 400);
    assert.equal((await submit({ ...input, company: 'Otra empresa' })).status, 409);
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await recoverByEmail('no-coincide@example.com', 'YYYYYYYY')).status, 404);
    const limited = await recoverByEmail('no-coincide@example.com', 'YYYYYYYY');
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('Retry-After'));
    assert.equal((await recoverByEmail(input.email)).status, 200);
    assert.equal((await fetch(`${url}/consultations/${a.data.code}/retrieve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: input.company }) })).status, 404);
    const internalList = await fetch(`${url}/digital-consultations`);
    assert.equal(internalList.status, 200);
    assert.equal(internalList.headers.get('Cache-Control'), 'no-store');
    const listed = (await internalList.json()).data.find((item: { code: string }) => item.code === a.data.code);
    assert.equal(listed.fullName, input.fullName);
    assert.equal(listed.email, input.email);
    assert.equal(listed.company, input.company);
    assert.equal(listed.opportunityId, a.data.opportunityId);
    assert.equal(listed.accessHash, undefined);
    assert.equal(listed.requestHash, undefined);
    const internalDetail = await fetch(`${url}/digital-consultations/${a.data.code}`);
    assert.equal(internalDetail.status, 200);
    const detailed = (await internalDetail.json()).data;
    assert.equal(detailed.input.email, input.email);
    assert.equal(detailed.coverage.status, 'AVAILABLE');
    assert.equal(detailed.locationValidation.confirmedAddress, input.address);
    assert.equal(detailed.accessHash, undefined);
    assert.equal(detailed.requestHash, undefined);
    assert.equal((await fetch(`${url}/digital-consultations/ZZZZZZZZ`)).status, 404);
    const anonymousExternal: AppUser = { ...seedUser, roles: ['external_viewer'], participantId: null };
    assert.deepEqual(await repository.listConsultations(anonymousExternal), []);
    assert.equal(await repository.getInternalConsultation(a.data.code, anonymousExternal), null);
    const getUser = repository.getUserByAuthUid.bind(repository);
    repository.getUserByAuthUid = async () => anonymousExternal;
    try {
      assert.equal((await fetch(`${url}/digital-consultations`)).status, 403);
      assert.equal((await fetch(`${url}/digital-consultations/${a.data.code}`)).status, 403);
    } finally { repository.getUserByAuthUid = getUser; }
    assert.equal(await repository.getOpportunity(a.data.opportunityId, anonymousExternal), null);
    assert.equal((await repository.listOpportunities(anonymousExternal)).length, 0);
    const stored = await repository.getConsultation(a.data.code); assert.ok(stored);
    directory = await mkdtemp(join(tmpdir(), 'lp-cx-test-'));
    const path = join(directory, 'state.json');
    const file = new FileRepository(path);
    await Promise.all([file.createConsultation(stored), file.createConsultation(stored)]);
    const reloaded = new FileRepository(path);
    assert.equal((await reloaded.getConsultation(stored.code))?.requestHash, stored.requestHash);
    assert.equal((await reloaded.getConsultation(stored.code))?.input.company, input.company);
    assert.equal((await reloaded.getConsultation(stored.code))?.input.fullName, input.fullName);
    assert.equal((await reloaded.getConsultation(stored.code))?.input.email, input.email);
    assert.equal((await reloaded.getConsultationByAccessHash(stored.accessHash))?.code, stored.code);
    assert.equal((await reloaded.listOpportunities(seedUser)).filter(o => o.id === stored.opportunity.id).length, 1);
    assert.equal((await reloaded.listConsultations(seedUser))[0].code, stored.code);
    assert.equal((await reloaded.getInternalConsultation(stored.code, seedUser))?.input.email, input.email);
    const original = repository.listSupplierCoverages.bind(repository);
    repository.listSupplierCoverages = async () => { throw new Error('coverage offline'); };
    try {
      const failure = await submit(input, randomUUID());
      assert.equal(failure.status, 201);
      const failureRecord = (await failure.json()).data;
      assert.equal(failureRecord.qualificationStatus, 'VALIDATION_PENDING');
      const allConsultations = await fetch(`${url}/digital-consultations`);
      assert.ok((await allConsultations.json()).data.some((item: { code: string; coverageStatus: string }) => item.code === failureRecord.code && item.coverageStatus === 'ERROR'));
    } finally { repository.listSupplierCoverages = original; }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

test('address normalization and signed confirmation prevent edits and expired locations', () => {
  assert.equal(normalizeAddress('  Av.  Reforma   222, CDMX  '), 'Avenida Reforma 222, Ciudad de México');
  const location = { address: input.address, city: input.city, latitude: 5, longitude: 5, originalAddress: input.address, originalCity: input.city };
  const token = signLocation(location);
  assert.equal(verifyLocation(token)?.address, input.address);
  assert.equal(verifyLocation(token + 'x'), null);
  assert.equal(verifyLocation(signLocation(location, Date.now() - 1)), null);
});
test('address search returns multiple signed candidates and caches identical requests', async () => {
  const originalProvider = config.addressSearchProvider; config.addressSearchProvider = 'photon';
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify([
      { lat: '19.428', lon: '-99.162', display_name: 'Avenida Reforma 222, Ciudad de México, México', address: { city: 'Ciudad de México', house_number: '222' } },
      { lat: '19.429', lon: '-99.163', display_name: 'Avenida Reforma, Ciudad de México, México', address: { city: 'Ciudad de México' } },
    ]), { status: 200 });
  };
  try {
    const [a,b] = await Promise.all([validateAddress('Av. Reforma 222', 'CDMX'), validateAddress('Av. Reforma 222', 'CDMX')]);
    assert.equal(calls, 1);
    assert.equal(a.length, 2);
    assert.equal(b[0].precision, 'address');
    assert.equal(a[1].precision, 'street-or-area');
    assert.equal(verifyLocation(a[0].token)?.latitude, 19.428);
    assert.equal(verifyLocation(a[0].token)?.originalAddress, 'Av. Reforma 222');
    await validateAddress('Av. Reforma 222', 'CDMX');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; config.addressSearchProvider = originalProvider; }
});

test('short codes are reserved atomically, retry collisions and never overwrite consultations', async () => {
  const storage = new MemoryRepository();
  const record = {
    accessHash: randomUUID(), requestHash: randomUUID(), input,
    coverage: checkCoverage(input, []), qualificationStatus: 'FEASIBILITY_PENDING' as const,
    pricing: { status: 'PENDING' as const, amount: null, currency: 'MXN' as const, reason: 'Pending' },
    createdAt: new Date().toISOString(),
    opportunity: { id: '', origin: 'DIGITAL' as const, siteId: '', siteName: input.address, address: input.address, city: input.city, level: null, network: null, capacity: '500 Mbps', service: input.product, clientSla: 'Pending', deliveryDate: 'Pending', status: 'FEASIBILITY_PENDING', mrc: null, margin: null },
  };
  const first = await reserveConsultation(storage, record, () => 'ABCDEFGH');
  let attempts = 0;
  const second = await reserveConsultation(storage, { ...record, accessHash: randomUUID() }, () => attempts++ === 0 ? first.code : 'ZZZZZZZZ');
  assert.equal(attempts, 2);
  assert.equal(second.code, 'ZZZZZZZZ');
  assert.equal((await storage.getConsultation(first.code))?.accessHash, first.accessHash);
  const replay = await reserveConsultation(storage, record, () => '23456789');
  assert.equal(replay.code, first.code);
  const concurrent = await Promise.all(Array.from({ length: 100 }, () => reserveConsultation(storage, { ...record, accessHash: randomUUID() })));
  assert.equal(new Set(concurrent.map(r => r.code)).size, 100);
  assert.equal((await storage.listConsultations(seedUser)).length, 102);
  for (const r of concurrent) assert.match(r.code, /^[A-HJ-NP-Z2-9]{6}$/);
  for (let i = 0; i < 100; i++) assert.match(generateConsultationCode(), /^[A-HJ-NP-Z2-9]{6}$/);
});
test('internal Link Partner traffic does not consume the digital consultation quota', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    for (let i = 0; i < 35; i++) assert.equal((await fetch(`${url}/session`)).status, 200);
    const token = signLocation({ address: input.address, city: input.city, latitude: input.latitude, longitude: input.longitude, originalAddress: input.address, originalCity: input.city });
    const response = await fetch(`${url}/prefeasibility`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ ...input, locationToken: token }) });
    assert.equal(response.status, 201);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

test('autocomplete scopes search to Mexico, caches candidates and signs coordinates', async () => {
  const originalProvider = config.addressSearchProvider; config.addressSearchProvider = 'photon';
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.match(String(url), /photon/);
    assert.match(String(url), /bbox=/);
    return new Response(JSON.stringify({ features: [
      { geometry: { coordinates: [-99.16, 19.43] }, properties: { countrycode: 'MX', city: 'Ciudad de México', street: 'Reforma', housenumber: '222', country: 'México' } },
      { geometry: { coordinates: [2, 48] }, properties: { countrycode: 'FR', city: 'Paris' } },
    ] }), { status: 200 });
  };
  try {
    const first = await suggestAddress('Test Reforma 222');
    assert.equal(first.length, 1);
    assert.equal(verifyLocation(first[0].token)?.longitude, -99.16);
    assert.equal(verifyLocation(first[0].token)?.originalCity, '');
    await suggestAddress('Test Reforma 222');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; config.addressSearchProvider = originalProvider; }
});

test('autocomplete turns provider network failures into a recoverable service error', async () => {
  const originalProvider = config.addressSearchProvider; config.addressSearchProvider = 'photon';
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  try { await assert.rejects(suggestAddress('Network failure test'), error => error instanceof Error && 'status' in error && error.status === 503); }
  finally { globalThis.fetch = original; config.addressSearchProvider = originalProvider; }
});

test('MW and FO use independent feature distances, files, labels and the default FO rule', () => {
  const nearby = { type: 'Point', coordinates: [-99.16,19.43] };
  const far = { type: 'Point', coordinates: [-98,19] };
  const candidate = { ...input, latitude: 19.43, longitude: -99.16 };
  const mixed = { ...layer, sourceFileName: 'Servnet coverage.kml', data: { type: 'FeatureCollection' as const, features: [
    { geometry: { type: 'Polygon', coordinates: [[[-99.17,19.42],[-99.15,19.42],[-99.15,19.44],[-99.17,19.44],[-99.17,19.42]]] }, properties: { name: 'Cobertura Mw', __linkPartnerLayerPath: ['Servnet coverage','Cobertura Mw'] } },
    { geometry: far, properties: { name: 'COBERTURA FO CDMX' } },
  ] } };
  const result = checkCoverage(candidate,[mixed]);
  const supplier = result.suppliers![0];
  assert.equal(supplier.technologies?.find(item => item.technology === 'MW')?.status, 'AVAILABLE');
  assert.equal(supplier.technologies?.find(item => item.technology === 'FO')?.status, 'PENDING');
  assert.equal(supplier.technologies!.find(item => item.technology === 'FO')!.distanceMeters, null);
  const unlabelled = { ...layer, id: 'general', supplierId: 'SUP-GENERAL', supplierName: 'Proveedor general', data: { type: 'FeatureCollection' as const, features: [{ geometry: { type: 'Polygon', coordinates: [[[-99.17,19.42],[-99.15,19.42],[-99.15,19.44],[-99.17,19.44],[-99.17,19.42]]] } }] } };
  const combined = checkCoverage(candidate,[mixed,unlabelled]);
  assert.equal(combined.technologies?.find(item => item.technology === 'FO')?.status, 'AVAILABLE');
  assert.deepEqual(combined.technologies?.find(item => item.technology === 'FO')?.supplierNames, ['Proveedor general']);
  const generic = combined.suppliers!.find(item => item.supplierId === 'SUP-GENERAL')!;
  assert.equal(generic.technologies?.find(item => item.technology === 'MW')?.status, 'NO_COVERAGE');
  assert.equal(generic.technologies?.find(item => item.technology === 'FO')?.status, 'AVAILABLE');
  const microFile = checkCoverage(candidate,[{ ...unlabelled, sourceFileName: 'alestra-microondas.kmz', data: { type: 'FeatureCollection', features: [{ geometry: nearby }] } }]);
  assert.equal(microFile.technologies?.find(item => item.technology === 'MW')?.status, 'PENDING');
  assert.equal(microFile.technologies?.find(item => item.technology === 'FO')?.status, 'NO_COVERAGE');
  for (const [properties,file,expected] of [
    [{name:'COB_FO.1'},'general.kmz','FO'],
    [{name:'Fibra aerea 2026'},'general.kmz','FO'],
    [{technology:'MW',name:'Fibra'},'fibra.kmz','MW'],
    [{__linkPartnerLayerPath:['Mi red','Cobertura MW']},'general.kmz','MW'],
    [{name:'COB_RD.58'},'alestra-microondas.kmz','MW'],
    [{name:'Centro'},'alestra-fibra-optica.kmz','FO'],
    [{name:'Zona de transformación'},'general.kmz',null],
  ] as const) assert.equal(featureTechnology({properties},file),expected);
  const near = checkCoverage({ ...candidate, longitude:-99.149 },[mixed]);
  assert.equal(near.technologies?.find(item => item.technology === 'MW')?.status, 'NO_COVERAGE');
  assert.equal(near.technologies?.find(item => item.technology === 'MW')?.classification, 'off-net');
  const invalid = checkCoverage(candidate,[{...unlabelled,data:{type:'FeatureCollection',features:[{geometry:{type:'Unsupported'}}]}}]);
  assert.ok(invalid.technologies?.every(item => item.status === 'PENDING'));
  assert.ok(checkCoverage(candidate,[]).technologies?.every(item => item.status === 'PENDING'));
});

test('historical projection preserves the saved result and versions without re-evaluation', async () => {
  const saved = await repository.getConsultationByAccessHash((await repository.listConsultations(seedUser))[0].accessHash);
  assert.ok(saved);
  const historical = structuredClone(saved);
  delete historical.coverage.technologies;
  historical.coverage.suppliers?.forEach(item => { delete item.technologies; });
  const projected = await presentConsultation(historical);
  assert.equal(projected.coverage.status, historical.coverage.status);
  assert.equal(projected.coverage.checkedAt, historical.coverage.checkedAt);
  assert.equal(projected.coverage.technologies.find(item => item.technology === 'FO')?.status, 'PENDING');
  assert.equal('versions' in projected.coverage, false);
  assert.deepEqual(internalConsultation(historical).coverage.versions, historical.coverage.versions);
  const unavailable = await presentConsultation(historical);
  assert.ok(unavailable.coverage.technologies.every(item => item.status === 'PENDING'));
  assert.equal(historical.coverage.technologies, undefined);
});
