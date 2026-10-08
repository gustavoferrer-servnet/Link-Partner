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

export interface SessionUser {
  authUid: string;
  email: string;
  displayName: string;
  organization: string;
  roles: string[];
}
import type { FeatureCollection } from 'geojson';
