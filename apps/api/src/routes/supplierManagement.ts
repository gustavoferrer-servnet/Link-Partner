import { supplierManagerUsers } from '../services/hubUsers.js';
import { HubAccessError } from '../services/hubAccess.js';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { repository } from '../repositories/index.js';
import { evaluateSupplier, supplierManagementOf, SupplierManagementConflict } from '../services/supplierEvaluation.js';
import type { AuthenticatedRequest } from '../types.js';

export const supplierManagementRouter = Router();
const text = z.string().trim().min(1).max(1000);
const date = z.string().date();
const metric = z.enum(['availability', 'resolution', 'delivery', 'quality', 'response', 'commitment']);
const timedMetrics = new Set(['resolution', 'delivery', 'response', 'commitment']);
const state = z.enum(['En validación inicial', 'Habilitado provisional', 'Habilitado', 'Condicionado', 'Restringido para nuevas contrataciones']);
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('requirements'), ownerAuthUid: z.string().trim().min(1).max(200), validationDue: date, nextReview: date, nextCapacityReview: date,
    requirements: z.array(z.object({ id: z.enum(['contact', 'services', 'sla', 'documents']), fulfilled: z.boolean(), evidence: z.string().trim().max(1000), validUntil: date.nullable() })).length(4) }),
  z.object({ type: z.literal('observation'), metric, reference: text, dueAt: date, completedAt: date.nullable(), outcome: z.enum(['complies', 'fails', 'pending']), evidence: text, critical: z.boolean() }),
  z.object({ type: z.literal('contract'), sla: text, contractEnd: date.nullable() }),
  z.object({ type: z.literal('settle-observation'), id: text, completedAt: date, outcome: z.enum(['complies', 'fails']), evidence: text }),
  z.object({ type: z.literal('action'), description: text, owner: text, dueAt: date }),
  z.object({ type: z.literal('close-action'), id: text, evidence: text }),
  z.object({ type: z.literal('authorize'), state, reason: z.string().trim().min(10).max(1000) }),
]);
const schema = z.object({ expectedVersion: z.number().int().min(0), action: actionSchema.optional(), actions: z.array(actionSchema).min(1).max(50).optional() }).refine(value => Boolean(value.action) !== Boolean(value.actions));
const readers = requireRole('internal_admin', 'operations_manager', 'supplier_manager', 'buyer', 'pre_sales', 'finance', 'viewer', 'delivery_manager', 'noc');

supplierManagementRouter.get('/supplier-manager-users', readers, async (req: AuthenticatedRequest, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ status: 'success', data: await supplierManagerUsers(req.headers.authorization) }); }
  catch (error) { if (error instanceof HubAccessError) { res.status(error.status).json({ message: error.message }); return; } next(error); }
});

