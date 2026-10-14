import type { Request } from 'express';

export type AppRole = 'internal_admin' | 'operations_manager' | 'supplier_manager' | 'buyer' | 'pre_sales' | 'delivery_manager' | 'noc' | 'finance' | 'viewer' | 'external_admin' | 'external_commercial' | 'external_approver' | 'external_technical' | 'external_viewer';

export interface Identity {
  authUid: string;
  email: string;
  displayName: string;
}

export interface AppUser extends Identity {
  participantId: string | null;
  organization: string;
  roles: AppRole[];
  enabled: boolean;
}

export interface AuthenticatedRequest extends Request {
  identity?: Identity;
  appUser?: AppUser;
}

export interface OpportunityRecord {
  carrierRedundancyRequested?: boolean;
  source?: 'DIGITAL' | 'COVERAGE';
  prefeasibility?: {
    location: { latitude: number; longitude: number; address: string };
    coverage: ConsultationRecord['coverage'];
    locations?: ConsultationLocationResult[];
    services?: ConsultationServiceResult[];
    coverageSelection?: { id: string; revisionId: string; featureIndexes: number[] }[];
    savedAt: string;
    createdBy?: Identity;
  };
  proposalDraft?: { id: string; createdAt: string; createdBy: Identity; status: 'PRICING_PENDING' };
  channel?: 'ENTERPRISE' | 'WHOLESALE';
  consultationCode?: string;
  id: string;
  origin: 'Servnet' | 'Tercero' | 'DIGITAL';
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  level: 'P1' | 'P2' | 'P3' | null;
  network: 'Red Servnet' | 'Tercero' | null;
  capacity: string;
  service: string;
  clientSla: string;
  deliveryDate: string;
  status: string;
  mrc: number | null;
  margin: number | null;
  participantId?: string | null;
}

export interface SupplierRecord {
  management?: SupplierManagement;
  evaluation?: SupplierEvaluation;
  id: string;
  name: string;
  legalName: string;
  kind: 'Red propia' | 'Carrier' | 'Broker';
  status: 'Aprobado P2' | 'Solo P3' | 'En observación' | 'Pendiente de homologación';
  sla: string | null;
  score: number | null;
  activeLinks: number | null;
  contractEnd: string | null;
}

export interface SupplierCoverageRecord {
  id: string;
  supplierId: string;
  supplierName: string;
  sourceFileName: string;
  color: string;
  featureCount: number;
  polygonCount: number;
  data: {
    type: 'FeatureCollection';
    features: Record<string, unknown>[];
  };
  updatedAt: string;
  updatedBy: string;
  mapVersion?: CoverageMapVersion;
}

export interface CoverageMapVersion {
  id: string;
  supplierId?: string;
  supplierName?: string;
  sourceFileName?: string;
  version?: number;
  revisionId?: string;
  sha256?: string;
  updatedAt: string;
}
export interface CoverageActivity {
  id: string;
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'RESTORED';
  occurredAt: string;
  actor: { authUid: string; email: string; displayName: string };
  map: CoverageMapVersion;
  previousMap: CoverageMapVersion | null;
  featureCount: number;
  polygonCount: number;
}

export interface RetiredSupplierCoverage {
  record: SupplierCoverageRecord;
  activityId: string;
  retiredAt: string;
}

export interface DeliveryRecord {
  id: string;
  opportunityId: string;
  site: string;
  executor: string;
  phase: string;
  forecastDate: string;
  status: string;
  blocker?: string;
  participantId?: string | null;
}

export type DeliveryFlow = 'Servnet' | 'Terceros' | 'Híbrido';
export type OperationalStatus = 'Pendiente' | 'En curso' | 'En espera' | 'Cancelado' | 'Concluido';
export type ScheduleStatus = 'En tiempo' | 'En riesgo' | 'Retrasado';

export interface ProjectTaskRecord {
  id: string;
  externalCode: string | null;
  name: string;
  stage: string;
  area: string;
  owner: string;
  status: OperationalStatus;
  scheduleStatus: ScheduleStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  dependencies: string[];
  evidenceCount: number;
}

