import type { AppUser, DeliveryRecord, OpportunityRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';

export interface Repository {
  getUserByAuthUid(authUid: string): Promise<AppUser | null>;
  listOpportunities(user: AppUser): Promise<OpportunityRecord[]>;
  getOpportunity(id: string, user: AppUser): Promise<OpportunityRecord | null>;
  listSuppliers(user: AppUser): Promise<SupplierRecord[]>;
  createSupplier(record: SupplierRecord, user: AppUser): Promise<SupplierRecord>;
  listSupplierCoverages(user: AppUser): Promise<SupplierCoverageRecord[]>;
  upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser): Promise<SupplierCoverageRecord>;
  listDeliveries(user: AppUser): Promise<DeliveryRecord[]>;
}
