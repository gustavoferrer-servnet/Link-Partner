import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { seedUser } from '../src/data/seed.js';
import { feasibleCarriers } from '../src/services/carrierRedundancy.js';
import { checkCoverage, publicConsultation } from '../src/services/prefeasibility.js';
import { signLocation } from '../src/services/addressValidation.js';
import { tokenHash, csrfForToken, customerCookie } from '../src/services/customerAuth.js';
import { reserveConsultation } from '../src/services/consultationCodes.js';
import type { SupplierCoverageRecord, ConsultationRecord } from '../src/types.js';

const input: ConsultationRecord['input'] = { channel:'ENTERPRISE',address:'Sitio QA redundancia',city:'QA',product:'Internet dedicado',capacityMbps:100,latitude:0,longitude:0,fullName:'Ana QA',email:'redundancy@example.com',company:'QA' };
const polygon = (offset=0) => ({type:'Polygon',coordinates:[[[offset-1,-1],[offset+1,-1],[offset+1,1],[offset-1,1],[offset-1,-1]]]});
const layer = (supplierId: string, technology='FO', geometry:unknown=polygon()): SupplierCoverageRecord => ({id:`${supplierId}-${technology}`,supplierId,supplierName:supplierId,sourceFileName:`${technology}.kml`,color:'#123456',featureCount:1,polygonCount:1,updatedAt:'2026-10-01T00:00:00Z',updatedBy:'QA',data:{type:'FeatureCollection',features:[{properties:{name:`${technology} NearNet`},geometry}]}});

test('redundancy counts distinct feasible suppliers, not files or technologies; pending and nearby off-map networks do not count', () => {
  const sameCarrier=checkCoverage(input,[layer('SUP-SERVNET'),layer('SUP-SERVNET','MW'),{...layer('SUP-SERVNET'),id:'another-file'}]);
  assert.equal(feasibleCarriers(sameCarrier).length,1);
  const twoCarriers=checkCoverage(input,[layer('SUP-SERVNET'),layer('SUP-ALESTRA','MW'),layer('SUP-MCM-BUSINESS-TECH','FO',polygon(2.001))]);
  assert.deepEqual(feasibleCarriers(twoCarriers).map(item=>item.id),['SUP-SERVNET','SUP-ALESTRA']);
  const pending=checkCoverage(input,[layer('SUP-ALESTRA','MW',{type:'Point',coordinates:[0,0]})]);
  assert.equal(feasibleCarriers(pending).length,0);
  assert.equal(feasibleCarriers({...twoCarriers,status:'ERROR'}).length,0);
  assert.equal(feasibleCarriers(checkCoverage(input,[])).length,0);
});

