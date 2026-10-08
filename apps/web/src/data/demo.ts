import type { Delivery, Opportunity, Proposal, SessionUser, Supplier } from '../types';

export const demoUser: SessionUser = {
  authUid: 'demo-operations-user',
  email: 'operaciones@servnet.mx',
  displayName: 'Laura Rodríguez',
  organization: 'Servnet México',
  roles: ['internal_admin', 'supplier_manager'],
};

export const opportunities: Opportunity[] = [
  { id: 'OPP-2026-0142', origin: 'Servnet', siteId: 'SIT-0874', siteName: 'Insurgentes Sur', address: 'Av. Insurgentes Sur 1263, Del Valle', city: 'CDMX', latitude: 19.3716, longitude: -99.1783, level: 'P1', network: 'Red Servnet', capacity: '1 Gbps', service: 'Internet dedicado + respaldo', clientSla: '99.90%', deliveryDate: '28 oct 2026', status: 'En análisis', mrc: 48000, margin: 32 },
  { id: 'OPP-2026-0138', origin: 'Tercero', siteId: 'SIT-0611', siteName: 'Parque Naucalpan', address: 'Av. Primero de Mayo 42', city: 'Naucalpan', latitude: 19.4791, longitude: -99.2368, level: 'P2', network: 'Tercero', capacity: '500 Mbps', service: 'MPLS', clientSla: '99.90%', deliveryDate: '5 nov 2026', status: 'Propuesta', mrc: 36500, margin: 24 },
  { id: 'OPP-2026-0136', origin: 'Servnet', siteId: 'SIT-0520', siteName: 'Iztapalapa Oriente', address: 'Eje 6 Sur 884', city: 'CDMX', level: 'P3', network: 'Tercero', capacity: '200 Mbps', service: 'Internet empresarial', clientSla: '99.50%', deliveryDate: '9 nov 2026', status: 'Propuesta', mrc: 28700, margin: 18 },
  { id: 'OPP-2026-0131', origin: 'Tercero', siteId: 'SIT-0987', siteName: 'Coyoacán Centro', address: 'Miguel Ángel de Quevedo 630', city: 'CDMX', level: 'P1', network: 'Red Servnet', capacity: '1 Gbps', service: 'Internet dedicado', clientSla: '99.95%', deliveryDate: '22 oct 2026', status: 'En entrega', mrc: 52200, margin: 38 },
  { id: 'OPP-2026-0128', origin: 'Servnet', siteId: 'SIT-0334', siteName: 'Santa Fe Poniente', address: 'Vasco de Quiroga 3900', city: 'CDMX', level: 'P2', network: 'Tercero', capacity: '2 Gbps', service: 'MPLS + Internet', clientSla: '99.95%', deliveryDate: '29 oct 2026', status: 'Bloqueada', mrc: 78500, margin: 21 },
  { id: 'OPP-2026-0120', origin: 'Servnet', siteId: 'SIT-0766', siteName: 'Tlalnepantla Industrial', address: 'Av. Gustavo Baz 321', city: 'Tlalnepantla', level: 'P1', network: 'Red Servnet', capacity: '500 Mbps', service: 'Internet dedicado', clientSla: '99.90%', deliveryDate: '30 oct 2026', status: 'En entrega', mrc: 41000, margin: 35 },
];

export const proposals: Proposal[] = [
  { id: 'PR-201', supplier: 'Cirion', kind: 'Carrier P2', mrc: 48000, nrc: 25000, deliveryDays: 15, availability: 99.95, mttrHours: 6, scorecard: 91, totalScore: 88, recommended: true },
  { id: 'PR-202', supplier: 'Axtel', kind: 'Carrier P2', mrc: 52000, nrc: 30000, deliveryDays: 20, availability: 99.90, mttrHours: 4, scorecard: 88, totalScore: 82 },
  { id: 'PR-203', supplier: 'Totalplay Empresarial', kind: 'Marketplace', mrc: 45000, nrc: 20000, deliveryDays: 25, availability: 99.80, mttrHours: 8, scorecard: 81, totalScore: 76 },
];

export const suppliers: Supplier[] = [
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

export const deliveries: Delivery[] = [
  { id: 'SD-0766', opportunityId: 'OPP-2026-0120', site: 'Tlalnepantla Industrial', executor: 'Red Servnet', phase: 'Permisos', forecastDate: '30 oct 2026', status: 'En riesgo', blocker: 'Permisos municipales' },
  { id: 'SD-0334', opportunityId: 'OPP-2026-0128', site: 'Santa Fe Poniente', executor: 'Cirion', phase: 'Obra e instalación', forecastDate: '4 nov 2026', status: 'Bloqueado', blocker: 'Cruce con terceros' },
  { id: 'SD-0611', opportunityId: 'OPP-2026-0138', site: 'Parque Naucalpan', executor: 'Axtel', phase: 'Factibilidad', forecastDate: '5 nov 2026', status: 'En riesgo', blocker: 'Capacidad de ductos' },
  { id: 'SD-0520', opportunityId: 'OPP-2026-0136', site: 'Iztapalapa Oriente', executor: 'Carrier P3', phase: 'Site survey', forecastDate: '9 nov 2026', status: 'Retrasado', blocker: 'Acceso a sitio' },
  { id: 'SD-0987', opportunityId: 'OPP-2026-0131', site: 'Coyoacán Centro', executor: 'Red Servnet', phase: 'Pruebas', forecastDate: '22 oct 2026', status: 'En tiempo' },
];

export const priceHistory = [
  { month: 'Ene', average: 36, p25: 30, p75: 49 },
  { month: 'Feb', average: 35, p25: 29, p75: 50 },
  { month: 'Mar', average: 43, p25: 33, p75: 58 },
  { month: 'Abr', average: 44, p25: 35, p75: 61 },
  { month: 'May', average: 41, p25: 34, p75: 59 },
  { month: 'Jun', average: 39, p25: 32, p75: 57 },
  { month: 'Jul', average: 37, p25: 31, p75: 55 },
  { month: 'Ago', average: 39, p25: 32, p75: 56 },
  { month: 'Sep', average: 40, p25: 33, p75: 58 },
  { month: 'Oct', average: 44, p25: 35, p75: 62 },
  { month: 'Nov', average: 40, p25: 33, p75: 58 },
  { month: 'Dic', average: 39, p25: 32, p75: 57 },
];
