import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { publicConsultation } from './prefeasibility.js';
import type { ConsultationRecord } from '../types.js';

export class ConsultationEmailError extends Error {
  constructor(message: string, public status = 503, public retryAfter?: number) { super(message); }
}
const attempts = new Map<string, { count: number; expires: number; next: number; sending: boolean }>();
function coverageLines(coverage: ReturnType<typeof publicConsultation>['coverage']) {
  return [`Rutas prefactibles: ${coverage.routeCount}`,
    ...coverage.technologies.map(value => `${value.technology === 'MW' ? 'Microonda (MW)' : 'Fibra óptica (FO)'}: ${value.status === 'AVAILABLE' ? 'Prefactible' : value.status === 'NO_COVERAGE' ? 'Sin cobertura identificada' : 'Por validar'}. Distancia al PoP más cercano: ${value.nearestPopDistanceMeters === null ? 'Por confirmar' : `${value.nearestPopDistanceMeters} m (línea recta)`}.`)];
}
export function consultationEmailMessage(record: ConsultationRecord) {
  const result = publicConsultation(record);
  const text = [
    'Linkpartner CX · Servnet Partner Network', '',
    `Código de consulta: ${result.code}`, `Nombre: ${result.input.fullName || ''}`, `Empresa: ${result.input.company || ''}`,
    `Dirección: ${result.input.address}`, `Servicio: ${result.input.product}`, result.services && result.services.length > 1 ? 'Capacidad: por servicio (detalle abajo)' : `Capacidad: ${result.input.capacityMbps} Mbps`, '',
    `Prefactibilidad: ${result.coverage.status === 'AVAILABLE' ? 'Prefactible' : result.coverage.status === 'NO_COVERAGE' ? 'Revisión de alternativas' : 'Por validar'}`,
    result.coverage.reason, `Precio: ${result.pricing.reason}`, '',
    ...(!result.services && !result.locations ? coverageLines(result.coverage) : []),
    ...(result.proposalOptions.carrierRedundancyRequested ? ['Propuesta con redundancia de rutas: solicitada.'] : []), '',
    ...(result.services ?? []).flatMap((service, index) => [`Servicio ${index + 1}: ${service.product} · ${service.capacityMbps} Mbps`,
      ...service.locationIndexes.map((locationIndex, endpoint) => `${service.product === 'L2L' ? `Punta ${endpoint === 0 ? 'A' : 'B'}` : 'Dirección'}: ${(result.locations?.[locationIndex].input ?? result.input).address}`),
      service.coverage.reason, ...coverageLines(service.coverage), '']),
    ...(result.locations ?? []).flatMap((location, index) => [`Localidad ${index + 1}: ${location.input.address}`, ...coverageLines(location.coverage), '']),
    `Recupera tu consulta en ${config.cxPublicUrl} con el código y este email.`,
    'Si tienes cuenta, revisa tus consultas y seguimientos en Mis consultas.', '',
    'Lo que debes saber antes de contratar:',
    'Cobertura: sujeta a validación técnica final.', 'Obra civil: podría requerir trabajos adicionales.',
    'Permisos: algunos edificios requieren autorización.', 'Fecha estimada: puede variar por condiciones de instalación.',
    'Precio: puede cambiar por costos extraordinarios.', 'SLA: se confirma según la solución contratada.',
  ].join('\n');
  return { from: { name: 'Linkpartner CX', address: config.mailFrom! }, to: record.input.email!, subject: `Tu consulta Linkpartner CX · ${record.code}`, text };
}
export async function sendConsultationEmail(record: ConsultationRecord) {
  if (!record.input.email) throw new ConsultationEmailError('Esta consulta no tiene un email registrado.', 422);
  if (!config.mailFrom) throw new ConsultationEmailError('El envío de correo está pendiente de activar con Google Workspace. Tu consulta sigue guardada.');
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.expires <= now && !entry.sending) attempts.delete(key);
  const key = record.input.email.toLowerCase();
  const entry = attempts.get(key) ?? { count: 0, expires: now + 3600000, next: 0, sending: false };
  if (entry.sending || entry.next > now || entry.count >= 5) throw new ConsultationEmailError('Espera antes de solicitar otro correo.', 429, Math.max(1, Math.ceil(((entry.count >= 5 ? entry.expires : entry.next) - now) / 1000)));
  entry.count++; entry.sending = true; entry.next = now + 60000; attempts.set(key, entry);
  const transport = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465, requireTLS: true,
    ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
  try {
    const sent = await transport.sendMail(consultationEmailMessage(record));
    if (!sent.accepted.length) throw new Error('Recipient not accepted');
  } catch {
    throw new ConsultationEmailError('No pudimos enviar el correo. Tu consulta sigue guardada; intenta nuevamente en un minuto.');
  } finally { entry.sending = false; transport.close(); }
}
