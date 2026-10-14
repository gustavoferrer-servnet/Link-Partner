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
import type { SupplierCoverageRecord, ConsultationRecord } from '../src/types.js';

test('Internet and L2L preserve independent capacities and paired ends, enforce limits, recover and persist without claiming transport feasibility', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  const point = (index: number) => {
    const input = { address: `Dirección confirmada ${index}`, city: 'Ciudad de prueba', latitude: index, longitude: index };
    return { ...input, locationToken: signLocation({ ...input, originalAddress: input.address, originalCity: input.city }) };
  };
  const map = (supplierId: string, indexes: number[]): SupplierCoverageRecord => ({ id: `map-${supplierId}`, supplierId, supplierName: supplierId, sourceFileName: `${supplierId}.kmz`, color: '#123456', featureCount: indexes.length, polygonCount: indexes.length, updatedAt: new Date().toISOString(), updatedBy: 'QA', data: { type: 'FeatureCollection', features: indexes.map(index => ({ type: 'Feature', properties: { name: 'FO OnNet' }, geometry: { type: 'Polygon', coordinates: [[[index-.1,index-.1],[index+.1,index-.1],[index+.1,index+.1],[index-.1,index+.1],[index-.1,index-.1]]] } })) } });
  const common = { fullName: 'Cliente servicios', email: 'servicios@example.test', company: 'Empresa servicios', channel: 'ENTERPRISE' };
  const post = (path: string, body: unknown, key = randomUUID(), headers: Record<string,string> = {}) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CX-Request': '1', 'Idempotency-Key': key, ...headers }, body: JSON.stringify(body) });
  const service = (capacityMbps: number, ...indexes: number[]) => ({ capacityMbps, locations: indexes.map(point) });
  try {
    await repository.upsertSupplierCoverage(map('SUP-SERVNET',[1]),seedUser,null);
    await repository.upsertSupplierCoverage(map('SUP-ALESTRA',[1,2]),seedUser,null);
    await repository.upsertSupplierCoverage(map('SUP-IENTC',[2]),seedUser,null);
    const invalid = [
      { product:'Internet dedicado', services:[service(49,1)] },
      { product:'Internet dedicado', services:[service(1001,1)] },
      { product:'Internet dedicado', services:[service(50.5,1)] },
      { product:'Internet dedicado', services:[service(50,1,2)] },
      { product:'L2L', services:[service(100,1)] },
      { product:'L2L', services:[service(100,1,1)] },
      { product:'L2L', services:Array.from({length:6},()=>service(100,1,2)) },
      { product:'MPLS', services:[service(100,1)] },
      { product:'Internet dedicado', services:[] },
    ];
    for (const payload of invalid) assert.equal((await post('/prefeasibility',{...common,...payload})).status,400);
    for (const capacityMbps of [49,1001]) assert.equal((await post('/prefeasibility',{...common,...point(1),product:'Internet dedicado',capacityMbps})).status,400);
    const before=(await repository.listConsultations(seedUser)).length;
    assert.equal((await post('/prefeasibility',{...common,product:'L2L',services:[{capacityMbps:100,locations:[point(1),{...point(2),address:'Modificación sin confirmar'}]}]})).status,422);
    assert.equal((await repository.listConsultations(seedUser)).length,before);
    const internetPayload={...common,product:'Internet dedicado',services:[service(50,1),service(1000,2)]};
    const key=randomUUID();const retries=await Promise.all([post('/prefeasibility',internetPayload,key),post('/prefeasibility',internetPayload,key)]);
    assert.equal(retries[0].status,201);const internet=(await retries[0].json()).data;
    assert.equal((await retries[1].json()).data.code,internet.code);
    assert.deepEqual(internet.services.map((item: {capacityMbps:number})=>item.capacityMbps),[50,1000]);
    assert.deepEqual(internet.locations.map((item: {input:{capacityMbps:number}})=>item.input.capacityMbps),[50,1000]);
    assert.equal(internet.coverage.status,'AVAILABLE');
    assert.equal((await post('/prefeasibility',{...internetPayload,services:[service(51,1),service(1000,2)]},key)).status,409);
    const storedInternet=await repository.getConsultation(internet.code);assert.ok(storedInternet);
    assert.equal(storedInternet.opportunity.prefeasibility?.services?.[1].capacityMbps,1000);
    assert.match(storedInternet.opportunity.capacity,/Servicio 2: 1000 Mbps/);
    let storedLink: ConsultationRecord | null=null;
    for (const channel of ['ENTERPRISE','WHOLESALE']) {
      const response=await post('/prefeasibility',{...common,channel,product:'L2L',services:[service(50,1,2),service(777,1,3)]});
      assert.equal(response.status,201);const link=(await response.json()).data;
      assert.deepEqual(link.services.map((item: {locationIndexes:number[]})=>item.locationIndexes),[[0,1],[2,3]]);
      assert.deepEqual(link.locations.map((item: {input:{capacityMbps:number}})=>item.input.capacityMbps),[50,50,777,777]);
      assert.equal(link.locations[0].coverage.status,'AVAILABLE');assert.equal(link.locations[1].coverage.status,'AVAILABLE');
      assert.equal(link.services[0].coverage.status,'PENDING');assert.equal(link.coverage.status,'PENDING');
      assert.match(link.services[0].coverage.reason,/transporte entre A y B/);
      assert.equal(link.proposalOptions.carrierRedundancyAvailable,false);assert.equal(link.proposalOptions.routeCount,1);
      assert.equal(link.locations[0].coverage.suppliers,undefined);
      assert.equal(link.locations[0].coverage.versions,undefined);
      const evidence = (await repository.getConsultation(link.code))!; assert.deepEqual(evidence.locations![0].coverage.versions,evidence.locations![3].coverage.versions);
      const recovery=await post(`/consultations/${link.code}/retrieve`,{email:common.email});assert.deepEqual((await recovery.json()).data.services,link.services);
      storedLink=await repository.getConsultation(link.code);assert.ok(storedLink);assert.equal(storedLink.opportunity.prefeasibility?.services?.[1].locationIndexes[1],3);
      const email=consultationEmailMessage(storedLink).text;assert.match(email,/Servicio 2: L2L · 777 Mbps/);assert.match(email,/Punta B: Dirección confirmada 3/);
    }
    const ten=await post('/prefeasibility',{...common,product:'Internet dedicado',services:Array.from({length:10},(_,i)=>service(50+i, i+1))});assert.equal(ten.status,201);
    const five=await post('/prefeasibility',{...common,product:'L2L',services:Array.from({length:5},(_,i)=>service(50+i,1,i+2))});assert.equal(five.status,201);assert.equal((await five.json()).data.locations.length,10);
    const directory=await mkdtemp(join(tmpdir(),'connectivity-services-'));
    try {const file=join(directory,'state.json');const persistent=new FileRepository(file);await persistent.createConsultation(storedLink!);assert.deepEqual((await new FileRepository(file).getConsultation(storedLink!.code))?.services,storedLink!.services);} finally {await rm(directory,{recursive:true,force:true});}
    const registered=await post('/customers/register',{fullName:common.fullName,email:common.email,company:common.company,password:'Aa!bcdef'});assert.equal(registered.status,201);const cookie=registered.headers.get('set-cookie')!.split(';')[0];const session=(await registered.json()).data;
    const owned=await post('/prefeasibility',{...common,product:'L2L',services:[service(250,1,2)]},randomUUID(),{Cookie:cookie,'X-CSRF-Token':session.csrfToken});assert.equal(owned.status,201);
    const history=await fetch(`${url}/customers/consultations`,{headers:{Cookie:cookie}});assert.equal((await history.json()).data[0].services[0].capacityMbps,250);
    await repository.upsertSupplierCoverage({...map('SUP-SERVNET',[1,2]),id:'map-servnet-both',sourceFileName:'servnet-both.kmz'},seedUser,null);
    const redundant=await post('/prefeasibility',{...common,product:'L2L',services:[service(100,1,2)]});assert.equal(redundant.status,201);assert.equal((await redundant.json()).data.proposalOptions.carrierRedundancyAvailable,true);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
