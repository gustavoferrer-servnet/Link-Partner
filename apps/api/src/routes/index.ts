import { internalConsultation } from '../services/prefeasibility.js';
import { initialSupplierManagement } from '../services/supplierEvaluation.js';
import { supplierManagementRouter } from './supplierManagement.js';
import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticate, loadAppUser, requireRole } from '../middleware/auth.js';
import { repository } from '../repositories/index.js';
import { CoverageConflict } from '../services/coverageVersions.js';
import { validateCoverageUpload } from '../services/coverageUpload.js';
import { evaluateSupplierCoverage } from '../services/coverageEngine.js';
import { reserveConsultation } from '../services/consultationCodes.js';
import { feasibleCarriers } from '../services/carrierRedundancy.js';
import { consultationSummary } from '../services/prefeasibility.js';
import type { AuthenticatedRequest, SupplierRecord } from '../types.js';

export const apiRouter = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180),
  kind: z.enum(['Red propia', 'Carrier', 'Broker']),
  status: z.enum(['Aprobado P2', 'Solo P3', 'En observación', 'Pendiente de homologación']).default('Pendiente de homologación'),
});

const coverageSchema = z.object({
  coverageId: z.string().min(1).max(200).optional(),
  expectedRevisionId: z.string().min(1).max(100).optional(),
  operation: z.enum(['add', 'replace']).optional(),
  sourceFileName: z.string().trim().min(1).max(260),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  data: z.object({
    type: z.literal('FeatureCollection'),
    features: z.array(z.record(z.string(), z.unknown())).min(1).max(50_000),
  }),
});

const deliveryActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task-status'),
    taskId: z.string().min(1),
    status: z.enum(['Pendiente', 'En curso', 'En espera', 'Cancelado', 'Concluido']),
  }),
  z.object({
    type: z.literal('reprogram'),
    newDate: z.string().date(),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    type: z.literal('add-deviation'),
    taskId: z.string().nullable().optional(),
    area: z.string().trim().min(2).max(100),
    deviationType: z.enum(['Riesgo', 'Dependencia', 'Bloqueo']),
    description: z.string().trim().min(5).max(1000),
    impact: z.enum(['Alto', 'Medio', 'Bajo']),
    actions: z.string().trim().min(3).max(1000),
    owner: z.string().trim().min(2).max(120),
    targetDate: z.string().date().nullable().optional(),
  }),
  z.object({
    type: z.literal('toggle-closure'),
    key: z.enum(['technicalDelivery', 'monitoring', 'billing', 'administrative', 'customerExperience', 'supplierBilling']),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal('retry-sync'),
    operationId: z.string().min(1),
  }),
  z.object({
    type: z.literal('add-document'),
    taskId: z.string().nullable().optional(),
    name: z.string().trim().min(2).max(200),
    documentType: z.string().trim().min(2).max(100),
    url: z.string().trim().url().max(1000),
  }),
  z.object({
    type: z.literal('add-cfe-route'),
    route: z.string().trim().min(2).max(120),
    stage: z.string().trim().min(2).max(120),
    year: z.number().int().min(2000).max(2200),
    owner: z.string().trim().min(2).max(120),
    nextAction: z.string().trim().min(3).max(500),
    followUpDate: z.string().date().nullable().optional(),
    blockingTaskId: z.string().nullable().optional(),
  }),
]);

function supplierId(name: string, existingIds: Set<string>) {
  const stem = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'PROVEEDOR';
  let id = `SUP-${stem}`;
  let suffix = 2;
  while (existingIds.has(id)) id = `SUP-${stem}-${suffix++}`;
  return id;
}





apiRouter.use(authenticate, loadAppUser);

const internalConsultationAccess = requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'delivery_manager', 'noc', 'finance', 'viewer');
apiRouter.get('/digital-consultations', internalConsultationAccess, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const records = await repository.listConsultations(req.appUser!);
    res.json({ status: 'success', data: records.filter(record => record.opportunity.source !== 'COVERAGE').map(consultationSummary) });
  } catch (error) { next(error); }
});
apiRouter.get('/digital-consultations/:code', internalConsultationAccess, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const record = await repository.getInternalConsultation(String(req.params.code), req.appUser!);
    if (!record) { res.status(404).json({ message: 'La consulta no existe o no puedes verla.' }); return; }
    res.json({ status: 'success', data: { ...internalConsultation(record), locationValidation: record.locationValidation ?? null } });
  } catch (error) { next(error); }
});

apiRouter.get('/session', (req: AuthenticatedRequest, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'success', data: req.appUser });
});

