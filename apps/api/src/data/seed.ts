import type { AppUser, DeliveryRecord, OpportunityRecord, SupplierRecord } from '../types.js';

export const seedUser: AppUser = {
  authUid: 'demo-operations-user',
  email: 'operaciones@servnet.mx',
  displayName: 'Laura Rodríguez',
  participantId: null,
  organization: 'Servnet México',
  roles: ['internal_admin', 'supplier_manager'],
  enabled: true,
};

export const seedOpportunities: OpportunityRecord[] = [
  { id: 'OPP-2026-0142', origin: 'Servnet', siteId: 'SIT-0874', siteName: 'Insurgentes Sur', address: 'Av. Insurgentes Sur 1263, Del Valle', city: 'CDMX', latitude: 19.3716, longitude: -99.1783, level: 'P1', network: 'Red Servnet', capacity: '1 Gbps', service: 'Internet dedicado + respaldo', clientSla: '99.90%', deliveryDate: '28 oct 2026', status: 'En análisis', mrc: 48000, margin: 32 },
  { id: 'OPP-2026-0138', origin: 'Tercero', siteId: 'SIT-0611', siteName: 'Parque Naucalpan', address: 'Av. Primero de Mayo 42', city: 'Naucalpan', latitude: 19.4791, longitude: -99.2368, level: 'P2', network: 'Tercero', capacity: '500 Mbps', service: 'MPLS', clientSla: '99.90%', deliveryDate: '5 nov 2026', status: 'Propuesta', mrc: 36500, margin: 24, participantId: 'tenant-demo' },
];

export const seedSuppliers: SupplierRecord[] = [
  { id: 'SUP-SERVNET', name: 'Red Servnet', legalName: 'Servnet México', kind: 'Red propia', status: 'Aprobado P2', sla: 'OLA 99.95%', score: 93, activeLinks: 210, contractEnd: 'Interno' },
  { id: 'SUP-ALESTRA', name: 'Alestra', legalName: 'Axtel, S.A.B. de C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-TOTALPLAY', name: 'Totalplay', legalName: 'Total Play Telecomunicaciones S.A.P.I. de C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-WESTELECOM-CTC', name: 'Westelecom (CTC Telecom)', legalName: 'SERVICIOS BEST CTC S.A DE C.V', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-MCM-BUSINESS-TECH', name: 'MCM Business Tech Co', legalName: 'MEGACABLE COMUNICACIONES DE MEXICO, S.A. DE C.V.,', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-METROCARRIER', name: 'Metrocarrier (MCM Business Tech Co)', legalName: 'MEGACABLE COMUNICACIONES DE MEXICO, S.A. DE C.V.,', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-ININSE', name: 'ININSE', legalName: 'Dond Q', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-IENTC', name: 'IENTC', legalName: 'IENTC S. DE R.L. DE C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-C3NTRO-TELECOM', name: 'C3ntro Telecom', legalName: 'UC TELECOMUNICACIONES', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-XCIEN-SANDUR', name: 'XCIEN Sandur', legalName: 'ADMINISTRADORA DE SERVICIOS DE INTERNET SANDUR', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-SELENI', name: 'Seleni', legalName: 'Santiago Sánchez Carbajal', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-COMUNICALO', name: 'Comunicalo', legalName: 'COMUNICALO DE MEXICO', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-FLO-NETWORKS', name: 'Flo Networks', legalName: 'IP Matrix S.A. de C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-FASTNET', name: 'Fastnet', legalName: 'ONT NETWORKS', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-CONECTARED', name: 'Conectared', legalName: 'SITE MAX', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-BESTEL', name: 'Bestel', legalName: 'MÉXICO RED DE TELECOMUNICACIONES, S. DE R.L. DE C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-MXT-FIBER', name: 'MXT Fiber', legalName: 'MXT Fiber Partners, S.A.P.I. de C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-NIDIX', name: 'NIDIX', legalName: 'NIDIX NETWORKS, S.A. DE C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-PENTABYTE', name: 'Pentabyte', legalName: 'GRUPO PENTABYTE TELECOM S DE RL DE CV', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-VIVARO', name: 'Vivaro', legalName: 'COORDINADORA DE CARRIER’S, S.A. DE C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-ININSE-DON-Q', name: 'ININSE (Don Q)', legalName: 'ISABEL MONGE S.A. DE C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-VELOCOM', name: 'Velocom', legalName: 'VELOCOM, S.A. DE C.V.', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
  { id: 'SUP-NEUTRAL-NETWORKS', name: 'Neutral Networks', legalName: 'NEUTRAL NETWORKS', kind: 'Carrier', status: 'Pendiente de homologación', sla: null, score: null, activeLinks: null, contractEnd: null },
];

export const seedDeliveries: DeliveryRecord[] = [
  { id: 'SD-0766', opportunityId: 'OPP-2026-0120', site: 'Tlalnepantla Industrial', executor: 'Red Servnet', phase: 'Permisos', forecastDate: '30 oct 2026', status: 'En riesgo', blocker: 'Permisos municipales' },
  { id: 'SD-0334', opportunityId: 'OPP-2026-0128', site: 'Santa Fe Poniente', executor: 'Cirion', phase: 'Obra e instalación', forecastDate: '4 nov 2026', status: 'Bloqueado', blocker: 'Cruce con terceros' },
];
