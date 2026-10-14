import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { seedUser } from '../src/data/seed.js';
import { checkCoverage, internalConsultation } from '../src/services/prefeasibility.js';
import { presentConsultation, coverageResponse } from '../src/services/coverageEngine.js';
import { coverageMapVersion } from '../src/services/coverageVersions.js';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { signLocation } from '../src/services/addressValidation.js';
import { randomUUID } from 'node:crypto';
import type { SupplierCoverageRecord, ConsultationRecord } from '../src/types.js';

const map: SupplierCoverageRecord = { id:'version-test', supplierId:'SUP-SERVNET', supplierName:'Red Servnet', sourceFileName:'version-test.kmz', color:'#123456', featureCount:1, polygonCount:1, updatedAt:'2026-10-01T00:00:00Z', updatedBy:'legacy', data:{type:'FeatureCollection',features:[{geometry:{type:'Polygon',coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]},properties:{name:'OnNet'}}]} };
const input: ConsultationRecord['input'] = { fullName:'Prueba de versiones', email:'map-qa@example.com', company:'QA', channel:'ENTERPRISE', address:'Sitio QA', city:'QA', product:'Internet dedicado', capacityMbps:100, latitude:0, longitude:0 };
test('map uploads persist atomic activity, unique sequential revisions and immutable consultation provenance', async () => {
  const dir = await mkdtemp(join(tmpdir(),'lp-map-versions-'));
  try {
    const path = join(dir,'state.json'); const repo = new FileRepository(path);
    const first = await repo.upsertSupplierCoverage(map,seedUser);
    assert.equal(first.mapVersion!.version,1);
    assert.match(first.mapVersion!.sha256!,/^[a-f0-9]{64}$/);
    const saved = {code:'ABCDEFGH',input,coverage:checkCoverage(input,[first]),opportunity:{id:'OP-test'},pricing:{status:'PENDING'},createdAt:new Date().toISOString()} as ConsultationRecord;
    const changed = {...map,data:{...map.data,features:map.data.features.map(f=>({...f,properties:{name:'NearNet'}}))}};
    const updates = await Promise.all([repo.upsertSupplierCoverage(changed,seedUser),repo.upsertSupplierCoverage(map,seedUser)]);
    assert.deepEqual(updates.map(m=>m.mapVersion!.version),[2,3]);
    assert.equal(new Set([first,...updates].map(m=>m.mapVersion!.revisionId)).size,3);
    assert.notEqual(first.mapVersion!.sha256,updates[0].mapVersion!.sha256);
    const events = await repo.listCoverageActivity(map.supplierId,seedUser);
    assert.equal(events.length,3);
    assert.equal(events[0].previousMap!.version,2);
    assert.equal(events[2].action,'CREATED');
    assert.equal(events[0].actor.email,seedUser.email);
    const reloaded = new FileRepository(path);
    assert.deepEqual(await reloaded.listCoverageActivity(map.supplierId,seedUser),events);
    assert.deepEqual((await reloaded.listSupplierCoverages(seedUser))[0].mapVersion,updates[1].mapVersion);
    const result = internalConsultation(saved);
    assert.deepEqual(result.coverage.versions,[first.mapVersion]);
    assert.equal(result.coverage.technologies.find(t=>t.technology==='FO')!.classification,'on-net');
    assert.equal(coverageResponse(saved.coverage).policyVersion,'lp-map-v3');
    assert.deepEqual(internalConsultation(JSON.parse(JSON.stringify(saved))).coverage.versions,[first.mapVersion]);
    const external = {...seedUser,participantId:'external',roles:['supplier_user' as const]};
    assert.deepEqual(await repo.listCoverageActivity(map.supplierId,external),[]);
    await assert.rejects(repo.upsertSupplierCoverage(map,external));
    assert.equal((await repo.listCoverageActivity(map.supplierId,seedUser)).length,3);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('legacy maps get a reproducible baseline without fabricated history; failed writes roll back map and log', async () => {
  const dir = await mkdtemp(join(tmpdir(),'lp-map-rollback-'));
  try {
    const path = join(dir,'state.json');
    await writeFile(path,JSON.stringify({supplierCoverages:[map]}));
    const repo = new FileRepository(path);
    assert.deepEqual((await repo.listSupplierCoverages(seedUser))[0].mapVersion,coverageMapVersion(map));
    assert.deepEqual(await repo.listCoverageActivity(map.supplierId,seedUser),[]);
    assert.equal((await repo.upsertSupplierCoverage(map,seedUser)).mapVersion!.version,2);
    const brokenPath = join(dir,'broken'); const broken = new FileRepository(brokenPath);
    await broken.listSupplierCoverages(seedUser); await mkdir(brokenPath);
    await assert.rejects(broken.upsertSupplierCoverage(map,seedUser));
    assert.deepEqual(await broken.listSupplierCoverages(seedUser),[]);
    assert.deepEqual(await broken.listCoverageActivity(map.supplierId,seedUser),[]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('API exposes map revision in every new consultation and records each upload with paginated activity', async () => {
  const server = app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.on('listening',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');const url=`http://127.0.0.1:${address.port}/api/v1`;
  try {
    const upload = (expectedRevisionId?: string) => fetch(`${url}/suppliers/${map.supplierId}/coverage`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceFileName:map.sourceFileName,color:map.color,data:map.data,expectedRevisionId,mapVersion:{version:99}})});
    const first=await upload();assert.equal(first.status,200);const firstMap=(await first.json()).data;
    const locationToken=signLocation({...input,originalAddress:input.address,originalCity:input.city,latitude:0,longitude:0});
    const query=await fetch(`${url}/prefeasibility`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({...input,locationToken})});
    assert.equal(query.status,201);const consultation=(await query.json()).data;
    assert.deepEqual((await repository.getConsultation(consultation.code))!.coverage.versions.find(v=>v.id===firstMap.id),firstMap.mapVersion);
    const updated=await upload(firstMap.mapVersion.revisionId);assert.equal(updated.status,200);
    const page=await fetch(`${url}/suppliers/${map.supplierId}/coverage-activity?limit=1`);assert.equal(page.status,200);
    const history=(await page.json()).data;assert.equal(history.items.length,1);assert.equal(history.items[0].map.version,2);assert.ok(history.nextCursor);
    const next=await fetch(`${url}/suppliers/${map.supplierId}/coverage-activity?limit=1&before=${history.nextCursor}`);assert.equal((await next.json()).data.items[0].map.version,1);
    const stored=await repository.getConsultation(consultation.code);assert.ok(stored);
    assert.equal(stored.coverage.versions.find(v=>v.id===firstMap.id)!.version,1);
    assert.equal((await fetch(`${url}/suppliers/${map.supplierId}/coverage-activity?limit=1000`)).status,400);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