apiRouter.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    const [opportunities, deliveries] = await Promise.all([
      repository.listOpportunities(req.appUser!),
      repository.listDeliveries(req.appUser!),
    ]);
    res.json({
      status: 'success',
      data: {
        opportunities,
        deliveries,
        metrics: {
          openOpportunities: opportunities.length,
          slaAtRisk: opportunities.filter((item) => item.status === 'Bloqueada').length,
          blockedDeliveries: deliveries.filter((item) => item.status === 'Bloqueado').length,
        },
      },
    });
  } catch (error) { next(error); }
});

apiRouter.get('/opportunities', async (req: AuthenticatedRequest, res, next) => {
  try { res.json({ status: 'success', data: await repository.listOpportunities(req.appUser!) }); }
  catch (error) { next(error); }
});

apiRouter.post('/coverage/consultations', requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = z.object({
      requestId: z.string().uuid(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
      address: z.string().trim().min(3).max(2048), siteName: z.string().trim().min(2).max(180),
      capacityMbps: z.number().int().min(1).max(100000), company: z.string().trim().max(180).default(''),
      coverageSelection: z.array(z.object({ id: z.string().min(1).max(200), revisionId: z.string().min(1).max(100), featureIndexes: z.array(z.number().int().min(0).max(1000000)).min(1).max(100000) }).strict()).min(1).max(100),
    }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Revisa el sitio, capacidad y las capas de cobertura seleccionadas.' }); return; }
    const { requestId, siteName, coverageSelection, company, ...location } = parsed.data;
    const user = req.appUser!;
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const accessHash = hash(`coverage:${user.authUid}:${requestId}`);
    const requestHash = hash(JSON.stringify(parsed.data));
    let record = await repository.getConsultationByAccessHash(accessHash);
    if (!record) {
      const input = { ...location, channel: 'ENTERPRISE' as const, city: '', product: 'Internet dedicado' as const, company };
      const coverage = await evaluateSupplierCoverage(input, user, coverageSelection);
      const qualificationStatus = coverage.status === 'AVAILABLE' ? 'PRICING_PENDING' : coverage.status === 'NO_COVERAGE' ? 'NO_COVERAGE' : 'FEASIBILITY_PENDING';
      const createdAt = new Date().toISOString();
      const createdBy = { authUid: user.authUid, email: user.email, displayName: user.displayName };
      const carrierRedundancy = feasibleCarriers(coverage).length >= 2;
      record = await reserveConsultation(repository, { accessHash, requestHash, input, coverage, qualificationStatus, createdAt, createdBy,
        proposalPreferences: { carrierRedundancy, updatedAt: createdAt, source: 'AUTOMATIC' },
        pricing: { status: 'PENDING', amount: null, currency: 'MXN', reason: 'Consulta guardada. Preparar la propuesta después de validar la solución, el precio y el SLA.' },
        opportunity: {
          id: 'pending-reservation', source: 'COVERAGE', origin: 'Servnet', siteId: 'pending-reservation', siteName,
          address: input.address, city: input.city, latitude: input.latitude, longitude: input.longitude,
          level: null, network: null, service: input.product, capacity: `${input.capacityMbps} Mbps`,
          clientSla: 'Por confirmar', deliveryDate: 'Por confirmar', status: qualificationStatus, mrc: null, margin: null, participantId: null,
          carrierRedundancyRequested: carrierRedundancy,
          prefeasibility: { location: { latitude: input.latitude, longitude: input.longitude, address: input.address }, coverage, coverageSelection, savedAt: createdAt, createdBy },
        },
      });
    }
    if (record.requestHash !== requestHash || record.createdBy?.authUid !== user.authUid || record.opportunity.source !== 'COVERAGE') { res.status(409).json({ message: 'Esta solicitud ya corresponde a otra consulta. Inicia un nuevo guardado.' }); return; }
    res.set('Cache-Control', 'no-store').status(201).json({ status: 'success', data: record.opportunity });
  } catch (error) { next(error); }
});

apiRouter.get('/opportunities/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const record = await repository.getOpportunity(String(req.params.id), req.appUser!);
    if (!record) {
      res.status(404).json({ status: 'error', message: 'La oportunidad no existe o no puedes verla.' });
      return;
    }
    res.json({ status: 'success', data: record });
  } catch (error) { next(error); }
});

apiRouter.post('/opportunities/:id/proposals', requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!z.object({}).strict().safeParse(req.body).success) { res.status(400).json({ message: 'La propuesta se genera con los datos guardados en la oportunidad.' }); return; }
    const opportunity = await repository.createOpportunityProposal(String(req.params.id), req.appUser!);
    if (!opportunity) { res.status(404).json({ message: 'Guarda una prefactibilidad antes de preparar la propuesta.' }); return; }
    res.set('Cache-Control', 'no-store').status(201).json({ status: 'success', data: opportunity });
  } catch (error) { next(error); }
});

