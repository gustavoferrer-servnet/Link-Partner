import { SupplierManagementConflict } from '../services/supplierEvaluation.js';
import { changeProposalPreference } from '../services/carrierRedundancy.js';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type CollectionReference, type DocumentData } from 'firebase-admin/firestore';
import { config } from '../config.js';
import type { AppUser, DeliveryProjectRecord, DeliveryRecord, OpportunityRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';
import { ConsultationCodeCollision } from '../services/consultationCodes.js';
import { createHash } from 'node:crypto';
import { CustomerEmailConflict, type CustomerAccount, type CustomerSession, type ConsultationRecord } from '../types.js';
import type { Repository } from './Repository.js';
import { CoverageConflict, coverageMapVersion, coverageUpdate, coverageRetirement, coverageRestoration } from '../services/coverageVersions.js';

const internalRoles = new Set(['operations_manager', 'internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'delivery_manager', 'noc', 'finance', 'viewer']);

function isInternal(user: AppUser) {
  return user.roles.some((role) => internalRoles.has(role));
}

function collection<T extends DocumentData>(name: string): CollectionReference<T> {
  const app = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId: config.googleCloudProject,
  });
  return getFirestore(app, config.firestoreDatabaseId).collection(name) as CollectionReference<T>;
}

export class FirestoreRepository implements Repository {
  async createCustomer(account: CustomerAccount) {
    const ref = collection<CustomerAccount>('cx_customers').doc(account.id);
    const emailRef = collection<{customerId: string}>('cx_customer_emails').doc(createHash('sha256').update(account.email).digest('hex'));
    await ref.firestore.runTransaction(async transaction => {
      if ((await transaction.get(emailRef)).exists) throw new CustomerEmailConflict();
      transaction.create(ref, account); transaction.create(emailRef, {customerId: account.id});
    });
  }
  async getCustomerByEmail(email: string) {
    const index = await collection<{customerId: string}>('cx_customer_emails').doc(createHash('sha256').update(email).digest('hex')).get();
    return index.exists ? this.getCustomer(index.data()!.customerId) : null;
  }
  async getCustomer(id: string) { return (await collection<CustomerAccount>('cx_customers').doc(id).get()).data() ?? null; }
  async saveCustomerSession(session: CustomerSession) { await collection<CustomerSession>('cx_customer_sessions').doc(session.tokenHash).set(session); }
  async getCustomerSession(hash: string) { return (await collection<CustomerSession>('cx_customer_sessions').doc(hash).get()).data() ?? null; }
  async deleteCustomerSession(hash: string) { await collection<CustomerSession>('cx_customer_sessions').doc(hash).delete(); }
  async listCustomerConsultations(id: string) {
    const result = await collection<ConsultationRecord>('consultations').where('customerId', '==', id).get();
    return result.docs.map(doc => doc.data()).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async claimCustomerConsultation(code: string, id: string, email: string) {
    const ref = collection<ConsultationRecord>('consultations').doc(code);
    return ref.firestore.runTransaction(async transaction => {
      const record = (await transaction.get(ref)).data();
      if (!record || record.input.email?.trim().toLowerCase() !== email || (record.customerId && record.customerId !== id)) return false;
      transaction.update(ref, { customerId: id }); return true;
    });
  }
  async createConsultation(record: import('../types.js').ConsultationRecord) {
    const consultations = collection<import('../types.js').ConsultationRecord>('consultations');
    const ref = consultations.doc(record.code);
    const keyRef = collection<{ code: string }>('consultation_keys').doc(record.accessHash);
    const reservation = collection<{ createdAt: string }>('consultation_codes').doc(record.code);
    return ref.firestore.runTransaction(async transaction => {
      const key = await transaction.get(keyRef);
      if (key.exists) {
        const existing = await transaction.get(consultations.doc(key.data()!.code));
        if (!existing.exists) throw new Error('La consulta está archivada; su clave y código permanecen reservados.');
        return existing.data()!;
      }
      const [existing, reserved] = await Promise.all([transaction.get(ref), transaction.get(reservation)]);
      if (existing.exists || reserved.exists) throw new ConsultationCodeCollision();
      transaction.create(reservation, { createdAt: record.createdAt });
      transaction.create(keyRef, { code: record.code });
      transaction.create(ref, record);
      transaction.create(collection<OpportunityRecord>('deals').doc(record.opportunity.id), record.opportunity);
      return record;
    });
  }
  async updateConsultationProposal(code: string, requested: boolean, expectedAccessHash: string) {
    const ref = collection<ConsultationRecord>('consultations').doc(code);
    return ref.firestore.runTransaction(async transaction => {
      const record = (await transaction.get(ref)).data();
      if (!record || record.accessHash !== expectedAccessHash) return null;
      const deal = collection<OpportunityRecord>('deals').doc(record.opportunity.id);
      const dealSnapshot = await transaction.get(deal);
      const saved = changeProposalPreference(record, requested);
      transaction.update(ref, { proposalPreferences: saved.proposalPreferences, 'opportunity.carrierRedundancyRequested': requested });
      if (dealSnapshot.exists) transaction.update(deal, { carrierRedundancyRequested: requested });
      return saved;
    });
  }
  async getConsultationByAccessHash(accessHash: string) {
    const key = await collection<{ code: string }>('consultation_keys').doc(accessHash).get();
    if (key.exists) return this.getConsultation(key.data()!.code);
    // Compatibility with consultations persisted before the idempotency index existed.
    const legacy = await collection<import('../types.js').ConsultationRecord>('consultations').where('accessHash', '==', accessHash).limit(1).get();
    return legacy.empty ? null : legacy.docs[0].data();
  }
  async getConsultation(code: string) {
    const doc = await collection<import('../types.js').ConsultationRecord>('consultations').doc(code).get();
    return doc.data() ?? null;
  }
  async listConsultations(user: AppUser) {
    if (!isInternal(user)) return [];
    const result = await collection<import('../types.js').ConsultationRecord>('consultations').orderBy('createdAt', 'desc').get();
    return result.docs.map(doc => doc.data());
  }
  async getInternalConsultation(code: string, user: AppUser) {
    return isInternal(user) ? this.getConsultation(code) : null;
  }
  async getUserByAuthUid(authUid: string) {
    const result = await collection<AppUser>('users').where('authUid', '==', authUid).limit(1).get();
    return result.empty ? null : result.docs[0].data();
  }

  async listOpportunities(user: AppUser) {
    let query: FirebaseFirestore.Query<OpportunityRecord> = collection<OpportunityRecord>('deals').orderBy('id', 'desc');
    if (!isInternal(user) && !user.participantId) return [];
    if (!isInternal(user)) query = query.where('participantId', '==', user.participantId);
    return (await query.limit(100).get()).docs.map((doc) => ({ ...doc.data(), id: doc.data().id || doc.id }));
  }

  async getOpportunity(id: string, user: AppUser) {
    const result = await collection<OpportunityRecord>('deals').where('id', '==', id).limit(1).get();
    if (result.empty) return null;
    const record = result.docs[0].data();
    if (!isInternal(user) && (!user.participantId || record.participantId !== user.participantId)) return null;
    return record;
  }

  async createOpportunityProposal(id: string, user: AppUser) {
    if (!user.roles.some(role => ['internal_admin', 'supplier_manager', 'buyer', 'pre_sales'].includes(role))) return null;
    const deal = collection<OpportunityRecord>('deals').doc(id);
    return deal.firestore.runTransaction(async transaction => {
      const opportunity = (await transaction.get(deal)).data();
      if (!opportunity?.prefeasibility || !opportunity.consultationCode) return null;
      const consultation = collection<ConsultationRecord>('consultations').doc(opportunity.consultationCode);
      if (!(await transaction.get(consultation)).exists) return null;
      if (opportunity.proposalDraft) return opportunity;
      const proposalDraft = { id: `PRP-${opportunity.consultationCode}`, status: 'PRICING_PENDING' as const, createdAt: new Date().toISOString(), createdBy: { authUid: user.authUid, email: user.email, displayName: user.displayName } };
      transaction.update(deal, { proposalDraft, status: 'Propuesta' });
      transaction.update(consultation, { 'opportunity.proposalDraft': proposalDraft, 'opportunity.status': 'Propuesta' });
      return { ...opportunity, proposalDraft, status: 'Propuesta' };
    });
  }

  async listSuppliers(user: AppUser) {
    if (!isInternal(user)) return [];
    return (await collection<SupplierRecord>('suppliers').orderBy('name').get()).docs.map((doc) => ({ ...doc.data(), id: doc.data().id || doc.id }));
  }

  async saveSupplierManagement(id: string, management: import('../types.js').SupplierManagement, expectedVersion: number, user: AppUser) {
    if (!isInternal(user)) throw new Error('Acceso denegado.');
    const reference = collection<SupplierRecord>('suppliers').doc(id);
    return reference.firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const supplier = snapshot.data();
      if (!supplier) throw new Error('Proveedor no encontrado.');
      if ((supplier.management?.version ?? 0) !== expectedVersion) throw new SupplierManagementConflict();
      transaction.update(reference, { management, sla: management.contract.sla, contractEnd: management.contract.contractEnd });
      return { ...supplier, management, sla: management.contract.sla, contractEnd: management.contract.contractEnd };
    });
  }

  async createSupplier(record: SupplierRecord, user: AppUser) {
    if (!isInternal(user)) throw new Error('El usuario no puede registrar proveedores.');
    const reference = collection<SupplierRecord>('suppliers').doc(record.id);
    if ((await reference.get()).exists) throw new Error('El identificador del proveedor ya existe.');
    await reference.set(record);
    return record;
  }

  async listSupplierCoverages(user: AppUser) {
    if (!isInternal(user)) return [];
    return (await collection<SupplierCoverageRecord>('supplier_coverages').orderBy('supplierName').get()).docs.map((doc) => {
      const record = { ...doc.data(), id: doc.data().id || doc.id };
      return { ...record, mapVersion: coverageMapVersion(record) };
    });
  }

  async listSupplierCoverageVersions(user: AppUser) {
    if (!isInternal(user)) return [];
    const snapshots = await collection<SupplierCoverageRecord>('supplier_coverages').select('id', 'mapVersion').get();
    return Promise.all(snapshots.docs.map(async doc => {
      if (doc.data().mapVersion) return doc.data().mapVersion;
      const record = (await doc.ref.get()).data() as SupplierCoverageRecord;
      return coverageMapVersion({ ...record, id: record.id || doc.id });
    }));
  }

  async getSupplierCoverage(id: string, user: AppUser) {
    if (!isInternal(user)) return null;
    const coverages = collection<SupplierCoverageRecord>('supplier_coverages');
    const snapshot = await coverages.doc(id).get();
    // Older documents were keyed by supplierId rather than map id.
    const record = snapshot.data() ?? (await coverages.where('id', '==', id).limit(1).get()).docs[0]?.data();
    return record ? { ...record, id: record.id || id, mapVersion: coverageMapVersion({ ...record, id: record.id || id }) } : null;
  }

  async listCoverageActivity(supplierId: string, user: AppUser) {
    if (!isInternal(user)) return [];
    return (await collection<import('../types.js').CoverageActivity>('coverage_activity').where('map.supplierId', '==', supplierId).get()).docs.map(doc => doc.data()).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt) || b.map.version! - a.map.version! || b.id.localeCompare(a.id));
  }

  async listRetiredSupplierCoverages(supplierId: string, user: AppUser) {
    if (!isInternal(user)) return [];
    return (await collection<import('../types.js').RetiredSupplierCoverage>('retired_supplier_coverages').where('record.supplierId', '==', supplierId).get()).docs.map(doc => doc.data());
  }

  async retireSupplierCoverage(id: string, supplierId: string, user: AppUser, expectedRevisionId: string) {
    if (!user.roles.some(role => ['internal_admin', 'supplier_manager'].includes(role))) throw new CoverageConflict('No puedes administrar archivos de cobertura.');
    const coverages = collection<SupplierCoverageRecord>('supplier_coverages');
    const reference = coverages.doc(id), legacyReference = coverages.doc(supplierId);
    await reference.firestore.runTransaction(async transaction => {
      const current = await transaction.get(reference);
      const legacy = legacyReference.id === reference.id ? current : await transaction.get(legacyReference);
      const data = current.data() ?? (legacy.data()?.id === id ? legacy.data() : undefined);
      if (!data || data.supplierId !== supplierId) throw new CoverageConflict('Este archivo ya no está vigente para el proveedor seleccionado.');
      const { retired, activity } = coverageRetirement({ ...data, id }, user, expectedRevisionId);
      transaction.set(collection<import('../types.js').RetiredSupplierCoverage>('retired_supplier_coverages').doc(id), retired);
      transaction.create(collection<import('../types.js').CoverageActivity>('coverage_activity').doc(activity.id), activity);
      if (current.exists) transaction.delete(reference);
      if (legacyReference.id !== reference.id && legacy.data()?.id === id) transaction.delete(legacyReference);
    });
  }

  async restoreSupplierCoverage(id: string, supplierId: string, user: AppUser, activityId: string) {
    if (!user.roles.some(role => ['internal_admin', 'supplier_manager'].includes(role))) throw new CoverageConflict('No puedes administrar archivos de cobertura.');
    const coverages = collection<SupplierCoverageRecord>('supplier_coverages');
    const reference = coverages.doc(id), archiveReference = collection<import('../types.js').RetiredSupplierCoverage>('retired_supplier_coverages').doc(id);
    return reference.firestore.runTransaction(async transaction => {
      const archive = (await transaction.get(archiveReference)).data();
      if (!archive || archive.record.id !== id || archive.record.supplierId !== supplierId) throw new CoverageConflict('El archivo ya fue restaurado o no pertenece a este proveedor.');
      const active = await transaction.get(reference);
      const siblings = await transaction.get(coverages.where('supplierId', '==', supplierId));
      if (active.exists || siblings.docs.some(doc => (doc.data().id || doc.id) === id || doc.data().sourceFileName.localeCompare(archive.record.sourceFileName, 'es-MX', { sensitivity: 'accent' }) === 0)) throw new CoverageConflict('Ya existe un archivo vigente con este nombre. No se duplicará su cobertura.');
      const { saved, activity } = coverageRestoration(archive, user, activityId);
      transaction.set(reference, saved);
      transaction.delete(archiveReference);
      transaction.create(collection<import('../types.js').CoverageActivity>('coverage_activity').doc(activity.id), activity);
      return saved;
    });
  }

  async upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser, expectedRevisionId?: string | null) {
    if (!isInternal(user)) throw new Error('El usuario no puede administrar coberturas.');
    const coverages = collection<SupplierCoverageRecord>('supplier_coverages');
    const reference = coverages.doc(record.id);
    const legacyReference = coverages.doc(record.supplierId);
    return reference.firestore.runTransaction(async transaction => {
      if (expectedRevisionId !== undefined) {
        const siblingMaps = await transaction.get(coverages.where('supplierId', '==', record.supplierId));
        if (siblingMaps.docs.some(doc => (doc.data().id || doc.id) !== record.id && doc.data().sourceFileName.localeCompare(record.sourceFileName, 'es-MX', { sensitivity: 'accent' }) === 0)) throw new CoverageConflict('Ya existe otro mapa vigente con este nombre. Selecciona el mapa que deseas sustituir.');
      }
      const current = await transaction.get(reference);
      const legacy = legacyReference.id === reference.id ? current : await transaction.get(legacyReference);
      const previousData = current.data() ?? (legacy.data()?.id === record.id ? legacy.data() : undefined);
      const previous = previousData ? { ...previousData, id: previousData.id || record.id } : undefined;
      const { saved, activity } = coverageUpdate(record, previous, user, expectedRevisionId);
      transaction.set(reference, saved);
      transaction.create(collection<import('../types.js').CoverageActivity>('coverage_activity').doc(activity.id), activity);
      if (legacyReference.id !== reference.id && legacy.exists && legacy.data()?.id === record.id) transaction.delete(legacyReference);
      return saved;
    });
  }

  async listDeliveries(user: AppUser) {
    let query: FirebaseFirestore.Query<DeliveryRecord> = collection<DeliveryRecord>('pmo_deliveries').orderBy('forecastDate');
    if (!isInternal(user) && !user.participantId) return [];
    if (!isInternal(user)) query = query.where('participantId', '==', user.participantId);
    return (await query.limit(100).get()).docs.map((doc) => ({ ...doc.data(), id: doc.data().id || doc.id }));
  }

  async listDeliveryProjects(user: AppUser) {
    let query: FirebaseFirestore.Query<DeliveryProjectRecord> = collection<DeliveryProjectRecord>('delivery_projects').orderBy('currentCommitment');
    if (!isInternal(user) && !user.participantId) return [];
    if (!isInternal(user)) query = query.where('participantId', '==', user.participantId);
    return (await query.limit(200).get()).docs.map((doc) => structuredClone({ ...doc.data(), id: doc.data().id || doc.id }));
  }

  async listOpportunityDeliveryProjects(id: string) { return (await collection<DeliveryProjectRecord>('delivery_projects').where('opportunityId', '==', id).get()).docs.map(doc => doc.data()); }
  async getDeliveryProject(id: string, user: AppUser) {
    const snapshot = await collection<DeliveryProjectRecord>('delivery_projects').doc(id).get();
    if (!snapshot.exists) return null;
    const record = snapshot.data()!;
    if (!isInternal(user) && (!user.participantId || record.participantId !== user.participantId)) return null;
    return structuredClone(record);
  }

  async saveDeliveryProject(record: DeliveryProjectRecord, user: AppUser) {
    if (!isInternal(user)) throw new Error('El usuario no puede modificar proyectos de entrega.');
    await collection<DeliveryProjectRecord>('delivery_projects').doc(record.id).set(record);
    return structuredClone(record);
  }
}
