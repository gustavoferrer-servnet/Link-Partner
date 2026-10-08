import type { Request } from 'express';

export type AppRole = 'internal_admin' | 'supplier_manager' | 'buyer' | 'pre_sales' | 'delivery_manager' | 'noc' | 'finance' | 'viewer' | 'external_admin' | 'external_commercial' | 'external_approver' | 'external_technical' | 'external_viewer';

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
  id: string;
  origin: 'Servnet' | 'Tercero';
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  level: 'P1' | 'P2' | 'P3';
  network: 'Red Servnet' | 'Tercero';
  capacity: string;
  service: string;
  clientSla: string;
  deliveryDate: string;
  status: string;
  mrc: number;
  margin: number;
  participantId?: string | null;
}

export interface SupplierRecord {
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