apiRouter.use(supplierManagementRouter);

apiRouter.get(
  '/suppliers',
  requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'finance', 'viewer'),
  async (req: AuthenticatedRequest, res, next) => {
    try { res.json({ status: 'success', data: await repository.listSuppliers(req.appUser!) }); }
    catch (error) { next(error); }
  },
);

apiRouter.post(
  '/suppliers',
  requireRole('internal_admin', 'supplier_manager'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = supplierSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ status: 'error', message: 'Revisa el nombre, razón social, tipo y estado del proveedor.' });
        return;
      }

      const existingSuppliers = await repository.listSuppliers(req.appUser!);
      const record: SupplierRecord = {
        id: supplierId(parsed.data.name, new Set(existingSuppliers.map((supplier) => supplier.id))),
        ...parsed.data,
        management: initialSupplierManagement(),
        sla: null,
        score: null,
        activeLinks: null,
        contractEnd: null,
      };
      res.status(201).json({ status: 'success', data: await repository.createSupplier(record, req.appUser!) });
    } catch (error) { next(error); }
  },
);

apiRouter.get(
  '/supplier-coverages',
  requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'finance', 'viewer'),
  async (req: AuthenticatedRequest, res, next) => {
    try { res.set('Cache-Control', 'no-store').json({ status: 'success', data: await repository.listSupplierCoverages(req.appUser!) }); }
    catch (error) { next(error); }
  },
);

apiRouter.get('/supplier-coverages/versions', requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'finance', 'viewer'), async (req: AuthenticatedRequest, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ status: 'success', data: await repository.listSupplierCoverageVersions(req.appUser!) }); } catch (error) { next(error); }
});

apiRouter.get('/supplier-coverages/:id', requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'finance', 'viewer'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const record = await repository.getSupplierCoverage(String(req.params.id), req.appUser!);
    res.set('Cache-Control', 'no-store');
    if (!record) { res.status(404).json({ status: 'error', message: 'El mapa ya no está vigente.' }); return; }
    if (req.query.revision && req.query.revision !== record.mapVersion?.revisionId) {
      res.status(409).json({ status: 'error', code: 'COVERAGE_REVISION_CONFLICT', message: 'El mapa cambió. Actualiza las coberturas.' }); return;
    }
    res.json({ status: 'success', data: record });
  } catch (error) { next(error); }
});