export interface DeliveryDeviationRecord {
  id: string;
  taskId: string | null;
  date: string;
  area: string;
  type: 'Riesgo' | 'Dependencia' | 'Bloqueo';
  description: string;
  impact: 'Alto' | 'Medio' | 'Bajo';
  actions: string;
  owner: string;
  targetDate: string | null;
  status: 'Abierto' | 'En corrección' | 'Resuelto';
  solvedAt: string | null;
}

export interface DeliveryDocumentRecord {
  id: string;
  taskId: string | null;
  name: string;
  type: string;
  url: string;
  author: string;
  createdAt: string;
}

export interface CfeRouteRecord {
  id: string;
  route: string;
  stage: string;
  year: number;
  registrationDate: string | null;
  visitDate: string | null;
  releaseDate: string | null;
  owner: string;
  nextAction: string;
  followUpDate: string | null;
  comments: string;
  blockingTaskId: string | null;
}

export interface CommitmentChangeRecord {
  id: string;
  previousDate: string | null;
  newDate: string;
  reason: string;
  author: string;
  changedAt: string;
}

export interface AuditEventRecord {
  id: string;
  action: string;
  entity: string;
  actor: string;
  occurredAt: string;
  source: 'Link Partner' | 'WSAS' | 'HubSpot';
  summary: string;
}

export interface SyncOperationRecord {
  id: string;
  target: 'WSAS' | 'HubSpot';
  action: string;
  status: 'Pendiente' | 'Enviada' | 'Confirmada' | 'Error';
  attempts: number;
  lastAttemptAt: string | null;
  error: string | null;
}

export interface DeliveryProjectRecord {
  id: string;
  opportunityId: string;
  serviceLineId: string;
  client: string;
  site: string;
  flow: DeliveryFlow;
  infrastructure: 'Red Servnet' | 'Tercero' | 'Híbrida';
  provider: string | null;
  service: string;
  capacity: string;
  serviceDeliveryOwner: string;
  stage: string;
  operationalStatus: OperationalStatus;
  scheduleStatus: ScheduleStatus;
  risk: 'Alto' | 'Medio' | 'Bajo';
  nextAction: string;
  originalCommitment: string | null;
  currentCommitment: string | null;
  forecastDate: string | null;
  actualDeliveryDate: string | null;
  requiresCfe: boolean;
  externalRefs: {
    wsasRequestId: string | null;
    hubspotObjectId: string | null;
    wsasServiceId: string | null;
  };
  source: 'Link Partner' | 'WSAS';
  lastSyncAt: string | null;
  syncStatus: 'Sincronizado' | 'Pendiente' | 'Error' | 'Simulado';
  tasks: ProjectTaskRecord[];
  commitmentHistory: CommitmentChangeRecord[];
  deviations: DeliveryDeviationRecord[];
  documents: DeliveryDocumentRecord[];
  cfeRoutes: CfeRouteRecord[];
  closures: {
    technicalDelivery: boolean;
    monitoring: boolean;
    billing: boolean;
    administrative: boolean;
    customerExperience: boolean;
    supplierBilling: boolean;
  };
  auditEvents: AuditEventRecord[];
  syncOperations: SyncOperationRecord[];
  participantId?: string | null;
}