test('CX automatically requests redundancy for two carriers; private edits persist in recovery/opportunity and retries respect the choice', async () => {
  await repository.upsertSupplierCoverage(layer('SUP-SERVNET'),seedUser);
  await repository.upsertSupplierCoverage(layer('SUP-ALESTRA','MW'),seedUser);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');const url=`http://127.0.0.1:${address.port}/api/v1`;
  const key=randomUUID();
  const submit=(access=key) => fetch(`${url}/prefeasibility`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':access},body:JSON.stringify({...input,locationToken:signLocation({...input,originalAddress:input.address,originalCity:input.city,latitude:0,longitude:0})})});
  const patch=(code:string,carrierRedundancy:boolean,email?:string,headers:Record<string,string>={}) => fetch(`${url}/consultations/${code}/proposal-options`,{method:'PATCH',headers:{'Content-Type':'application/json','X-CX-Request':'1',...headers},body:JSON.stringify({carrierRedundancy,...(email ? {email} : {})})});
  try {
    const created=await submit();assert.equal(created.status,201);const result=(await created.json()).data;
    assert.equal(result.proposalOptions.carrierRedundancyAvailable,true);assert.equal(result.proposalOptions.carrierRedundancyRequested,true);assert.equal(result.proposalOptions.routeCount,2);
    assert.equal((await repository.getOpportunity(result.opportunityId,seedUser))!.carrierRedundancyRequested,true);
    assert.equal((await patch(result.code,false)).status,404);
    assert.equal((await patch(result.code,false,'different@example.com')).status,404);
    const disabled=await patch(result.code,false,' REDUNDANCY@EXAMPLE.COM ');assert.equal(disabled.status,200);assert.equal((await disabled.json()).data.proposalOptions.carrierRedundancyRequested,false);
    const repeated=await submit();assert.equal(repeated.status,201);assert.equal((await repeated.json()).data.proposalOptions.carrierRedundancyRequested,false);
    const recovered=await fetch(`${url}/consultations/${result.code}/retrieve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:input.email})});assert.equal((await recovered.json()).data.proposalOptions.carrierRedundancyRequested,false);
    const staff=await fetch(`${url}/digital-consultations/${result.code}`);assert.equal((await staff.json()).data.proposalOptions.carrierRedundancyRequested,false);
    assert.equal((await repository.getOpportunity(result.opportunityId,seedUser))!.carrierRedundancyRequested,false);
    // A saved consultation keeps its feasibility evidence when current maps change.
    await repository.upsertSupplierCoverage(layer('SUP-ALESTRA','MW',polygon(10)),seedUser);
    const enabled=await patch(result.code,true,input.email);assert.equal(enabled.status,200);assert.equal((await enabled.json()).data.proposalOptions.carrierRedundancyRequested,true);
    const single=await submit(randomUUID());assert.equal(single.status,201);const singleResult=(await single.json()).data;
    assert.equal(singleResult.proposalOptions.routeCount,1);assert.equal(singleResult.proposalOptions.carrierRedundancyAvailable,false);assert.equal(singleResult.proposalOptions.carrierRedundancyRequested,false);
    assert.equal((await patch(singleResult.code,true,input.email)).status,409);
    assert.equal((await repository.getConsultation(singleResult.code))!.proposalPreferences!.carrierRedundancy,false);
    const token=randomBytes(32).toString('hex');const customerId=randomUUID();
    await repository.createCustomer({id:customerId,email:input.email!,fullName:input.fullName!,company:'QA',passwordHash:'unused-test-fixture',createdAt:new Date().toISOString()});
    await repository.saveCustomerSession({tokenHash:tokenHash(token),customerId,expiresAt:new Date(Date.now()+60000).toISOString()});
    await repository.claimCustomerConsultation(result.code,customerId,input.email!);
    const cookie={Cookie:`${customerCookie}=${token}`};
    assert.equal((await patch(result.code,false,undefined,cookie)).status,403);
    assert.equal((await patch(result.code,false,undefined,{...cookie,'X-CSRF-Token':csrfForToken(token),'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await patch(result.code,false,undefined,{...cookie,'X-CSRF-Token':csrfForToken(token)})).status,200);
    assert.equal((await patch(singleResult.code,false,undefined,{...cookie,'X-CSRF-Token':csrfForToken(token)})).status,404);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});

test('proposal preference survives file restart without changing coverage, idempotency or map provenance', async () => {
  const dir=await mkdtemp(join(tmpdir(),'lp-redundancy-'));
  try {
    const path=join(dir,'state.json');const repo=new FileRepository(path);
    const coverage=checkCoverage(input,[layer('SUP-SERVNET'),layer('SUP-ALESTRA','MW')]);
    const record=await reserveConsultation(repo,{accessHash:'access-for-test',requestHash:'immutable-request',input,coverage,qualificationStatus:'PRICING_PENDING',createdAt:new Date().toISOString(),proposalPreferences:{carrierRedundancy:true,updatedAt:new Date().toISOString(),source:'AUTOMATIC'},pricing:{status:'PENDING',amount:null,currency:'MXN',reason:'Pendiente'},opportunity:{id:'pending',source:'DIGITAL',channel:'ENTERPRISE',origin:'DIGITAL',siteId:'pending',siteName:input.address,address:input.address,city:input.city,level:null,network:null,capacity:'100 Mbps',service:input.product,clientSla:'Por confirmar',deliveryDate:'Por confirmar',status:'PRICING_PENDING',mrc:null,margin:null,participantId:null,carrierRedundancyRequested:true}});
    assert.equal(await repo.updateConsultationProposal(record.code,false,'wrong-access'),null);
    await repo.updateConsultationProposal(record.code,false,record.accessHash);
    const saved=await new FileRepository(path).getConsultation(record.code);assert.ok(saved);
    assert.equal(publicConsultation(saved).proposalOptions.carrierRedundancyRequested,false);
    assert.equal(saved.opportunity.carrierRedundancyRequested,false);assert.equal(saved.requestHash,record.requestHash);
    assert.deepEqual(saved.coverage,record.coverage);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