apiRouter.put(
  '/suppliers/:id/coverage',
  requireRole('internal_admin', 'supplier_manager'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = coverageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ status: 'error', message: 'La cobertura GeoJSON no es válida o está vacía.' });
        return;
      }

      const supplierIdValue = String(req.params.id);
      const [suppliers, existingCoverages] = await Promise.all([
        repository.listSuppliers(req.appUser!),
        repository.listSupplierCoverages(req.appUser!),
      ]);
      const supplier = suppliers.find((item) => item.id === supplierIdValue);
      if (!supplier) {
        res.status(404).json({ status: 'error', message: 'El proveedor no existe.' });
        return;
      }

      const namedCoverage = existingCoverages.find((coverage) => (
        coverage.supplierId === supplier.id
        && coverage.sourceFileName.localeCompare(parsed.data.sourceFileName, 'es-MX', { sensitivity: 'accent' }) === 0
      ));
      const existingCoverage = parsed.data.coverageId ? existingCoverages.find(item => item.id === parsed.data.coverageId && item.supplierId === supplier.id) : namedCoverage;
      if (parsed.data.coverageId && !existingCoverage) throw new CoverageConflict('El mapa seleccionado ya no está vigente para este proveedor.');
      if (parsed.data.operation === 'add' && existingCoverage) throw new CoverageConflict('Ya existe un mapa con este nombre. Selecciónalo para sustituirlo.');
      if (parsed.data.operation === 'replace' && !existingCoverage) throw new CoverageConflict('Selecciona el mapa vigente que deseas sustituir.');
      if (existingCoverage && !parsed.data.expectedRevisionId) { res.status(428).json({ status: 'error', message: 'Se requiere la revisión vigente del mapa para sustituirlo.' }); return; }
      if (!existingCoverage && parsed.data.expectedRevisionId) throw new CoverageConflict();
      if (!existingCoverage && !parsed.data.operation && existingCoverages.some(item => item.supplierId === supplier.id)) { res.status(428).json({ status: 'error', message: 'Indica coverageId para sustituir un mapa o operation=add para agregar uno independiente.' }); return; }
      const polygonCount = validateCoverageUpload(parsed.data.data, existingCoverage);
      const record = {
        id: existingCoverage?.id ?? `COV-${supplier.id}-${randomUUID()}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        sourceFileName: parsed.data.sourceFileName,
        color: parsed.data.color,
        featureCount: parsed.data.data.features.length,
        polygonCount,
        data: parsed.data.data,
        updatedAt: new Date().toISOString(),
        updatedBy: req.appUser!.email,
      };
      const saved = await repository.upsertSupplierCoverage(record, req.appUser!, parsed.data.expectedRevisionId ?? null);
      const active = (await repository.listSupplierCoverageVersions(req.appUser!)).find(item => item.id === saved.id);
      if (!active || active.revisionId !== saved.mapVersion?.revisionId || active.sha256 !== saved.mapVersion.sha256) throw new CoverageConflict('La carga se guardó, pero otra revisión la sustituyó. Actualiza el listado para consultar el mapa activo.');
      res.set('Cache-Control', 'no-store').json({ status: 'success', data: { ...saved, activation: { verified: true, revisionId: active.revisionId, replacedRevisionId: existingCoverage?.mapVersion?.revisionId ?? null } } });
    } catch (error) { next(error); }
  },
);

apiRouter.delete('/suppliers/:id/coverages/:coverageId', requireRole('internal_admin', 'supplier_manager'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = z.object({ expectedRevisionId: z.string().min(1).max(100) }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(428).json({ message: 'Se requiere la revisión del archivo que deseas eliminar.' }); return; }
    await repository.retireSupplierCoverage(String(req.params.coverageId), String(req.params.id), req.appUser!, parsed.data.expectedRevisionId);
    res.set('Cache-Control', 'no-store').json({ status: 'success', data: { id: String(req.params.coverageId), removed: true } });
  } catch (error) { next(error); }
});

apiRouter.get('/suppliers/:id/retired-coverages', requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'finance', 'viewer'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const retired = await repository.listRetiredSupplierCoverages(String(req.params.id), req.appUser!);
    res.set('Cache-Control', 'no-store').json({ status: 'success', data: retired.map(item => ({ id: item.record.id, sourceFileName: item.record.sourceFileName, mapVersion: item.record.mapVersion, activityId: item.activityId, retiredAt: item.retiredAt })) });
  } catch (error) { next(error); }
});

apiRouter.post('/suppliers/:id/coverages/:coverageId/restore', requireRole('internal_admin', 'supplier_manager'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = z.object({ activityId: z.string().uuid() }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(428).json({ message: 'Selecciona el retiro vigente del archivo que deseas restaurar.' }); return; }
    const saved = await repository.restoreSupplierCoverage(String(req.params.coverageId), String(req.params.id), req.appUser!, parsed.data.activityId);
    res.set('Cache-Control', 'no-store').json({ status: 'success', data: saved });
  } catch (error) { next(error); }
});

apiRouter.get('/suppliers/:id/coverage-activity', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.string().uuid().optional() }).safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ status: 'error', message: 'La paginación del historial no es válida.' }); return; }
    const events = await repository.listCoverageActivity(String(req.params.id), req.appUser!);
    const start = parsed.data.before ? events.findIndex(event => event.id === parsed.data.before) + 1 : 0;
    if (parsed.data.before && start === 0) { res.status(400).json({ status: 'error', message: 'El cursor de historial no existe.' }); return; }
    const items = events.slice(start, start + parsed.data.limit);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { items, nextCursor: start + items.length < events.length ? items.at(-1)?.id : null } });
  } catch (error) { next(error); }
});

apiRouter.get('/deliveries', async (req: AuthenticatedRequest, res, next) => {
  try { res.json({ status: 'success', data: await repository.listDeliveries(req.appUser!) }); }
  catch (error) { next(error); }
});

apiRouter.get(
  '/delivery-projects',
  requireRole('internal_admin', 'delivery_manager', 'pre_sales', 'buyer', 'noc', 'finance', 'viewer'),
  async (req: AuthenticatedRequest, res, next) => {
    try { res.json({ status: 'success', data: await repository.listDeliveryProjects(req.appUser!) }); }
    catch (error) { next(error); }
  },
);

apiRouter.get(
  '/delivery-projects/:id',
  requireRole('internal_admin', 'delivery_manager', 'pre_sales', 'buyer', 'noc', 'finance', 'viewer'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const project = await repository.getDeliveryProject(String(req.params.id), req.appUser!);
      if (!project) {
        res.status(404).json({ status: 'error', message: 'El proyecto de Service Delivery no existe o no puedes verlo.' });
        return;
      }
      res.json({ status: 'success', data: project });
    } catch (error) { next(error); }
  },
);

apiRouter.post(
  '/delivery-projects/:id/actions',
  requireRole('internal_admin', 'delivery_manager'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = deliveryActionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ status: 'error', message: 'La acción de Service Delivery no es válida.' });
        return;
      }

      const project = await repository.getDeliveryProject(String(req.params.id), req.appUser!);
      if (!project) {
        res.status(404).json({ status: 'error', message: 'El proyecto de Service Delivery no existe.' });
        return;
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const actor = req.appUser!.displayName || req.appUser!.email;
      const action = parsed.data;
      let summary = '';

      if (action.type === 'task-status') {
        const task = project.tasks.find((item) => item.id === action.taskId);
        if (!task) {
          res.status(404).json({ status: 'error', message: 'La actividad no existe.' });
          return;
        }
        const previous = task.status;
        task.status = action.status;
        if (action.status === 'En curso' && !task.actualStart) task.actualStart = today;
        if (action.status === 'Concluido' && !task.actualEnd) task.actualEnd = today;
        if (action.status !== 'Concluido') task.actualEnd = null;
        summary = `${task.name}: ${previous} → ${action.status}. La etapa del proyecto no se modificó automáticamente.`;
      } else if (action.type === 'reprogram') {
        const previousDate = project.currentCommitment;
        project.currentCommitment = action.newDate;
        project.commitmentHistory.unshift({ id: `CH-${randomUUID()}`, previousDate, newDate: action.newDate, reason: action.reason, author: actor, changedAt: now });
        project.syncStatus = 'Pendiente';
        project.syncOperations.unshift({ id: `SYNC-${randomUUID()}`, target: 'WSAS', action: 'Actualizar compromiso vigente', status: 'Pendiente', attempts: 0, lastAttemptAt: null, error: null });
        summary = `Compromiso vigente ${previousDate || 'sin fecha'} → ${action.newDate}. Línea base conservada.`;
      } else if (action.type === 'add-deviation') {
        project.deviations.unshift({ id: `DEV-${randomUUID()}`, taskId: action.taskId ?? null, date: today, area: action.area, type: action.deviationType, description: action.description, impact: action.impact, actions: action.actions, owner: action.owner, targetDate: action.targetDate ?? null, status: 'Abierto', solvedAt: null });
        summary = `${action.deviationType} ${action.impact.toLowerCase()} registrado para ${action.area}.`;
      } else if (action.type === 'toggle-closure') {
        project.closures[action.key] = action.value;
        summary = `Cierre ${action.key} marcado como ${action.value ? 'concluido' : 'pendiente'} sin alterar los demás cierres.`;
      } else if (action.type === 'retry-sync') {
        const operation = project.syncOperations.find((item) => item.id === action.operationId);
        if (!operation) {
          res.status(404).json({ status: 'error', message: 'La operación de sincronización no existe.' });
          return;
        }
        operation.attempts += 1;
        operation.lastAttemptAt = now;
        operation.status = 'Error';
        operation.error = 'Adaptador MCP de WSAS no configurado; el avance local permanece intacto.';
        project.syncStatus = 'Error';
        summary = `Reintento ${operation.attempts} de ${operation.action}; sin duplicar la operación.`;
      } else if (action.type === 'add-document') {
        project.documents.unshift({ id: `DOC-${randomUUID()}`, taskId: action.taskId ?? null, name: action.name, type: action.documentType, url: action.url, author: actor, createdAt: now });
        summary = `Documento ${action.name} vinculado al proyecto.`;
      } else {
        if (project.flow !== 'Servnet' || !project.requiresCfe) {
          res.status(400).json({ status: 'error', message: 'CFE sólo aplica a proyectos Servnet que lo requieren.' });
          return;
        }
        project.cfeRoutes.unshift({ id: `CFE-${randomUUID()}`, route: action.route, stage: action.stage, year: action.year, registrationDate: today, visitDate: null, releaseDate: null, owner: action.owner, nextAction: action.nextAction, followUpDate: action.followUpDate ?? null, comments: '', blockingTaskId: action.blockingTaskId ?? null });
        summary = `Ruta CFE ${action.route} registrada.`;
      }

      project.auditEvents.unshift({ id: `AUD-${randomUUID()}`, action: action.type, entity: project.id, actor, occurredAt: now, source: 'Link Partner', summary });
      res.json({ status: 'success', data: await repository.saveDeliveryProject(project, req.appUser!) });
    } catch (error) { next(error); }
  },
);
