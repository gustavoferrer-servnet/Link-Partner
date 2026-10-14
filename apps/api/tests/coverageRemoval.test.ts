import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { seedUser } from '../src/data/seed.js';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { signLocation } from '../src/services/addressValidation.js';
import { checkCoverage } from '../src/services/prefeasibility.js';
import type { SupplierCoverageRecord, ConsultationRecord } from '../src/types.js';
const geometry = (offset: number) => ({ type: 'Polygon' as const, coordinates: [[[offset-1,-1],[offset+1,-1],[offset+1,1],[offset-1,1],[offset-1,-1]]] });
const map: SupplierCoverageRecord = { id:'removal-fo', supplierId:'SUP-SERVNET', supplierName:'Red Servnet', sourceFileName:'FO.kmz', color:'#14789f', featureCount:1, polygonCount:1, updatedAt:'2026-10-01T00:00:00Z', updatedBy:'QA', data:{type:'FeatureCollection',features:[{type:'Feature',properties:{name:'FO OnNet'},geometry:geometry(0)}]} };
const input: ConsultationRecord['input'] = { fullName:'QA Retiro', email:'removal@example.test', company:'QA', channel:'ENTERPRISE', address:'Sitio de prueba', city:'QA', product:'Internet dedicado', capacityMbps:100, latitude:0, longitude:0 };

