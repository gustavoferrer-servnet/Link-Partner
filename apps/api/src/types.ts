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
