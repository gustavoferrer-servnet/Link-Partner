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
import { signLocation } from '../src/services/addressValidation.js';
import { consultationEmailMessage } from '../src/services/consultationEmail.js';
import type { SupplierCoverageRecord } from '../src/types.js';

test('1–10 locations share one code and opportunity, preserve per-site evidence and ownership, never infer cross-site redundancy', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  const point = (index: number) => {
    const input = { address: `Localidad de prueba ${index}`, city: 'Ciudad de prueba', latitude: index, longitude: index };
    return { ...input, locationToken: signLocation({ ...input, originalAddress: input.address, originalCity: input.city }) };
  };
  const polygon = (index: number) => ({ type: 'Feature', properties: { name: 'FO OnNet' }, geometry: { type: 'Polygon', coordinates: [[[index-.1,index-.1],[index+.1,index-.1],[index+.1,index+.1],[index-.1,index+.1],[index-.1,index-.1]]] } });
  const map = (id: string, index: number): SupplierCoverageRecord => ({ id, supplierId: index === 1 ? 'SUP-SERVNET' : 'SUP-ALESTRA', supplierName: id, sourceFileName: `${id}.kmz`, featureCount: 1, polygonCount: 1, color: '#123456', updatedAt: new Date().toISOString(), updatedBy: 'QA', data: { type: 'FeatureCollection', features: [polygon(index)] } });
  const common = { fullName: 'Cliente multisede', email: 'multi@example.com', company: 'Empresa multisede', product: 'Internet dedicado', capacityMbps: 100, channel: 'ENTERPRISE' };
  const post = (path: string, body: unknown, key = randomUUID(), headers: Record<string,string> = {}) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-CX-Request': '1', ...headers }, body: JSON.stringify(body) });
  try {
    await repository.upsertSupplierCoverage(map('supplier-one', 1), seedUser, null);
    await repository.upsertSupplierCoverage(map('supplier-two', 2), seedUser, null);
    for (const locations of [[], Array.from({length:11},(_, index)=>point(index+1)), [point(1),point(1)]]) {
      assert.equal((await post('/prefeasibility', { ...common, locations })).status, 400);
    }
    const before = (await repository.listConsultations(seedUser)).length;
    assert.equal((await post('/prefeasibility', { ...common, locations: [point(1), {...point(2), address:'Dirección modificada'}] })).status, 422);
    assert.equal((await repository.listConsultations(seedUser)).length, before);
    let savedCode = '';
    for (const channel of ['ENTERPRISE', 'WHOLESALE']) {
      const payload = { ...common, channel, locations: Array.from({length:10},(_,index)=>point(index+1)) };
      const key = randomUUID();
      const responses = await Promise.all([post('/prefeasibility',payload,key), post('/prefeasibility',payload,key)]);
      assert.equal(responses[0].status, 201);
      const result = (await responses[0].json()).data;
      assert.equal((await responses[1].json()).data.code, result.code);
      assert.match(result.code, /^[A-HJ-NP-Z2-9]{6}$/);
      assert.equal(result.locations.length,10); assert.equal(result.coverage.status,'PENDING');
      assert.deepEqual(result.locations.map((location: any)=>location.coverage.status), ['AVAILABLE','AVAILABLE',...Array(8).fill('NO_COVERAGE')]);
      assert.equal(result.proposalOptions.carrierRedundancyAvailable,false);
      assert.equal(result.proposalOptions.routeCount,1);
      const stored = await repository.getConsultation(result.code); assert.ok(stored);
      assert.equal(stored.opportunity.prefeasibility?.locations?.length,10);
      assert.equal((await repository.getOpportunity(result.opportunityId,seedUser))?.prefeasibility?.locations?.length,10);
      assert.equal(result.locations[0].coverage.suppliers,undefined);
      assert.equal(result.locations[0].coverage.versions, undefined);
      assert.deepEqual(stored.locations![0].coverage.versions, stored.locations![9].coverage.versions);
      const recovered = await post(`/consultations/${result.code}/retrieve`,{email:common.email});
      assert.deepEqual((await recovered.json()).data.locations, result.locations);
      assert.equal((await post('/prefeasibility',{...payload,locations:[...payload.locations.slice(0,9),point(11)]},key)).status,409);
      const email = consultationEmailMessage(stored); assert.match(email.text,/Localidad 10: Localidad de prueba 10/);
      savedCode=result.code;
    }
    const registered=await post('/customers/register',{fullName:common.fullName,email:common.email,company:common.company,password:'Aa!bcdef'});
    assert.equal(registered.status,201); const cookie=registered.headers.get('set-cookie')!.split(';')[0]; const session=(await registered.json()).data;
    await post(`/customers/consultations/${savedCode}`,{},randomUUID(),{Cookie:cookie,'X-CSRF-Token':session.csrfToken});
    const history=await fetch(`${url}/customers/consultations`,{headers:{Cookie:cookie}});
    assert.equal((await history.json()).data[0].locations.length,10);
    const directory=await mkdtemp(join(tmpdir(),'multi-location-'));
    try {
      const file=join(directory,'state.json');const persistent=new FileRepository(file);await persistent.createConsultation((await repository.getConsultation(savedCode))!);
      assert.equal((await new FileRepository(file).getConsultation(savedCode))?.locations?.length,10);
    } finally { await rm(directory,{recursive:true,force:true}); }
    await repository.upsertSupplierCoverage({...map('supplier-two-overlap',1), supplierId:'SUP-ALESTRA'},seedUser,null);
    const redundant=await post('/prefeasibility',{...common, locations:[point(1),point(3)]});
    assert.equal(redundant.status,201);const redundancy=(await redundant.json()).data.proposalOptions;
    assert.equal(redundancy.carrierRedundancyAvailable,true);assert.equal(redundancy.carrierRedundancyRequested,true);
    assert.deepEqual(redundancy.redundancyLocations,[point(1).address]);
    const one = await post('/prefeasibility',{...common,...point(1)}); assert.equal(one.status,201);assert.equal((await one.json()).data.locations,undefined);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
