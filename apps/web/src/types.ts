export type NetworkSource = 'Red Servnet' | 'Tercero';
export type ResolutionLevel = 'P1' | 'P2' | 'P3';
export type OpportunityStatus = 'En análisis' | 'Propuesta' | 'En entrega' | 'Bloqueada';

export interface Opportunity {
  id: string;
  origin: 'Servnet' | 'Tercero';
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  level: ResolutionLevel;
  network: NetworkSource;
  capacity: string;
  service: string;
  clientSla: string;
  deliveryDate: string;
  status: OpportunityStatus;
  mrc: number;
  margin: number;
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
