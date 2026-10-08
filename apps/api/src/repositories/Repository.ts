import type { AppUser, DeliveryProjectRecord, DeliveryRecord, OpportunityRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';

export interface Repository {
  getUserByAuthUid(authUid: string): Promise<AppUser | null>;
  listOpportunities(user: AppUser): Promise<OpportunityRecord[]>;
  getOpportunity(id: string, user: AppUser): Promise<OpportunityRecord | null>;
  listSuppliers(user: AppUser): Promise<SupplierRecord[]>;
  createSupplier(record: SupplierRecord, user: AppUser): Promise<SupplierRecord>;
  listSupplierCoverages(user: AppUser): Promise<SupplierCoverageRecord[]>;
  upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser): Promise<SupplierCoverageRecord>;
  listDeliveries(user: AppUser): Promise<DeliveryRecord[]>;
  listDeliveryProjects(user: AppUser): Promise<DeliveryProjectRecord[]>;
  getDeliveryProject(id: string, user: AppUser): Promise<DeliveryProjectRecord | null>;
  saveDeliveryProject(record: DeliveryProjectRecord, user: AppUser): Promise<DeliveryProjectRecord>;
}
