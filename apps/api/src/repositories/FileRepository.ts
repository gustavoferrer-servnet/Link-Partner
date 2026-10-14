import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { AppUser, DeliveryProjectRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';
import { MemoryRepository } from './MemoryRepository.js';
import { coverageMapVersion } from '../services/coverageVersions.js';

interface PersistedState {
  customers: import('../types.js').CustomerAccount[];
  customerSessions: import('../types.js').CustomerSession[];
  reservedConsultationCodes: string[];
  consultations: import('../types.js').ConsultationRecord[];
  suppliers: SupplierRecord[];
  supplierCoverages: SupplierCoverageRecord[];
  coverageActivity: import('../types.js').CoverageActivity[];
  retiredSupplierCoverages: import('../types.js').RetiredSupplierCoverage[];
  deliveryProjects: DeliveryProjectRecord[];
}

export class FileRepository extends MemoryRepository {
  private readonly filePath: string;
  private readonly ready: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = config.dataFilePath) {
    super();
    this.filePath = filePath;
    this.ready = this.load();
  }

  private async load() {
    try {
      const state = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<PersistedState>;
      if (Array.isArray(state.customers)) this.customers = state.customers;
      if (Array.isArray(state.customerSessions)) this.customerSessions = state.customerSessions;
      if (Array.isArray(state.consultations)) this.consultations = state.consultations;
      this.reservedConsultationCodes = new Set([...(state.reservedConsultationCodes ?? []), ...this.consultations.map(item => item.code)]);
      if (Array.isArray(state.suppliers)) this.suppliers = state.suppliers;
      if (Array.isArray(state.supplierCoverages)) this.supplierCoverages = state.supplierCoverages.map(record => ({ ...record, mapVersion: coverageMapVersion(record) }));
      if (Array.isArray(state.coverageActivity)) this.coverageActivity = state.coverageActivity;
      if (Array.isArray(state.retiredSupplierCoverages)) this.retiredSupplierCoverages = state.retiredSupplierCoverages;
      if (Array.isArray(state.deliveryProjects)) this.deliveryProjects = state.deliveryProjects;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async persist() {
    const state: PersistedState = {
      customers: this.customers, customerSessions: this.customerSessions,
      reservedConsultationCodes: [...this.reservedConsultationCodes],
      consultations: this.consultations,
      suppliers: this.suppliers,
      supplierCoverages: this.supplierCoverages,
      coverageActivity: this.coverageActivity,
      retiredSupplierCoverages: this.retiredSupplierCoverages,
      deliveryProjects: this.deliveryProjects,
    };
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  private queueMutation<T>(mutation: () => Promise<T>) {
    const pending = this.writeQueue.then(async () => {
      const previousCustomers = structuredClone(this.customers);
      const previousSessions = structuredClone(this.customerSessions);
      const previousReservedCodes = new Set(this.reservedConsultationCodes);
      const previousConsultations = structuredClone(this.consultations);
      const previousSuppliers = structuredClone(this.suppliers);
      const previousCoverages = structuredClone(this.supplierCoverages);
      const previousCoverageActivity = structuredClone(this.coverageActivity);
      const previousRetiredCoverages = structuredClone(this.retiredSupplierCoverages);
      const previousDeliveryProjects = structuredClone(this.deliveryProjects);

      try {
        const result = await mutation();
        await this.persist();
        return result;
      } catch (error) {
        this.customers = previousCustomers;
        this.customerSessions = previousSessions;
        this.reservedConsultationCodes = previousReservedCodes;
        this.consultations = previousConsultations;
        this.suppliers = previousSuppliers;
        this.supplierCoverages = previousCoverages;
        this.coverageActivity = previousCoverageActivity;
        this.retiredSupplierCoverages = previousRetiredCoverages;
        this.deliveryProjects = previousDeliveryProjects;
        throw error;
      }
    });

    // A failed disk write must not poison every subsequent persistence attempt.
    this.writeQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  override async saveSupplierManagement(id: string, management: import('../types.js').SupplierManagement, expectedVersion: number, user: AppUser) {
    await this.ready;
    return this.queueMutation(() => super.saveSupplierManagement(id, management, expectedVersion, user));
  }
  override async createCustomer(account: import('../types.js').CustomerAccount) { await this.ready; return this.queueMutation(() => super.createCustomer(account)); }
  override async getCustomerByEmail(email: string) { await this.ready; await this.writeQueue; return super.getCustomerByEmail(email); }
  override async getCustomer(id: string) { await this.ready; await this.writeQueue; return super.getCustomer(id); }
  override async saveCustomerSession(session: import('../types.js').CustomerSession) { await this.ready; return this.queueMutation(() => super.saveCustomerSession(session)); }
  override async getCustomerSession(hash: string) { await this.ready; await this.writeQueue; return super.getCustomerSession(hash); }
  override async deleteCustomerSession(hash: string) { await this.ready; return this.queueMutation(() => super.deleteCustomerSession(hash)); }
  override async listCustomerConsultations(id: string) { await this.ready; await this.writeQueue; return super.listCustomerConsultations(id); }
  override async claimCustomerConsultation(code: string, id: string, email: string) { await this.ready; return this.queueMutation(() => super.claimCustomerConsultation(code, id, email)); }
  override async createConsultation(record: import('../types.js').ConsultationRecord) {
    await this.ready;
    return this.queueMutation(() => super.createConsultation(record));
  }
  override async createOpportunityProposal(id: string, user: AppUser) {
    await this.ready;
    return this.queueMutation(() => super.createOpportunityProposal(id, user));
  }
  override async updateConsultationProposal(code: string, requested: boolean, expectedAccessHash: string) {
    await this.ready;
    return this.queueMutation(() => super.updateConsultationProposal(code, requested, expectedAccessHash));
  }
  override async getConsultationByAccessHash(accessHash: string) {
    await this.ready; await this.writeQueue;
    return super.getConsultationByAccessHash(accessHash);
  }
  override async getConsultation(code: string) {
    await this.ready; await this.writeQueue;
    return super.getConsultation(code);
  }
  override async listConsultations(user: AppUser) {
    await this.ready; await this.writeQueue;
    return super.listConsultations(user);
  }
  override async listOpportunities(user: AppUser) {
    await this.ready; await this.writeQueue;
    return super.listOpportunities(user);
  }
  override async getOpportunity(id: string, user: AppUser) {
    await this.ready; await this.writeQueue;
    return super.getOpportunity(id, user);
  }
  override async listSuppliers(user: AppUser) {
    await this.ready;
    await this.writeQueue;
    return super.listSuppliers(user);
  }

  override async createSupplier(record: SupplierRecord, user: AppUser) {
    await this.ready;
    return this.queueMutation(() => super.createSupplier(record, user));
  }

  override async listSupplierCoverageVersions(user: AppUser) {
    await this.ready; await this.writeQueue;
    return super.listSupplierCoverageVersions(user);
  }

  override async listSupplierCoverages(user: AppUser) {
    await this.ready;
    await this.writeQueue;
    return super.listSupplierCoverages(user);
  }

  override async getSupplierCoverage(id: string, user: AppUser) {
    await this.ready; await this.writeQueue;
    return super.getSupplierCoverage(id, user);
  }

  override async upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser, expectedRevisionId?: string | null) {
    await this.ready;
    return this.queueMutation(() => super.upsertSupplierCoverage(record, user, expectedRevisionId));
  }

  override async retireSupplierCoverage(id: string, supplierId: string, user: AppUser, expectedRevisionId: string) { await this.ready; return this.queueMutation(() => super.retireSupplierCoverage(id, supplierId, user, expectedRevisionId)); }
  override async restoreSupplierCoverage(id: string, supplierId: string, user: AppUser, activityId: string) { await this.ready; return this.queueMutation(() => super.restoreSupplierCoverage(id, supplierId, user, activityId)); }
  override async listRetiredSupplierCoverages(supplierId: string, user: AppUser) { await this.ready; await this.writeQueue; return super.listRetiredSupplierCoverages(supplierId, user); }

  override async listCoverageActivity(supplierId: string, user: AppUser) {
    await this.ready; await this.writeQueue;
    return super.listCoverageActivity(supplierId, user);
  }

  override async listDeliveryProjects(user: AppUser) {
    await this.ready;
    await this.writeQueue;
    return super.listDeliveryProjects(user);
  }

  override async listOpportunityDeliveryProjects(id: string) { await this.ready; await this.writeQueue; return super.listOpportunityDeliveryProjects(id); }
  override async getDeliveryProject(id: string, user: AppUser) {
    await this.ready;
    await this.writeQueue;
    return super.getDeliveryProject(id, user);
  }

  override async saveDeliveryProject(record: DeliveryProjectRecord, user: AppUser) {
    await this.ready;
    return this.queueMutation(() => super.saveDeliveryProject(record, user));
  }
}
