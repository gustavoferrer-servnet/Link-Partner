export interface ProposalOptions { carrierRedundancyAvailable: boolean; carrierRedundancyRequested: boolean; feasibleSupplierCount: number; supplierNames: string[]; updatedAt: string | null; redundancyLocations?: string[] }
import type { TechnologyCoverage } from './components/CoverageTechnologies';
export type NetworkSource = 'Red Servnet' | 'Tercero';
export type ResolutionLevel = 'P1' | 'P2' | 'P3';
export type OpportunityStatus = 'En análisis' | 'Propuesta' | 'En entrega' | 'Bloqueada';

export interface Opportunity {
  carrierRedundancyRequested?: boolean;
  id: string;
  origin: 'Servnet' | 'Tercero' | 'DIGITAL';
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  level: ResolutionLevel | null;
  network: NetworkSource | null;
  capacity: string;
  service: string;
  clientSla: string;
  deliveryDate: string;
  status: OpportunityStatus | 'PRICING_PENDING' | 'FEASIBILITY_PENDING' | 'NO_COVERAGE' | 'VALIDATION_PENDING';
  mrc: number | null;
  margin: number | null;
  source?: 'DIGITAL' | 'COVERAGE';
  prefeasibility?: {
    location: { latitude: number; longitude: number; address: string };
    coverage: DigitalConsultation['coverage'];
    services?: ConsultationServiceResult[];
    locations?: { input: DigitalConsultation['input']; coverage: DigitalConsultation['coverage'] }[];
    coverageSelection?: { id: string; revisionId: string; featureIndexes: number[] }[];
    savedAt: string;
    createdBy?: { authUid: string; email: string; displayName: string };
  };
  proposalDraft?: { id: string; createdAt: string; createdBy: { authUid: string; email: string; displayName: string }; status: 'PRICING_PENDING' };
  consultationCode?: string;
}

export interface ConsultationServiceResult {
  product: 'Internet dedicado' | 'L2L';
  capacityMbps: number;
  locationIndexes: number[];
  coverage: DigitalConsultation['coverage'];
}

export interface DigitalConsultationSummary {
  serviceCount?: number;
  capacitiesMbps?: number[];
  locationCount?: number;
  addresses?: string[];
  carrierRedundancyRequested?: boolean;
  code: string; opportunityId: string; createdAt: string; channel: 'ENTERPRISE' | 'WHOLESALE';
  qualificationStatus: string; fullName: string | null; email: string | null; company: string | null;
  customerReference: string | null; address: string; city: string; product: string; capacityMbps: number;
  coverageStatus: 'AVAILABLE' | 'PENDING' | 'NO_COVERAGE' | 'ERROR';
}
export interface DigitalConsultation {
  services?: ConsultationServiceResult[];
  locations?: { input: DigitalConsultation['input']; coverage: DigitalConsultation['coverage']; locationValidation: NonNullable<DigitalConsultation['locationValidation']> }[];
  proposalOptions?: ProposalOptions;
  code: string; opportunityId: string; createdAt: string; channel: 'ENTERPRISE' | 'WHOLESALE'; qualificationStatus: string;
  input: { address: string; city: string; product: string; capacityMbps: number; fullName?: string; email?: string; company?: string; firstName?: string; lastName?: string; customerReference?: string; latitude?: number; longitude?: number };
  coverage: { versions?: CoverageMapVersion[]; policyVersion?: string; technologies?: TechnologyCoverage[]; status: DigitalConsultationSummary['coverageStatus']; reason: string; checkedAt: string; suppliers: { supplierName: string; classification: 'on-net' | 'near-net' | 'off-net'; policyLevel: string; distanceMeters: number | null; technologies?: TechnologyCoverage[] }[] };
  pricing: { status: 'PENDING'; amount: null; currency: 'MXN'; reason: string };
  tracking: { stage: string; state: string; nextAction: string; commitmentDate: string | null };
  locationValidation: { confirmedAddress: string; originalAddress: string; originalCity: string; provider: string; confirmedAt: string } | null;
}

export interface Proposal {
  id: string;
  supplier: string;
  kind: string;
  mrc: number;
  nrc: number;
  deliveryDays: number;
  availability: number;
  mttrHours: number;
  scorecard: number;
  totalScore: number;
  recommended?: boolean;
}

export interface Supplier {
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

export interface SupplierCoverage {
  id: string;
  supplierId: string;
  supplierName: string;
  sourceFileName: string;
  color: string;
  featureCount: number;
  polygonCount: number;
  data: FeatureCollection;
  updatedAt: string;
  updatedBy: string;
  mapVersion?: CoverageMapVersion;
}

export interface Delivery {
  id: string;
  opportunityId: string;
  site: string;
  executor: string;
  phase: string;
  forecastDate: string;
  status: 'En tiempo' | 'En riesgo' | 'Retrasado' | 'Bloqueado';
  blocker?: string;
}

export type OperationalStatus = 'Pendiente' | 'En curso' | 'En espera' | 'Cancelado' | 'Concluido';
export type ScheduleStatus = 'En tiempo' | 'En riesgo' | 'Retrasado';

export interface ProjectTask {
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

export interface DeliveryDeviation {
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

export interface DeliveryProject {
  id: string;
  opportunityId: string;
  serviceLineId: string;
  client: string;
  site: string;
  flow: 'Servnet' | 'Terceros' | 'Híbrido';
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
  externalRefs: { wsasRequestId: string | null; hubspotObjectId: string | null; wsasServiceId: string | null };
  source: 'Link Partner' | 'WSAS';
  lastSyncAt: string | null;
  syncStatus: 'Sincronizado' | 'Pendiente' | 'Error' | 'Simulado';
  tasks: ProjectTask[];
  commitmentHistory: Array<{ id: string; previousDate: string | null; newDate: string; reason: string; author: string; changedAt: string }>;
  deviations: DeliveryDeviation[];
  documents: Array<{ id: string; taskId: string | null; name: string; type: string; url: string; author: string; createdAt: string }>;
  cfeRoutes: Array<{ id: string; route: string; stage: string; year: number; registrationDate: string | null; visitDate: string | null; releaseDate: string | null; owner: string; nextAction: string; followUpDate: string | null; comments: string; blockingTaskId: string | null }>;
  closures: { technicalDelivery: boolean; monitoring: boolean; billing: boolean; administrative: boolean; customerExperience: boolean; supplierBilling: boolean };
  auditEvents: Array<{ id: string; action: string; entity: string; actor: string; occurredAt: string; source: 'Link Partner' | 'WSAS' | 'HubSpot'; summary: string }>;
  syncOperations: Array<{ id: string; target: 'WSAS' | 'HubSpot'; action: string; status: 'Pendiente' | 'Enviada' | 'Confirmada' | 'Error'; attempts: number; lastAttemptAt: string | null; error: string | null }>;
}

export interface SessionUser {
  authUid: string;
  email: string;
  displayName: string;
  organization: string;
  roles: string[];
}
import type { FeatureCollection } from 'geojson';

export interface CoverageMapVersion {
  id: string; supplierId?: string; supplierName?: string; sourceFileName?: string;
  version?: number; revisionId?: string; sha256?: string; updatedAt: string;
}
export interface CoverageActivity {
  id: string; action: 'CREATED' | 'UPDATED' | 'DELETED' | 'RESTORED'; occurredAt: string;
  actor: { authUid: string; email: string; displayName: string };
  map: CoverageMapVersion; previousMap: CoverageMapVersion | null; featureCount: number; polygonCount: number;
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
