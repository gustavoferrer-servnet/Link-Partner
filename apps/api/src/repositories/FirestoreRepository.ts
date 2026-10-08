import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type CollectionReference, type DocumentData } from 'firebase-admin/firestore';
import { config } from '../config.js';
import type { AppUser, DeliveryRecord, OpportunityRecord, SupplierCoverageRecord, SupplierRecord } from '../types.js';
import type { Repository } from './Repository.js';

const internalRoles = new Set(['internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'delivery_manager', 'noc', 'finance', 'viewer']);

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
  async getUserByAuthUid(authUid: string) {
    const result = await collection<AppUser>('users').where('authUid', '==', authUid).limit(1).get();
    return result.empty ? null : result.docs[0].data();
  }

  async listOpportunities(user: AppUser) {
    let query: FirebaseFirestore.Query<OpportunityRecord> = collection<OpportunityRecord>('deals').orderBy('id', 'desc');
    if (!isInternal(user)) query = query.where('participantId', '==', user.participantId);
    return (await query.limit(100).get()).docs.map((doc) => ({ ...doc.data(), id: doc.data().id || doc.id }));
  }

  async getOpportunity(id: string, user: AppUser) {
    const result = await collection<OpportunityRecord>('deals').where('id', '==', id).limit(1).get();
    if (result.empty) return null;
    const record = result.docs[0].data();
    if (!isInternal(user) && record.participantId !== user.participantId) return null;
    return record;
  }

  async listSuppliers(user: AppUser) {
    if (!isInternal(user)) return [];
    return (await collection<SupplierRecord>('suppliers').orderBy('name').get()).docs.map((doc) => ({ ...doc.data(), id: doc.data().id || doc.id }));
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
    return (await collection<SupplierCoverageRecord>('supplier_coverages').orderBy('supplierName').get()).docs.map((doc) => ({ ...doc.data(), id: doc.data().id || doc.id }));
  }

  async upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser) {
    if (!isInternal(user)) throw new Error('El usuario no puede administrar coberturas.');
    const coverages = collection<SupplierCoverageRecord>('supplier_coverages');
    const reference = coverages.doc(record.id);
    const legacyReference = coverages.doc(record.supplierId);
    const legacySnapshot = await legacyReference.get();
    const batch = reference.firestore.batch();
    batch.set(reference, record);
    if (legacyReference.id !== reference.id && legacySnapshot.exists && legacySnapshot.data()?.id === record.id) {
      batch.delete(legacyReference);
    }
    await batch.commit();
    return record;
  }

  async listDeliveries(user: AppUser) {
    let query: FirebaseFirestore.Query<DeliveryRecord> = collection<DeliveryRecord>('pmo_deliveries').orderBy('forecastDate');
    if (!isInternal(user)) query = query.where('participantId', '==', user.participantId);
    return (await query.limit(100).get()).docs.map((doc) => ({ ...doc.data(), id: doc.data().id || doc.id }));
  }
}
