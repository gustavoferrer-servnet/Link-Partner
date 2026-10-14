// Offline maintenance for the file backend. Stop the API before --apply.
// Geometry validation and map versions use the same functions as manual uploads.
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, copyFile, mkdir, stat, chown } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = process.env.LINK_PARTNER_API_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api');
const { coverageUpdate, coverageRetirement, coverageMapVersion, CoverageConflict } = await import(pathToFileURL(`${apiRoot}/dist/services/coverageVersions.js`));
const { validateCoverageUpload } = await import(pathToFileURL(`${apiRoot}/dist/services/coverageUpload.js`));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const actor = { authUid:'maintenance:google-drive-import', email:'maintenance:google-drive-import', displayName:'Importación masiva · Google Drive', organization:'Servnet', roles:['internal_admin'], enabled:true, participantId:null };

export function prepareCoverageBatch(state, plan) {
  if (!plan?.batchId || !Array.isArray(plan.maps) || !plan.maps.length || !Array.isArray(plan.retirements) || !Array.isArray(plan.expectedMaps)) throw new Error('El plan de importación está incompleto.');
  const priorEvents = (state.coverageActivity ?? []).filter(event => event.importContext?.batchId === plan.batchId);
  if (priorEvents.length) {
    if (priorEvents.length !== plan.maps.length + plan.retirements.length || priorEvents.some(event=>event.importContext.planSha256!==plan.planSha256)) throw new CoverageConflict('El identificador del lote ya corresponde a otra carga.');
    return { state, report:{ batchId:plan.batchId, alreadyApplied:true, activeMaps:state.supplierCoverages.length } };
  }
  const scopedSuppliers = new Set(plan.maps.map(map=>map.supplierId));
  const current = state.supplierCoverages ?? [];
  const expected = new Map(plan.expectedMaps.map(map=>[map.id,map]));
  const scoped = current.filter(map=>scopedSuppliers.has(map.supplierId));
  if (scoped.length !== expected.size || scoped.some(map=>expected.get(map.id)?.revisionId!==coverageMapVersion(map).revisionId || expected.get(map.id)?.supplierId!==map.supplierId)) throw new CoverageConflict('Las coberturas cambiaron después de preparar el lote. Se requiere un nuevo plan.');
  const suppliers = new Map(state.suppliers.map(supplier=>[supplier.id,supplier]));
  const byId = new Map(current.map(map=>[map.id,map]));
  const consumed = new Set();
  const names = new Set();
  const savedMaps = [];
  const events = [];
  for (const input of plan.maps) {
    const supplier = suppliers.get(input.supplierId);
    if (!supplier || typeof input.sourceFileName!=='string' || !input.sourceFileName.trim() || !input.source?.fileId || digest(input.data)!==input.dataSha256) throw new Error('Proveedor, origen o geometría inválidos en el lote.');
    const name = `${supplier.id}:${input.sourceFileName.toLocaleLowerCase('es-MX')}`;
    if (names.has(name)) throw new CoverageConflict('El lote repite un nombre de archivo para el mismo proveedor.');
    names.add(name);
    const previous = input.coverageId ? byId.get(input.coverageId) : undefined;
    if (input.coverageId && (!previous || previous.supplierId!==supplier.id || consumed.has(previous.id))) throw new CoverageConflict('Destino de reemplazo inválido o repetido.');
    if (previous) consumed.add(previous.id);
    const polygonCount = validateCoverageUpload(input.data, previous);
    const id = previous?.id ?? `COV-${supplier.id}-${createHash('sha256').update(input.source.fileId).digest('hex').slice(0,16).toUpperCase()}`;
    if (!previous && byId.has(id)) throw new CoverageConflict('El identificador del nuevo mapa ya existe.');
    const result = coverageUpdate({id,supplierId:supplier.id,supplierName:supplier.name,sourceFileName:input.sourceFileName,color:previous?.color ?? input.color ?? '#157a78',data:input.data,featureCount:input.data.features.length,polygonCount,updatedAt:new Date().toISOString(),updatedBy:actor.email},previous,actor,previous?input.expectedRevisionId:null);
    result.activity.importContext = { batchId:plan.batchId, planSha256:plan.planSha256, kind:'GOOGLE_DRIVE', ...input.source };
    savedMaps.push(result.saved); events.push(result.activity);
  }
  const archives = [...(state.retiredSupplierCoverages ?? [])];
  for (const input of plan.retirements) {
    const previous = byId.get(input.coverageId);
    if (!previous || previous.supplierId!==input.supplierId || !scopedSuppliers.has(previous.supplierId) || consumed.has(previous.id)) throw new CoverageConflict('Destino de retiro inválido o repetido.');
    consumed.add(previous.id);
    const result = coverageRetirement(previous,actor,input.expectedRevisionId);
    result.activity.importContext = { batchId:plan.batchId, planSha256:plan.planSha256, kind:'GOOGLE_DRIVE', reason:input.reason };
    events.push(result.activity);
    const priorIndex=archives.findIndex(item=>item.record.id===previous.id); if(priorIndex>=0)archives.splice(priorIndex,1);
    archives.push(result.retired);
  }
  if (scoped.some(map=>!consumed.has(map.id))) throw new CoverageConflict('Un mapa anterior del proveedor no tiene reemplazo ni retiro explícito.');
  const active = [...current.filter(map=>!consumed.has(map.id)),...savedMaps];
  if (new Set(active.map(map=>map.id)).size!==active.length) throw new CoverageConflict('El lote duplicaría identificadores de mapa.');
  const next = {...state,supplierCoverages:active,coverageActivity:[...(state.coverageActivity ?? []),...events],retiredSupplierCoverages:archives};
  const report = {batchId:plan.batchId,alreadyApplied:false,updated:events.filter(e=>e.action==='UPDATED').length,added:events.filter(e=>e.action==='CREATED').length,retired:plan.retirements.length,activeMaps:active.length,suppliers:scopedSuppliers.size,maps:savedMaps.map(map=>({id:map.id,supplierId:map.supplierId,file:map.sourceFileName,...map.mapVersion,featureCount:map.featureCount,polygonCount:map.polygonCount}))};
  return {state:next,report};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [mode,planPath,statePath] = process.argv.slice(2);
  if (!['--dry-run','--apply'].includes(mode) || !planPath || !statePath) throw new Error('Uso: import-coverage-batch.mjs --dry-run|--apply PLAN ESTADO');
  if (mode==='--apply' && process.env.LINK_PARTNER_OFFLINE_IMPORT!=='1') throw new Error('La aplicación sólo se permite en mantenimiento, con el API detenido.');
  const original = await readFile(statePath,'utf8');
  const stateMetadata = await stat(statePath);
  const plan = JSON.parse(await readFile(planPath,'utf8'));
  const {state,report} = prepareCoverageBatch(JSON.parse(original),plan);
  if (mode==='--apply' && !report.alreadyApplied) {
    const backup=`${dirname(statePath)}/backups/${plan.batchId}.json`;
    await mkdir(dirname(backup),{recursive:true});
    await copyFile(statePath,backup,1);
    const temporary=`${statePath}.${randomUUID()}.tmp`;
    await writeFile(temporary,JSON.stringify(state),{mode:stateMetadata.mode & 0o777});
    await chown(temporary,stateMetadata.uid,stateMetadata.gid);
    // Reject a concurrent writer rather than replacing its changes.
    if (await readFile(statePath,'utf8')!==original) throw new CoverageConflict('El estado cambió durante el mantenimiento. No se publicó el lote.');
    await rename(temporary,statePath);
  }
  const planMetadata = await stat(planPath);
  await writeFile(`${planPath}.report.json`,JSON.stringify(report,null,2),{mode:0o600});
  await chown(`${planPath}.report.json`,planMetadata.uid,planMetadata.gid);
  console.log(JSON.stringify({...report,maps:undefined},null,2));
}
