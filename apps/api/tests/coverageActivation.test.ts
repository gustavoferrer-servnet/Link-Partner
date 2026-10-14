import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { seedUser } from '../src/data/seed.js';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { signLocation } from '../src/services/addressValidation.js';
import { checkCoverage } from '../src/services/prefeasibility.js';
import type { SupplierCoverageRecord, ConsultationRecord } from '../src/types.js';

const input: ConsultationRecord['input'] = { fullName:'QA Activación', email:'activation@example.com', company:'QA', channel:'ENTERPRISE', address:'Sitio de prueba', city:'QA', product:'Internet dedicado', capacityMbps:100, latitude:0, longitude:0 };
const polygon = (offset: number) => ({ type:'Polygon', coordinates:[[[offset-1,-1],[offset+1,-1],[offset+1,1],[offset-1,1],[offset-1,-1]]] });
const map: SupplierCoverageRecord = { id:'activation-test', supplierId:'SUP-SERVNET', supplierName:'Red Servnet', sourceFileName:'anterior.kmz', color:'#123456', featureCount:1, polygonCount:1, updatedAt:'2026-10-01T00:00:00Z', updatedBy:'legacy', data:{type:'FeatureCollection',features:[{type:'Feature',properties:{name:'FO OnNet'},geometry:polygon(0)}]} };

test('atomic replacement retires old geometry, preserves independent MW and survives restart; concurrent stale writes cannot win', async () => {
  const dir=await mkdtemp(join(tmpdir(),'lp-activation-'));
  try {
    const path=join(dir,'state.json'); const repo=new FileRepository(path);
    const first=await repo.upsertSupplierCoverage(map,seedUser,null);
    const mw=await repo.upsertSupplierCoverage({...map,id:'mw-independent',sourceFileName:'MW.kmz',data:{...map.data,features:[{properties:{name:'MW'},geometry:polygon(0)}]}},seedUser,null);
    const next={...map,sourceFileName:'nuevo-nombre.kmz',data:{...map.data,features:[{properties:{name:'FO NearNet'},geometry:polygon(10)}]}};
    const attempts=await Promise.allSettled([repo.upsertSupplierCoverage(next,seedUser,first.mapVersion!.revisionId),repo.upsertSupplierCoverage(map,seedUser,first.mapVersion!.revisionId)]);
    assert.equal(attempts[0].status,'fulfilled'); assert.equal(attempts[1].status,'rejected');
    const active=await new FileRepository(path).listSupplierCoverages(seedUser);
    assert.equal(active.length,2); assert.equal(active.find(item=>item.id===map.id)!.sourceFileName,'nuevo-nombre.kmz');
    assert.deepEqual(await new FileRepository(path).getSupplierCoverage(map.id, seedUser), active.find(item => item.id === map.id));
    assert.deepEqual(active.find(item=>item.id===mw.id)!.mapVersion,mw.mapVersion);
    const foMaps=active.filter(item=>item.id===map.id);
    assert.equal(checkCoverage(input,foMaps).technologies!.find(item=>item.technology==='FO')!.classification,'off-net');
    assert.equal(checkCoverage({...input,longitude:10},foMaps).technologies!.find(item=>item.technology==='FO')!.classification,'near-net');
    const events=await repo.listCoverageActivity(map.supplierId,seedUser);
    assert.equal(events.length,3); assert.equal(events[0].previousMap!.sourceFileName,'anterior.kmz');
    assert.equal(events[0].map.version,2);
    await assert.rejects(repo.upsertSupplierCoverage({...map,id:mw.id,sourceFileName:next.sourceFileName},seedUser,mw.mapVersion!.revisionId),/otro mapa vigente/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('API verifies renamed replacement, invalid/stale uploads preserve active revision, and new CX queries use it', async () => {
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');const url=`http://127.0.0.1:${address.port}/api/v1`;
  const supplier=await repository.createSupplier({id:'SUP-ACTIVATION-QA',name:'Activation QA',legalName:'Activation QA',kind:'Carrier',status:'Pendiente de homologación',sla:'Pendiente',score:null,activeLinks:0,contractEnd:null},seedUser);
  const upload=async (body: object) => {
    const response=await fetch(`${url}/suppliers/${supplier.id}/coverage`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceFileName:map.sourceFileName,color:map.color,data:map.data,...body})});
    return {status:response.status,body:await response.json()};
  };
  const query=async (longitude:number) => {
    const values={...input,longitude};const locationToken=signLocation({...values,originalAddress:input.address,originalCity:input.city});
    const response=await fetch(`${url}/prefeasibility`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({...values,locationToken})});
    assert.equal(response.status,201);return (await response.json()).data;
  };
  try {
    const created=await upload({operation:'add'});assert.equal(created.status,200);
    const first=created.body.data;assert.equal(first.activation.verified,true);
    const oldQuery=await query(0);
    const replaced=await upload({operation:'replace',coverageId:first.id,expectedRevisionId:first.mapVersion.revisionId,sourceFileName:'FO-actualizada.kmz',data:{...map.data,features:[{properties:{name:'FO NearNet'},geometry:polygon(10)}]}});
    assert.equal(replaced.status,200);const current=replaced.body.data;
    assert.equal(current.id,first.id);assert.equal(current.mapVersion.version,2);assert.equal(current.activation.replacedRevisionId,first.mapVersion.revisionId);
    const stale=await upload({coverageId:first.id,expectedRevisionId:first.mapVersion.revisionId});assert.equal(stale.status,409);
    assert.equal((await upload({coverageId:first.id})).status,428);
    for (const geometry of [{type:'Polygon',coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1]]]}, {type:'Point',coordinates:[0,95]}, {type:'MultiPolygon',coordinates:[polygon(0).coordinates,[]]}, {type:'Point',coordinates:[0,0]}]) {
      assert.equal((await upload({coverageId:first.id,expectedRevisionId:current.mapVersion.revisionId,data:{type:'FeatureCollection',features:[{geometry}]}})).status,422);
    }
    const active=(await (await fetch(`${url}/supplier-coverages`)).json()).data.filter((item:SupplierCoverageRecord)=>item.supplierId===supplier.id);
    assert.equal(active.length,1);assert.deepEqual(active[0].mapVersion,current.mapVersion);
    const versions=await fetch(`${url}/supplier-coverages/versions`);assert.equal(versions.headers.get('cache-control'),'no-store');
    assert.deepEqual((await versions.json()).data.find((item:{id:string})=>item.id===first.id),current.mapVersion);
    const check=await fetch(`${url}/coverage/check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:0,longitude:0,coverageSelection:[{id:first.id,revisionId:first.mapVersion.revisionId,featureIndexes:[0]}]})});assert.equal(check.status,409);
    const nowOutside=await query(0);const nowInside=await query(10);
    const outsideEvidence=(await repository.getConsultation(nowOutside.code))!; const insideEvidence=(await repository.getConsultation(nowInside.code))!;
    assert.equal(outsideEvidence.coverage.suppliers!.find((item:{supplierName:string})=>item.supplierName===supplier.name).classification,'off-net');
    assert.equal(insideEvidence.coverage.suppliers!.find((item:{supplierName:string})=>item.supplierName===supplier.name).classification,'near-net');
    assert.deepEqual(insideEvidence.coverage.versions.find((item:{id:string})=>item.id===first.id),current.mapVersion);
    const stored=await repository.getConsultation(oldQuery.code);assert.equal(stored!.coverage.versions.find(item=>item.id===first.id)!.version,1);
    assert.equal((await repository.listCoverageActivity(supplier.id,seedUser)).length,2);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