test('retire only one selected map atomically, preserve its sibling and evidence, persist archive and restore as a new revision', async () => {
  const directory=await mkdtemp(join(tmpdir(),'lp-retirement-'));
  try {
    const path=join(directory,'state.json');let repo=new FileRepository(path);
    const first=await repo.upsertSupplierCoverage(map,seedUser,null);
    const sibling=await repo.upsertSupplierCoverage({...map,id:'removal-mw',sourceFileName:'MW.kmz',data:{...map.data,features:[{type:'Feature',properties:{name:'MW'},geometry:geometry(8)}]}},seedUser,null);
    const historical=checkCoverage(input,await repo.listSupplierCoverages(seedUser));
    const updated=await repo.upsertSupplierCoverage({...map,sourceFileName:'FO-nueva.kmz',data:{...map.data,features:[{type:'Feature',properties:{name:'FO OnNet'},geometry:geometry(10)}]}},seedUser,first.mapVersion!.revisionId);
    assert.equal((await repo.listSupplierCoverages(seedUser)).length,2);
    await assert.rejects(repo.retireSupplierCoverage(map.id,'SUP-WRONG',seedUser,updated.mapVersion!.revisionId!),/proveedor/);
    await assert.rejects(repo.retireSupplierCoverage(map.id,map.supplierId,seedUser,first.mapVersion!.revisionId!),/cambió/);
    await assert.rejects(repo.retireSupplierCoverage(map.id,map.supplierId,{...seedUser,roles:['viewer']},updated.mapVersion!.revisionId!),/administrar/);
    await repo.retireSupplierCoverage(map.id,map.supplierId,seedUser,updated.mapVersion!.revisionId!);
    repo=new FileRepository(path);
    assert.deepEqual(await repo.listSupplierCoverages(seedUser),[sibling]);
    const [archived]=await repo.listRetiredSupplierCoverages(map.supplierId,seedUser);
    assert.deepEqual(archived.record,updated);
    assert.equal(await repo.getSupplierCoverage(map.id,seedUser),null);
    assert.equal(checkCoverage({...input,longitude:10},await repo.listSupplierCoverages(seedUser)).status,'NO_COVERAGE');
    assert.equal(historical.versions.find(item=>item.id===map.id)!.version,1);
    await assert.rejects(repo.restoreSupplierCoverage(map.id,map.supplierId,seedUser,randomUUID()),/retiro/);
    const restored=await repo.restoreSupplierCoverage(map.id,map.supplierId,seedUser,archived.activityId);
    assert.equal(restored.id,updated.id);assert.equal(restored.mapVersion!.version,3);assert.notEqual(restored.mapVersion!.revisionId,updated.mapVersion!.revisionId);
    assert.deepEqual(restored.data,updated.data);
    assert.deepEqual((await new FileRepository(path).listSupplierCoverages(seedUser)).find(item=>item.id===sibling.id),sibling);
    assert.equal((await new FileRepository(path).listRetiredSupplierCoverages(map.supplierId,seedUser)).length,0);
    assert.equal(checkCoverage({...input,longitude:10},await repo.listSupplierCoverages(seedUser)).status,'AVAILABLE');
    assert.equal(checkCoverage(input,await repo.listSupplierCoverages(seedUser)).status,'NO_COVERAGE');
    await assert.rejects(repo.restoreSupplierCoverage(map.id,map.supplierId,seedUser,archived.activityId),/restaurado/);
    const log=await repo.listCoverageActivity(map.supplierId,seedUser);
    assert.equal(log.filter(item=>item.action==='DELETED').length,1);assert.equal(log.filter(item=>item.action==='RESTORED').length,1);
    assert.equal(log.find(item=>item.action==='DELETED')!.actor.authUid,seedUser.authUid);
    await repo.retireSupplierCoverage(map.id,map.supplierId,seedUser,restored.mapVersion!.revisionId!);
    const [retiredAgain]=await repo.listRetiredSupplierCoverages(map.supplierId,seedUser);
    await repo.upsertSupplierCoverage({...map,id:'new-id',sourceFileName:restored.sourceFileName},seedUser,null);
    await assert.rejects(repo.restoreSupplierCoverage(map.id,map.supplierId,seedUser,retiredAgain.activityId),/duplicará/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('API deletion and restoration require exact map, revision and retirement; new queries exclude removed maps, historical queries keep their evidence', async () => {
  const supplier=await repository.createSupplier({id:'SUP-REMOVAL-QA',name:'Removal QA',legalName:'Removal QA',kind:'Carrier',status:'Pendiente de homologación',sla:null,score:null,activeLinks:0,contractEnd:null},seedUser);
  const first=await repository.upsertSupplierCoverage({...map,supplierId:supplier.id,supplierName:supplier.name},seedUser,null);
  const sibling=await repository.upsertSupplierCoverage({...map,id:'api-removal-mw',sourceFileName:'MW.kmz',supplierId:supplier.id,supplierName:supplier.name,data:{...map.data,features:[{type:'Feature',properties:{name:'MW'},geometry:geometry(8)}]}},seedUser,null);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/api/v1`;
  const call=(path:string,method='GET',body?:object)=>fetch(url+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const path=`/suppliers/${supplier.id}/coverages/${first.id}`;
  const query=async()=>{const response=await fetch(url+'/prefeasibility',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({...input,locationToken:signLocation({...input,originalAddress:input.address,originalCity:input.city})})});assert.equal(response.status,201);return(await response.json()).data;};
  try {
    const historical=await query();
    assert.equal((await call(path,'DELETE',{})).status,428);
    assert.equal((await call(path,'DELETE',{expectedRevisionId:randomUUID()})).status,409);
    assert.equal((await call(`/suppliers/SUP-WRONG/coverages/${first.id}`,'DELETE',{expectedRevisionId:first.mapVersion!.revisionId})).status,409);
    const response=await call(path,'DELETE',{expectedRevisionId:first.mapVersion!.revisionId});assert.equal(response.status,200);
    assert.equal((await call(`/supplier-coverages/${first.id}`)).status,404);
    const retired=await call(`/suppliers/${supplier.id}/retired-coverages`);assert.equal(retired.headers.get('cache-control'),'no-store');const [archive]=(await retired.json()).data;
    assert.equal(archive.sourceFileName,first.sourceFileName);assert.equal(archive.record,undefined);assert.equal(archive.data,undefined);
    assert.deepEqual(await repository.getSupplierCoverage(sibling.id,seedUser),sibling);
    const next=await query();assert.ok(!(await repository.getConsultation(next.code))!.coverage.versions.some((version:{id:string})=>version.id===first.id));
    assert.equal((await repository.getConsultation(historical.code))!.coverage.versions.find(item=>item.id===first.id)!.version,1);
    assert.equal((await call(path+'/restore','POST',{})).status,428);
    assert.equal((await call(path+'/restore','POST',{activityId:randomUUID()})).status,409);
    const restored=await call(path+'/restore','POST',{activityId:archive.activityId});assert.equal(restored.status,200);assert.equal((await restored.json()).data.mapVersion.version,2);
    assert.equal((await call(path+'/restore','POST',{activityId:archive.activityId})).status,409);
    assert.equal((await repository.listSupplierCoverages(seedUser)).filter(item=>item.supplierId===supplier.id).length,2);
    const log=await repository.listCoverageActivity(supplier.id,seedUser);assert.ok(log.some(item=>item.action==='DELETED'));assert.ok(log.some(item=>item.action==='RESTORED'));
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
