import type { AppUser, DeliveryProjectRecord, DeliveryRecord, OpportunityRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';

export interface Repository {
  createCustomer(account: import('../types.js').CustomerAccount): Promise<void>;
  getCustomerByEmail(email: string): Promise<import('../types.js').CustomerAccount | null>;
  getCustomer(id: string): Promise<import('../types.js').CustomerAccount | null>;
  saveCustomerSession(session: import('../types.js').CustomerSession): Promise<void>;
  getCustomerSession(tokenHash: string): Promise<import('../types.js').CustomerSession | null>;
  deleteCustomerSession(tokenHash: string): Promise<void>;
  listCustomerConsultations(customerId: string): Promise<import('../types.js').ConsultationRecord[]>;
  claimCustomerConsultation(code: string, customerId: string, email: string): Promise<boolean>;
  updateConsultationProposal(code: string, requested: boolean, expectedAccessHash: string): Promise<import('../types.js').ConsultationRecord | null>;
  createConsultation(record: import('../types.js').ConsultationRecord): Promise<import('../types.js').ConsultationRecord>;
  getConsultationByAccessHash(accessHash: string): Promise<import('../types.js').ConsultationRecord | null>;
  getConsultation(code: string): Promise<import('../types.js').ConsultationRecord | null>;
  listConsultations(user: AppUser): Promise<import('../types.js').ConsultationRecord[]>;
  getInternalConsultation(code: string, user: AppUser): Promise<import('../types.js').ConsultationRecord | null>;
  getUserByAuthUid(authUid: string): Promise<AppUser | null>;
  listOpportunities(user: AppUser): Promise<OpportunityRecord[]>;
  getOpportunity(id: string, user: AppUser): Promise<OpportunityRecord | null>;
  createOpportunityProposal(id: string, user: AppUser): Promise<OpportunityRecord | null>;
  listSuppliers(user: AppUser): Promise<SupplierRecord[]>;
  saveSupplierManagement(id: string, management: import('../types.js').SupplierManagement, expectedVersion: number, user: AppUser): Promise<SupplierRecord>;
  createSupplier(record: SupplierRecord, user: AppUser): Promise<SupplierRecord>;
  listSupplierCoverageVersions(user: AppUser): Promise<import('../types.js').CoverageMapVersion[]>;
  listSupplierCoverages(user: AppUser): Promise<SupplierCoverageRecord[]>;
  getSupplierCoverage(id: string, user: AppUser): Promise<SupplierCoverageRecord | null>;
  listCoverageActivity(supplierId: string, user: AppUser): Promise<import('../types.js').CoverageActivity[]>;
  upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser, expectedRevisionId?: string | null): Promise<SupplierCoverageRecord>;
  retireSupplierCoverage(id: string, supplierId: string, user: AppUser, expectedRevisionId: string): Promise<void>;
  listRetiredSupplierCoverages(supplierId: string, user: AppUser): Promise<import('../types.js').RetiredSupplierCoverage[]>;
  restoreSupplierCoverage(id: string, supplierId: string, user: AppUser, activityId: string): Promise<SupplierCoverageRecord>;
  listDeliveries(user: AppUser): Promise<DeliveryRecord[]>;
  listDeliveryProjects(user: AppUser): Promise<DeliveryProjectRecord[]>;
  listOpportunityDeliveryProjects(opportunityId: string): Promise<DeliveryProjectRecord[]>;
  getDeliveryProject(id: string, user: AppUser): Promise<DeliveryProjectRecord | null>;
  saveDeliveryProject(record: DeliveryProjectRecord, user: AppUser): Promise<DeliveryProjectRecord>;
}
