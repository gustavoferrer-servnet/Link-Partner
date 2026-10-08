import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticate, loadAppUser, requireRole } from '../middleware/auth.js';
import { repository } from '../repositories/index.js';
import type { AuthenticatedRequest, SupplierRecord } from '../types.js';

export const apiRouter = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180),
  kind: z.enum(['Red propia', 'Carrier', 'Broker']),
  status: z.enum(['Aprobado P2', 'Solo P3', 'En observación', 'Pendiente de homologación']).default('Pendiente de homologación'),
});

const coverageSchema = z.object({
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

function coverageId(supplierIdValue: string, sourceFileName: string) {
  const digest = createHash('sha256').update(sourceFileName.trim().toLocaleLowerCase('es-MX')).digest('hex').slice(0, 16).toUpperCase();
  return `COV-${supplierIdValue}-${digest}`;
}

function geometryPolygonCount(geometry: unknown): number {
  if (!geometry || typeof geometry !== 'object') return 0;
  const value = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  if (value.type === 'Polygon') return 1;
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) return value.coordinates.length;
  if (value.type === 'GeometryCollection' && Array.isArray(value.geometries)) {
    return value.geometries.reduce<number>((total, child) => total + geometryPolygonCount(child), 0);
  }
  return 0;
}

apiRouter.use(authenticate, loadAppUser);

apiRouter.get('/session', (req: AuthenticatedRequest, res) => {
  res.json({ status: 'success', data: req.appUser });
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
    try { res.json({ status: 'success', data: await repository.listSupplierCoverages(req.appUser!) }); }
    catch (error) { next(error); }
  },
);

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

      const polygonCount = parsed.data.data.features.reduce((total, feature) => total + geometryPolygonCount(feature.geometry), 0);
      const existingCoverage = existingCoverages.find((coverage) => (
        coverage.supplierId === supplier.id
        && coverage.sourceFileName.localeCompare(parsed.data.sourceFileName, 'es-MX', { sensitivity: 'accent' }) === 0
      ));
      const record = {
        id: existingCoverage?.id ?? coverageId(supplier.id, parsed.data.sourceFileName),
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
      res.json({ status: 'success', data: await repository.upsertSupplierCoverage(record, req.appUser!) });
    } catch (error) { next(error); }
  },
);

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
