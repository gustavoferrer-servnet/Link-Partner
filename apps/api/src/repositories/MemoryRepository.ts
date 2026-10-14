import { SupplierManagementConflict } from '../services/supplierEvaluation.js';
import { changeProposalPreference } from '../services/carrierRedundancy.js';
import { seedDeliveries, seedDeliveryProjects, seedOpportunities, seedSuppliers, seedUser } from '../data/seed.js';
import type { AppUser, DeliveryProjectRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';
import { ConsultationCodeCollision } from '../services/consultationCodes.js';
import { CustomerEmailConflict, type CustomerAccount, type CustomerSession } from '../types.js';
import type { Repository } from './Repository.js';
import { CoverageConflict, coverageMapVersion, coverageUpdate, coverageRetirement, coverageRestoration } from '../services/coverageVersions.js';

const internalRoles = new Set(['operations_manager', 'internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'delivery_manager', 'noc', 'finance', 'viewer']);

function isInternal(user: AppUser) {
  return user.roles.some((role) => internalRoles.has(role));
}

export class MemoryRepository implements Repository {
  protected customers: CustomerAccount[] = [];
  protected customerSessions: CustomerSession[] = [];
  async createCustomer(account: CustomerAccount) {
    if (this.customers.some(item => item.email === account.email)) throw new CustomerEmailConflict();
    this.customers.push(structuredClone(account));
  }
  async getCustomerByEmail(email: string) { return structuredClone(this.customers.find(item => item.email === email) ?? null); }
  async getCustomer(id: string) { return structuredClone(this.customers.find(item => item.id === id) ?? null); }
  async saveCustomerSession(session: CustomerSession) {
    this.customerSessions = this.customerSessions.filter(item => item.expiresAt > new Date().toISOString() && item.tokenHash !== session.tokenHash);
    this.customerSessions.push(structuredClone(session));
  }
  async getCustomerSession(tokenHash: string) { return structuredClone(this.customerSessions.find(item => item.tokenHash === tokenHash) ?? null); }
  async deleteCustomerSession(tokenHash: string) { this.customerSessions = this.customerSessions.filter(item => item.tokenHash !== tokenHash); }
  async listCustomerConsultations(customerId: string) {
    return structuredClone(this.consultations.filter(item => item.customerId === customerId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async claimCustomerConsultation(code: string, customerId: string, email: string) {
    const item = this.consultations.find(item => item.code === code);
    if (!item || item.input.email?.trim().toLowerCase() !== email || (item.customerId && item.customerId !== customerId)) return false;
    item.customerId = customerId;
    return true;
  }
  protected reservedConsultationCodes = new Set<string>();
  protected consultations: import('../types.js').ConsultationRecord[] = [];
  async createConsultation(record: import('../types.js').ConsultationRecord) {
    const existing = this.consultations.find(item => item.accessHash === record.accessHash);
    if (existing) return structuredClone(existing);
    if (this.reservedConsultationCodes.has(record.code)) throw new ConsultationCodeCollision();
    this.reservedConsultationCodes.add(record.code);
    this.consultations.push(structuredClone(record));
    return structuredClone(record);
  }
  async updateConsultationProposal(code: string, requested: boolean, expectedAccessHash: string) {
    const index = this.consultations.findIndex(item => item.code === code && item.accessHash === expectedAccessHash);
    if (index < 0) return null;
    const saved = changeProposalPreference(this.consultations[index], requested);
    this.consultations[index] = saved;
    return structuredClone(saved);
  }
  async getConsultationByAccessHash(accessHash: string) {
    return structuredClone(this.consultations.find(item => item.accessHash === accessHash) ?? null);
  }
  async getConsultation(code: string) {
    return structuredClone(this.consultations.find(item => item.code === code) ?? null);
  }
  async listConsultations(user: AppUser) {
    if (!isInternal(user)) return [];
    return structuredClone([...this.consultations].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code)));
  }
  async getInternalConsultation(code: string, user: AppUser) {
    return isInternal(user) ? this.getConsultation(code) : null;
  }
  protected suppliers: SupplierRecord[] = seedSuppliers.map((supplier) => ({ ...supplier }));
  protected supplierCoverages: SupplierCoverageRecord[] = [];
  protected coverageActivity: import('../types.js').CoverageActivity[] = [];
  protected retiredSupplierCoverages: import('../types.js').RetiredSupplierCoverage[] = [];
  protected deliveryProjects: DeliveryProjectRecord[] = structuredClone(seedDeliveryProjects);

  async getUserByAuthUid(authUid: string) {
    return authUid === seedUser.authUid ? seedUser : null;
  }

  async listOpportunities(user: AppUser) {
    const records = [...seedOpportunities, ...this.consultations.map(item => item.opportunity)];
    return structuredClone(isInternal(user) ? records : records.filter(item => !!user.participantId && item.participantId === user.participantId));
  }

  async getOpportunity(id: string, user: AppUser) {
    const record = [...seedOpportunities, ...this.consultations.map(item => item.opportunity)].find((item) => item.id === id) || null;
    if (!record) return null;
    return isInternal(user) || !!user.participantId && record.participantId === user.participantId ? structuredClone(record) : null;
  }

  async createOpportunityProposal(id: string, user: AppUser) {
    if (!user.roles.some(role => ['internal_admin', 'supplier_manager', 'buyer', 'pre_sales'].includes(role))) return null;
    const record = this.consultations.find(item => item.opportunity.id === id);
    if (!record?.opportunity.prefeasibility) return null;
    if (!record.opportunity.proposalDraft) {
      record.opportunity.proposalDraft = { id: `PRP-${record.code}`, status: 'PRICING_PENDING', createdAt: new Date().toISOString(), createdBy: { authUid: user.authUid, email: user.email, displayName: user.displayName } };
      record.opportunity.status = 'Propuesta';
    }
    return structuredClone(record.opportunity);
  }

  async listSuppliers(user: AppUser) {
    return isInternal(user) ? this.suppliers.map((supplier) => ({ ...supplier })) : [];
  }

  async saveSupplierManagement(id: string, management: import('../types.js').SupplierManagement, expectedVersion: number, user: AppUser) {
    if (!isInternal(user)) throw new Error('Acceso denegado.');
    const supplier = this.suppliers.find(item => item.id === id);
    if (!supplier) throw new Error('Proveedor no encontrado.');
    if ((supplier.management?.version ?? 0) !== expectedVersion) throw new SupplierManagementConflict();
    supplier.management = structuredClone(management);
    supplier.sla = management.contract.sla; supplier.contractEnd = management.contract.contractEnd;
    return structuredClone(supplier);
  }

  async createSupplier(record: SupplierRecord, user: AppUser) {
    if (!isInternal(user)) throw new Error('El usuario no puede registrar proveedores.');
    if (this.suppliers.some((supplier) => supplier.id === record.id)) throw new Error('El identificador del proveedor ya existe.');
    this.suppliers.push({ ...record });
    return { ...record };
  }

  async listSupplierCoverageVersions(user: AppUser) {
    return isInternal(user) ? this.supplierCoverages.map(coverageMapVersion) : [];
  }

  async listSupplierCoverages(user: AppUser) {
    return isInternal(user) ? this.supplierCoverages.map((coverage) => ({ ...structuredClone(coverage), mapVersion: coverageMapVersion(coverage) })) : [];
  }

  async getSupplierCoverage(id: string, user: AppUser) {
    const record = isInternal(user) ? this.supplierCoverages.find(item => item.id === id) : undefined;
    return record ? { ...structuredClone(record), mapVersion: coverageMapVersion(record) } : null;
  }

  async listCoverageActivity(supplierId: string, user: AppUser) {
    return isInternal(user) ? structuredClone(this.coverageActivity.filter(event => event.map.supplierId === supplierId).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt) || b.map.version! - a.map.version! || b.id.localeCompare(a.id))) : [];
  }

  async listRetiredSupplierCoverages(supplierId: string, user: AppUser) {
    return isInternal(user) ? structuredClone(this.retiredSupplierCoverages.filter(item => item.record.supplierId === supplierId)) : [];
  }

  async retireSupplierCoverage(id: string, supplierId: string, user: AppUser, expectedRevisionId: string) {
    if (!user.roles.some(role => ['internal_admin', 'supplier_manager'].includes(role))) throw new CoverageConflict('No puedes administrar archivos de cobertura.');
    const record = this.supplierCoverages.find(item => item.id === id && item.supplierId === supplierId);
    if (!record) throw new CoverageConflict('Este archivo ya no está vigente para el proveedor seleccionado.');
    const { retired, activity } = coverageRetirement(record, user, expectedRevisionId);
    this.supplierCoverages = this.supplierCoverages.filter(item => item.id !== id);
    this.retiredSupplierCoverages = [...this.retiredSupplierCoverages.filter(item => item.record.id !== id), retired];
    this.coverageActivity.push(activity);
  }

  async restoreSupplierCoverage(id: string, supplierId: string, user: AppUser, activityId: string) {
    if (!user.roles.some(role => ['internal_admin', 'supplier_manager'].includes(role))) throw new CoverageConflict('No puedes administrar archivos de cobertura.');
    const retired = this.retiredSupplierCoverages.find(item => item.record.id === id && item.record.supplierId === supplierId);
    if (!retired) throw new CoverageConflict('El archivo ya fue restaurado o no pertenece a este proveedor.');
    if (this.supplierCoverages.some(item => item.id === id || item.supplierId === supplierId && item.sourceFileName.localeCompare(retired.record.sourceFileName, 'es-MX', { sensitivity: 'accent' }) === 0)) throw new CoverageConflict('Ya existe un archivo vigente con este nombre. No se duplicará su cobertura.');
    const { saved, activity } = coverageRestoration(retired, user, activityId);
    this.supplierCoverages.push(saved);
    this.retiredSupplierCoverages = this.retiredSupplierCoverages.filter(item => item.record.id !== id);
    this.coverageActivity.push(activity);
    return structuredClone(saved);
  }

  async upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser, expectedRevisionId?: string | null) {
    if (!isInternal(user)) throw new Error('El usuario no puede administrar coberturas.');
    if (!this.suppliers.some((supplier) => supplier.id === record.supplierId)) throw new Error('El proveedor no existe.');
    if (expectedRevisionId !== undefined && this.supplierCoverages.some(item => item.id !== record.id && item.supplierId === record.supplierId && item.sourceFileName.localeCompare(record.sourceFileName, 'es-MX', { sensitivity: 'accent' }) === 0)) throw new CoverageConflict('Ya existe otro mapa vigente con este nombre. Selecciona el mapa que deseas sustituir.');
    const existingIndex = this.supplierCoverages.findIndex((coverage) => coverage.id === record.id);
    const { saved, activity } = coverageUpdate(record, this.supplierCoverages[existingIndex], user, expectedRevisionId);
    if (existingIndex >= 0) this.supplierCoverages[existingIndex] = structuredClone(saved);
    else this.supplierCoverages.push(structuredClone(saved));
    this.coverageActivity.push(activity);
    return structuredClone(saved);
  }

  async listDeliveries(user: AppUser) {
    return isInternal(user) ? seedDeliveries : seedDeliveries.filter((item) => item.participantId === user.participantId);
  }

  async listDeliveryProjects(user: AppUser) {
    const records = isInternal(user) ? this.deliveryProjects : this.deliveryProjects.filter((item) => item.participantId === user.participantId);
    return structuredClone(records);
  }

  async listOpportunityDeliveryProjects(opportunityId: string) { return structuredClone(this.deliveryProjects.filter(item => item.opportunityId === opportunityId)); }
  async getDeliveryProject(id: string, user: AppUser) {
    const record = this.deliveryProjects.find((item) => item.id === id) || null;
    if (!record) return null;
    return isInternal(user) || record.participantId === user.participantId ? structuredClone(record) : null;
  }

  async saveDeliveryProject(record: DeliveryProjectRecord, user: AppUser) {
    if (!isInternal(user)) throw new Error('El usuario no puede modificar proyectos de entrega.');
    const index = this.deliveryProjects.findIndex((item) => item.id === record.id);
    if (index < 0) throw new Error('El proyecto de entrega no existe.');
    this.deliveryProjects[index] = structuredClone(record);
    return structuredClone(record);
  }
}