supplierManagementRouter.get('/supplier-management', readers, async (req: AuthenticatedRequest, res, next) => {
  try {
    const [suppliers, projects] = await Promise.all([repository.listSuppliers(req.appUser!), repository.listDeliveryProjects(req.appUser!)]);
    res.set('Cache-Control', 'no-store').json({ status: 'success', data: suppliers.map(s => ({ ...s, management: supplierManagementOf(s), evaluation: evaluateSupplier(s, projects) })) });
  } catch (error) { next(error); }
});
supplierManagementRouter.post('/suppliers/:id/management', readers, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Revisa los campos, fechas y evidencia.' }); return; }
    const { expectedVersion } = parsed.data;
    const actions = parsed.data.actions ?? [parsed.data.action!];
    const roles = req.appUser!.roles;
    const manager = roles.some(r => ['internal_admin', 'supplier_manager'].includes(r));
    const approver = roles.some(r => ['internal_admin', 'operations_manager'].includes(r));
    if (actions.some(action => !(action.type === 'authorize' ? approver : ['observation', 'settle-observation'].includes(action.type) ? manager || roles.includes('delivery_manager') || roles.includes('noc') : manager))) {
      res.status(403).json({ message: 'Tu perfil no permite realizar esta acción.' }); return;
    }
    const suppliers = await repository.listSuppliers(req.appUser!);
    const supplier = suppliers.find(s => s.id === String(req.params.id));
    if (!supplier) { res.status(404).json({ message: 'Proveedor no encontrado.' }); return; }
    const management = structuredClone(supplierManagementOf(supplier));
    if (management.version !== expectedVersion) throw new SupplierManagementConflict();
    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    for (const action of actions) {
    let summary = '';
    if (action.type === 'requirements') {
      if (new Set(action.requirements.map(r => r.id)).size !== 4 || action.requirements.some(r => r.fulfilled && !r.evidence)) { res.status(400).json({ message: 'Cada requisito validado necesita evidencia y los cuatro requisitos deben ser distintos.' }); return; }
      const ownerUser = (await supplierManagerUsers(req.headers.authorization)).find(u => u.authUid === action.ownerAuthUid);
      if (!ownerUser) { res.status(400).json({ message: 'Selecciona un usuario activo asignado a Link Partner en Application Hub.' }); return; }
      management.ownerUser = ownerUser; management.owner = ownerUser.displayName; management.validationDue = action.validationDue; management.nextReview = action.nextReview; management.nextCapacityReview = action.nextCapacityReview;
      management.requirements = action.requirements.map(r => ({ ...r, label: management.requirements.find(old => old.id === r.id)!.label }));
      summary = 'Requisitos mínimos y agenda actualizados';
    } else if (action.type === 'contract') {
      management.contract = { sla: action.sla, contractEnd: action.contractEnd }; summary = 'Contrato y SLA actualizados';
    } else if (action.type === 'settle-observation') {
      const item = management.observations.find(o => o.id === action.id);
      if (!item || item.outcome !== 'pending') { res.status(400).json({ message: 'El caso no está pendiente.' }); return; }
      if (!manager && !(roles.includes('noc') && ['availability', 'resolution', 'response'].includes(item.metric) || roles.includes('delivery_manager') && ['delivery', 'quality', 'commitment'].includes(item.metric))) { res.status(403).json({ message: 'El indicador corresponde a otra área.' }); return; }
      if (action.completedAt > today || action.outcome === 'complies' && timedMetrics.has(item.metric) && action.completedAt > item.dueAt) { res.status(400).json({ message: 'Revisa la fecha de cierre y el resultado respecto al plazo.' }); return; }
      item.completedAt = action.completedAt; item.outcome = action.outcome; item.evidence += `\nCierre: ${action.evidence}`; summary = `Caso resuelto: ${item.reference}`;
    } else if (action.type === 'observation') {
      if (!manager && !(roles.includes('noc') && ['availability', 'resolution', 'response'].includes(action.metric) || roles.includes('delivery_manager') && ['delivery', 'quality', 'commitment'].includes(action.metric))) { res.status(403).json({ message: 'El indicador corresponde a otra área.' }); return; }
      if (action.completedAt && (action.completedAt > today || action.outcome === 'pending') || action.outcome === 'complies' && (!action.completedAt || timedMetrics.has(action.metric) && action.completedAt > action.dueAt)) {
        res.status(400).json({ message: 'Cumplimiento requiere fecha de cierre dentro del plazo; un caso pendiente no puede tener cierre.' }); return;
      }
      if (management.observations.some(o => o.metric === action.metric && o.reference.toLowerCase() === action.reference.toLowerCase())) { res.status(409).json({ message: 'Esta referencia ya está registrada para el indicador.' }); return; }
      const id = randomUUID();
      management.observations.push({ ...action, id, createdAt: now, createdBy: req.appUser!.displayName });
      if (action.critical) management.actions.push({ id, description: `Revisar hallazgo crítico: ${action.reference}`, owner: management.owner || req.appUser!.displayName, dueAt: today, status: 'Abierta', evidence: '' });
      summary = `Evidencia operativa registrada: ${action.reference}`;
    } else if (action.type === 'action') {
      management.actions.push({ id: randomUUID(), description: action.description, owner: action.owner, dueAt: action.dueAt, status: 'Abierta', evidence: '' }); summary = 'Acción correctiva asignada';
    } else if (action.type === 'close-action') {
      const item = management.actions.find(a => a.id === action.id);
      if (!item || item.status === 'Cerrada') { res.status(400).json({ message: 'La acción no está abierta.' }); return; }
      item.status = 'Cerrada'; item.evidence = action.evidence; summary = `Acción cerrada con evidencia: ${item.description}`;
    } else {
      const projects = await repository.listDeliveryProjects(req.appUser!);
      const evaluation = evaluateSupplier({ ...supplier, management }, projects);
      if (['Habilitado', 'Habilitado provisional'].includes(action.state) && (evaluation.critical || management.requirements.some(r => !r.fulfilled || !r.evidence || r.validUntil && r.validUntil < today))) {
        res.status(400).json({ message: 'Completa requisitos vigentes y resuelve los hallazgos críticos antes de habilitar.' }); return;
      }
      if (action.state === 'Habilitado provisional' && evaluation.score !== null && evaluation.score < 85) { res.status(400).json({ message: 'El desempeño requiere condicionamiento o revisión antes de habilitar.' }); return; }
      if (action.state === 'Habilitado' && (evaluation.confidence !== 'Suficiente' || (evaluation.score ?? 0) < 85)) { res.status(400).json({ message: 'La habilitación completa requiere evidencia suficiente y ScoreCard de al menos 85.' }); return; }
      management.authorization = { state: action.state, reason: action.reason, actor: req.appUser!.displayName, at: now }; summary = `Gerencia autoriza ${action.state}: ${action.reason}`;
    }
    management.history.push({ id: randomUUID(), at: now, actor: req.appUser!.displayName, summary });
    }
    management.version++;
    const saved = await repository.saveSupplierManagement(supplier.id, management, expectedVersion, req.appUser!);
    res.json({ status: 'success', data: saved });
  } catch (error) {
    if (error instanceof HubAccessError) { res.status(error.status).json({ message: error.message }); return; }
    if (error instanceof SupplierManagementConflict) { res.status(409).json({ message: 'Otro usuario actualizó el proveedor. Actualiza antes de guardar.' }); return; }
    next(error);
  }
});
