import { seedDeliveries, seedDeliveryProjects, seedOpportunities, seedSuppliers, seedUser } from '../data/seed.js';
import type { AppUser, DeliveryProjectRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';
import type { Repository } from './Repository.js';

const internalRoles = new Set(['internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'delivery_manager', 'noc', 'finance', 'viewer']);

function isInternal(user: AppUser) {
  return user.roles.some((role) => internalRoles.has(role));
}

export class MemoryRepository implements Repository {
  protected suppliers: SupplierRecord[] = seedSuppliers.map((supplier) => ({ ...supplier }));
  protected supplierCoverages: SupplierCoverageRecord[] = [];
  protected deliveryProjects: DeliveryProjectRecord[] = structuredClone(seedDeliveryProjects);

  async getUserByAuthUid(authUid: string) {
    return authUid === seedUser.authUid ? seedUser : null;
  }

  async listOpportunities(user: AppUser) {
    return isInternal(user) ? seedOpportunities : seedOpportunities.filter((item) => item.participantId === user.participantId);
  }

  async getOpportunity(id: string, user: AppUser) {
    const record = seedOpportunities.find((item) => item.id === id) || null;
    if (!record) return null;
    return isInternal(user) || record.participantId === user.participantId ? record : null;
  }

  async listSuppliers(user: AppUser) {
    return isInternal(user) ? this.suppliers.map((supplier) => ({ ...supplier })) : [];
  }

  async createSupplier(record: SupplierRecord, user: AppUser) {
    if (!isInternal(user)) throw new Error('El usuario no puede registrar proveedores.');
    if (this.suppliers.some((supplier) => supplier.id === record.id)) throw new Error('El identificador del proveedor ya existe.');
    this.suppliers.push({ ...record });
    return { ...record };
  }

  async listSupplierCoverages(user: AppUser) {
    return isInternal(user) ? this.supplierCoverages.map((coverage) => structuredClone(coverage)) : [];
  }

  async upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser) {
    if (!isInternal(user)) throw new Error('El usuario no puede administrar coberturas.');
    if (!this.suppliers.some((supplier) => supplier.id === record.supplierId)) throw new Error('El proveedor no existe.');
    const existingIndex = this.supplierCoverages.findIndex((coverage) => coverage.id === record.id);
    if (existingIndex >= 0) this.supplierCoverages[existingIndex] = structuredClone(record);
    else this.supplierCoverages.push(structuredClone(record));
    return structuredClone(record);
  }

  async listDeliveries(user: AppUser) {
    return isInternal(user) ? seedDeliveries : seedDeliveries.filter((item) => item.participantId === user.participantId);
  }

  async listDeliveryProjects(user: AppUser) {
    const records = isInternal(user) ? this.deliveryProjects : this.deliveryProjects.filter((item) => item.participantId === user.participantId);
    return structuredClone(records);
  }

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
