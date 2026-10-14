import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareCoverageBatch } from '../../../scripts/import-coverage-batch.mjs';
import { coverageMapVersion } from '../src/services/coverageVersions.js';

const data=(x=0)=>({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'FO OnNet'},geometry:{type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]}}]});
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const old=(id:string,supplierId='S1')=>({id,supplierId,supplierName:supplierId,sourceFileName:`${id}.kmz`,color:'#157a78',updatedAt:'2026-10-01T00:00:00.000Z',updatedBy:'original',data:data(),featureCount:1,polygonCount:1});
const state=()=>({suppliers:[{id:'S1',name:'Supplier 1'},{id:'S2',name:'Supplier 2'}],supplierCoverages:[old('fo'),old('mw'),old('other','S2')],coverageActivity:[],retiredSupplierCoverages:[],consultations:[{code:'CODE0001',coverageVersion:'historical'}],customers:[{id:'unchanged'}],customerSessions:[{id:'session'}],reservedConsultationCodes:['CODE0001'],deliveryProjects:[{id:'delivery'}]});
const input=(id:string|null,fileId:string,name:string)=>({supplierId:'S1',sourceFileName:name,coverageId:id,expectedRevisionId:id?coverageMapVersion(old(id)).revisionId:null,data:data(10),dataSha256:hash(data(10)),source:{fileId,fileSha256:'binary-sha',url:'https://drive.google.com/file/d/'+fileId}});
const plan=()=>({batchId:'test-drive-batch',planSha256:'manifest-sha',expectedMaps:[old('fo'),old('mw')].map(m=>({id:m.id,supplierId:m.supplierId,revisionId:coverageMapVersion(m).revisionId})),maps:[input('fo','file-fo','FO nueva.kmz'),input('mw','file-mw','MW nueva.kmz')],retirements:[] as any[]});

test('bulk import uses manual versions and audit, preserves unrelated and historical data, and replay does not duplicate maps or logs',()=>{
  const initial=state(),before=JSON.stringify(initial);
  const result=prepareCoverageBatch(initial,plan());
  assert.equal(JSON.stringify(initial),before);
  assert.equal(result.report.updated,2); assert.equal(result.report.activeMaps,3);
  const updated=result.state.supplierCoverages.find((m:any)=>m.id==='fo');
  assert.equal(updated.mapVersion.version,2); assert.equal(updated.data.features[0].geometry.coordinates[0][0][0],10);
  assert.deepEqual(result.state.supplierCoverages.find((m:any)=>m.id==='other'),initial.supplierCoverages[2]);
  for(const key of ['consultations','customers','customerSessions','reservedConsultationCodes','deliveryProjects']) assert.deepEqual(result.state[key],initial[key as keyof typeof initial]);
  assert.equal(result.state.coverageActivity.length,2);
  assert.equal(result.state.coverageActivity[0].actor.authUid,'maintenance:google-drive-import');
  assert.equal(result.state.coverageActivity[0].action,'UPDATED');
  assert.equal(result.state.coverageActivity[0].previousMap.version,1);
  assert.equal(result.state.coverageActivity[0].importContext.kind,'GOOGLE_DRIVE');
  const replay=prepareCoverageBatch(result.state,plan()); assert.equal(replay.report.alreadyApplied,true); assert.equal(replay.state,result.state);
});

test('splitting a combined map retires exactly that map and publishes separate FO and MW without old geometry',()=>{
  const initial={...state(),supplierCoverages:[old('combined'),old('other','S2')]};
  const batch=plan();batch.expectedMaps=[{id:'combined',supplierId:'S1',revisionId:coverageMapVersion(old('combined')).revisionId}];
  batch.maps=[input(null,'file-fo','FO.kmz'),input(null,'file-mw','MW.kmz')];
  batch.retirements=[{supplierId:'S1',coverageId:'combined',expectedRevisionId:batch.expectedMaps[0].revisionId,reason:'Split FO/MW'}];
  const result=prepareCoverageBatch(initial,batch);
  assert.equal(result.report.added,2);assert.equal(result.report.retired,1);
  assert.equal(result.state.supplierCoverages.some((m:any)=>m.id==='combined'),false);
  assert.equal(result.state.retiredSupplierCoverages[0].record.id,'combined');
  assert.deepEqual(result.state.retiredSupplierCoverages[0].record.data,data());
  assert.equal(result.state.coverageActivity.filter((e:any)=>e.action==='DELETED').length,1);
});

test('stale, ambiguous, duplicate or malformed bulk plans fail before modifying any state',()=>{
  for(const mutate of [
    (p:any)=>p.expectedMaps[0].revisionId='stale',
    (p:any)=>p.maps[0].expectedRevisionId='stale',
    (p:any)=>p.maps[1].coverageId='fo',
    (p:any)=>p.maps[1].sourceFileName=p.maps[0].sourceFileName,
    (p:any)=>{p.maps.pop();},
    (p:any)=>{p.maps[1].data=data(190);p.maps[1].dataSha256=hash(p.maps[1].data);},
    (p:any)=>p.maps[1].dataSha256='changed',
    (p:any)=>p.maps[1].supplierId='unknown',
  ]){const initial=state(),before=JSON.stringify(initial),batch=plan();mutate(batch);assert.throws(()=>prepareCoverageBatch(initial,batch));assert.equal(JSON.stringify(initial),before);}
});

test('offline application backs up before atomic publication, repeats safely, and never applies invalid last files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'lp-import-'));
  const statePath=join(directory,'state.json'),planPath=join(directory,'plan.json');
  const initial=JSON.stringify(state());
  const script=resolve('../../scripts/import-coverage-batch.mjs');
  const run=(mode:string)=>execFileSync(process.execPath,[script,mode,planPath,statePath],{env:{...process.env,LINK_PARTNER_OFFLINE_IMPORT:'1'},stdio:'pipe'});
  try{
    await writeFile(statePath,initial);await writeFile(planPath,JSON.stringify(plan()));
    run('--dry-run');assert.equal(await readFile(statePath,'utf8'),initial);
    run('--apply');const published=await readFile(statePath,'utf8');assert.notEqual(published,initial);
    assert.equal(await readFile(join(directory,'backups','test-drive-batch.json'),'utf8'),initial);
    run('--apply');assert.equal(await readFile(statePath,'utf8'),published);
    const bad=plan();bad.batchId='invalid-batch';bad.maps[1].data=data(190);bad.maps[1].dataSha256=hash(bad.maps[1].data);
    await writeFile(statePath,initial);await writeFile(planPath,JSON.stringify(bad));
    assert.throws(()=>run('--apply'));assert.equal(await readFile(statePath,'utf8'),initial);
    assert.equal((await readdir(directory)).some(name=>name.endsWith('.tmp')),false);
  }finally{await rm(directory,{recursive:true,force:true});}
});