export type QualificationStatus = 'PRICING_PENDING' | 'FEASIBILITY_PENDING' | 'NO_COVERAGE' | 'VALIDATION_PENDING';
export interface CustomerAccount {
  id: string; email: string; fullName: string; company: string; passwordHash: string; createdAt: string;
}
export interface CustomerSession {
  tokenHash: string; customerId: string; expiresAt: string;
}
export class CustomerEmailConflict extends Error {}
export type CoverageTechnology = 'MW' | 'FO';
export interface CoveragePoP {
  name: string | null;
  reference: string | null;
  kind: 'POP' | 'NETWORK_REFERENCE';
  supplierName: string;
  technology: CoverageTechnology | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  insideCoverage: boolean;
  sourceFileName: string;
}
export interface CoverageTechnologyResult {
  technology: CoverageTechnology;
  status: 'AVAILABLE' | 'PENDING' | 'NO_COVERAGE';
  classification: 'on-net' | 'near-net' | 'off-net' | null;
  distanceMeters: number | null; policyLevel: string; reason: string; supplierNames?: string[];
  insideCoverage?: boolean | null;
  nearestPop?: CoveragePoP | null;
  nearbyPops?: CoveragePoP[];
  nearbyPopRadiusMeters?: number;
}
export interface ConsultationRecord {
  services?: ConsultationServiceResult[];
  locations?: ConsultationLocationResult[];
  createdBy?: Identity;
  proposalPreferences?: { carrierRedundancy: boolean; updatedAt: string; source: 'AUTOMATIC' | 'CUSTOMER' };
  customerId?: string;
  code: string;
  accessHash: string;
  requestHash: string;
  locationValidation?: { originalAddress: string; originalCity: string; confirmedAddress: string; provider: string; confirmedAt: string };
  input: { channel: 'ENTERPRISE' | 'WHOLESALE'; address: string; city: string; product: 'Internet dedicado' | 'L2L' | 'MPLS'; capacityMbps: number; latitude?: number; longitude?: number; customerReference?: string; fullName?: string; email?: string; company?: string; firstName?: string; lastName?: string };
  qualificationStatus: QualificationStatus;
  coverage: { policyVersion?: string; technologies?: CoverageTechnologyResult[]; status: 'AVAILABLE' | 'PENDING' | 'NO_COVERAGE' | 'ERROR'; providerIds: string[]; suppliers?: { supplierId: string; supplierName: string; classification: 'on-net' | 'near-net' | 'off-net'; distanceMeters: number | null; policyLevel: string; technologies?: CoverageTechnologyResult[] }[]; checkedAt: string; versions: CoverageMapVersion[]; reason: string };
  pricing: { status: 'PENDING'; amount: null; currency: 'MXN'; reason: string };
  opportunity: OpportunityRecord;
  createdAt: string;
}
export interface ConsultationLocationResult {
  input: ConsultationRecord['input'];
  coverage: ConsultationRecord['coverage'];
  locationValidation: NonNullable<ConsultationRecord['locationValidation']>;
}

export interface ConsultationServiceResult {
  product: 'Internet dedicado' | 'L2L';
  capacityMbps: number;
  locationIndexes: number[];
  coverage: ConsultationRecord['coverage'];
}

export type SupplierOperationalState = 'En validación inicial' | 'Habilitado provisional' | 'Habilitado' | 'Condicionado' | 'Restringido para nuevas contrataciones';
export type SupplierMetric = 'availability' | 'resolution' | 'delivery' | 'quality' | 'response' | 'commitment';
export interface SupplierManagement {
  version: number;
  startedAt: string;
  owner: string;
  ownerUser?: { authUid: string; email: string; displayName: string; source: 'application-hub' | 'development' } | null;
  validationDue: string;
  nextReview: string;
  nextCapacityReview: string;
  contract: { sla: string | null; contractEnd: string | null };
  requirements: Array<{ id: string; label: string; fulfilled: boolean; evidence: string; validUntil: string | null }>;
  observations: Array<{ id: string; metric: SupplierMetric; reference: string; dueAt: string; completedAt: string | null; outcome: 'complies' | 'fails' | 'pending'; evidence: string; critical: boolean; createdBy: string; createdAt: string }>;
  actions: Array<{ id: string; description: string; owner: string; dueAt: string; status: 'Abierta' | 'Cerrada'; evidence: string }>;
  authorization: { state: SupplierOperationalState; reason: string; actor: string; at: string } | null;
  history: Array<{ id: string; at: string; actor: string; summary: string }>;
}
export interface SupplierEvaluation {
  score: number | null;
  coverage: number;
  confidence: 'Sin historial' | 'Limitada' | 'Suficiente';
  recommendation: SupplierOperationalState;
  critical: boolean;
  periodStart: string;
  periodEnd: string;
  metrics: Array<{ id: SupplierMetric; label: string; weight: number; evaluated: number; complies: number; pending: number; score: number | null }>;
  deliveryEvidence: Array<{ id: string; reference: string; dueAt: string; completedAt: string | null; complies: boolean }>;
}
