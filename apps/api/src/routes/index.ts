import { Router } from 'express';
import { createHash } from 'node:crypto';
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
