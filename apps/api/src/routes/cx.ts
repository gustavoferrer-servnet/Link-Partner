import { serviceCoverage } from '../services/consultationServices.js';
import { feasibleCarriers, serviceCarriers } from '../services/carrierRedundancy.js';
import { combinedCoverage } from '../services/multiLocation.js';
import { Router } from 'express';
import { ConsultationEmailError, sendConsultationEmail } from '../services/consultationEmail.js';
import { config } from '../config.js';
import { locationSuggestions, validateLocationAddress } from '../services/mapsLocation.js';
import { resolveGooglePlace } from '../services/googlePlaces.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { repository } from '../repositories/index.js';
import { reserveConsultation, isConsultationCode as validCode } from '../services/consultationCodes.js';
import { AddressValidationError, verifyLocation } from '../services/addressValidation.js';
import { authenticate, loadAppUser, requireRole } from '../middleware/auth.js';
import { evaluateConsultationLocations, evaluateSupplierCoverage, coverageResponse, presentConsultation } from '../services/coverageEngine.js';
import { customerAuth, sessionToken, validCustomerMutation } from '../services/customerAuth.js';
import type { AuthenticatedRequest, ConsultationRecord } from '../types.js';

export const cxRouter = Router();
const inputObject = z.object({
  locationToken: z.string().min(20).max(5000),
  channel: z.enum(['ENTERPRISE', 'WHOLESALE']),
  address: z.string().trim().min(5).max(1000), city: z.string().trim().min(2).max(200),
  product: z.literal('Internet dedicado'), capacityMbps: z.number().int().min(50).max(1000),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  customerReference: z.string().trim().max(100).optional(),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().max(254).email().toLowerCase(),
  company: z.string().trim().min(1).max(200),
}).strict();
const inputSchema = inputObject.refine(value => (value.latitude === undefined) === (value.longitude === undefined), 'Indica ambas coordenadas.');
const multiInputSchema = inputObject.omit({ locationToken: true, address: true, city: true, latitude: true, longitude: true }).extend({
  locations: z.array(inputObject.pick({ locationToken: true, address: true, city: true, latitude: true, longitude: true }).strict()).min(1).max(10),
}).strict();
const serviceLocationSchema = inputObject.pick({ locationToken: true, address: true, city: true }).extend({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
}).strict();
const serviceInputSchema = inputObject.omit({ locationToken: true, address: true, city: true, latitude: true, longitude: true, capacityMbps: true, product: true }).extend({
  product: z.enum(['Internet dedicado', 'L2L']),
  services: z.array(z.object({ capacityMbps: z.number().int().min(50).max(1000), locations: z.array(serviceLocationSchema).min(1).max(2) }).strict()).min(1).max(10),
}).strict().superRefine((value, context) => {
  if (value.services.reduce((count, service) => count + service.locations.length, 0) > 10) context.addIssue({ code: 'custom', message: 'Máximo 10 direcciones por consulta.' });
  value.services.forEach((service, index) => {
    if (service.locations.length !== (value.product === 'L2L' ? 2 : 1)) context.addIssue({ code: 'custom', path: ['services', index, 'locations'], message: 'Internet dedicado requiere una dirección; L2L requiere las puntas A y B.' });
    if (service.locations.length === 2 && service.locations[0].latitude === service.locations[1].latitude && service.locations[0].longitude === service.locations[1].longitude) context.addIssue({ code: 'custom', path: ['services', index, 'locations'], message: 'Las puntas A y B deben ser distintas.' });
  });
});
const accessSchema = z.string().uuid();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const recoveryFailures = new Map<string, { count: number; expires: number }>();
// A single-instance guard. Distributed deployments must enforce quotas at their gateway.
const windows = new Map<string, { count: number; expires: number }>();
cxRouter.use((req, res, next) => {
  if (!/^\/(?:coverage\/check|locations\/(?:validate|suggest|resolve)|prefeasibility|consultations(?:\/|$))/.test(req.path)) { next(); return; }
  const now = Date.now();
  for (const [key, value] of windows) if (value.expires <= now) windows.delete(key);
  const suggestions = req.path === '/locations/suggest';
  const recovery = req.path.endsWith('/retrieve');
  const key = `${suggestions ? 'suggest' : recovery ? 'recover' : 'consult'}:${req.ip ?? 'unknown'}`;
  const entry = windows.get(key) ?? { count: 0, expires: now + 60000 };
  entry.count++; windows.set(key, entry);
  if (entry.count > (suggestions ? 120 : 30)) { res.setHeader('Retry-After', '60'); res.status(429).json({ message: 'Demasiadas consultas. Intenta en un minuto.' }); return; }
  res.setHeader('Cache-Control', 'no-store'); next();
});
cxRouter.post('/coverage/check', authenticate, loadAppUser, requireRole('internal_admin', 'supplier_manager', 'buyer', 'pre_sales', 'viewer'), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), coverageSelection: z.array(z.object({ id: z.string().min(1).max(200), revisionId: z.string().min(1).max(100), featureIndexes: z.array(z.number().int().min(0).max(1000000)).max(100000) }).strict()).max(100).optional() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Indica latitud y longitud válidas.' }); return; }
  try {
    const { coverageSelection, ...coordinates } = parsed.data;
    const coverage = await evaluateSupplierCoverage({ ...coordinates, channel: 'ENTERPRISE', address: 'Consulta por coordenadas', city: 'Por coordenadas', product: 'Internet dedicado', capacityMbps: 1 }, req.appUser!, coverageSelection);
    res.json({ status: 'success', data: coverageResponse(coverage) });
  } catch (error) { next(error); }
});
cxRouter.get('/locations/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'success', data: { provider: config.addressSearchProvider, browserKey: config.addressSearchProvider === 'google' ? config.googleMapsBrowserKey || null : null } });
});
cxRouter.post('/locations/resolve', async (req, res, next) => {
  const parsed = z.object({ placeId: z.string().min(1).max(300), sessionToken: z.string().uuid(), address: z.string().trim().min(3).max(2048), city: z.string().trim().max(100).default('') }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Selecciona una dirección válida.' }); return; }
  if (config.addressSearchProvider !== 'google') { res.status(409).json({ message: 'Inicia una nueva búsqueda de dirección.' }); return; }
  try { const value = parsed.data; res.json({ status: 'success', data: await resolveGooglePlace(value.placeId, value.sessionToken, value.address, value.city) }); }
  catch (error) { if (error instanceof AddressValidationError) { res.status(error.status).json({ message: error.message }); return; } next(error); }
});
cxRouter.post('/locations/suggest', async (req, res, next) => {
  const parsed = z.object({ address: z.string().trim().min(3).max(2048), city: z.string().trim().max(100).default(''), sessionToken: z.string().uuid().optional() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Escribe al menos tres caracteres de la dirección.' }); return; }
  try {
    res.json({ status: 'success', data: await locationSuggestions(parsed.data.address, parsed.data.city, parsed.data.sessionToken) });
  }
  catch (error) {
    if (error instanceof AddressValidationError) { res.status(error.status).json({ message: error.message }); return; }
    next(error);
  }
});
cxRouter.post('/locations/validate', async (req, res, next) => {
  const parsed = z.object({ address: z.string().trim().min(5).max(300), city: z.string().trim().min(2).max(100) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Escribe calle, número y ciudad para validar la dirección.' }); return; }
  try { res.json({ status: 'success', data: await validateLocationAddress(parsed.data.address, parsed.data.city) }); }
  catch (error) {
    if (error instanceof AddressValidationError) { res.status(error.status).json({ message: error.message }); return; }
    next(error);
  }
});
cxRouter.post('/prefeasibility' , async (req, res, next) => {
  try {
    const parsed = z.union([inputSchema, multiInputSchema, serviceInputSchema]).safeParse(req.body);
    const access = accessSchema.safeParse(req.get('Idempotency-Key'));
    if (!parsed.success || !access.success) { res.status(400).json({ message: 'Revisa tus datos y las direcciones: cada servicio requiere capacidad de 50 a 1000 Mbps; L2L requiere dos puntas distintas. Máximo 10 direcciones.' }); return; }
    const auth = await customerAuth(req);
    if (sessionToken(req) && !auth) { res.status(401).json({ message: 'Tu sesión venció. Inicia sesión nuevamente.' }); return; }
    if (auth && !validCustomerMutation(req, auth.token)) { res.status(403).json({ message: 'Tu sesión cambió. Recarga la página.' }); return; }
    const submissions = 'services' in parsed.data
      ? parsed.data.services.flatMap(service => { const { services: _services, ...common } = parsed.data as z.infer<typeof serviceInputSchema>; return service.locations.map(location => ({ ...common, capacityMbps: service.capacityMbps, ...location })); })
      : 'locations' in parsed.data
        ? parsed.data.locations.map(location => { const { locations: _locations, ...common } = parsed.data as z.infer<typeof multiInputSchema>; return { ...common, ...location }; })
        : [parsed.data];
    let locationOffset = 0;
    const serviceDefinitions = 'services' in parsed.data ? parsed.data.services.map(service => ({ product: parsed.data.product as 'Internet dedicado' | 'L2L', capacityMbps: service.capacityMbps, locationIndexes: service.locations.map(() => locationOffset++) })) : undefined;
    const inputs = submissions.map(({ locationToken: _token, ...input }) => input);
    const input = inputs[0];
    if (!serviceDefinitions && new Set(inputs.map(location => `${location.latitude}:${location.longitude}`)).size !== inputs.length) {
      res.status(400).json({ message: 'Cada localidad debe tener una ubicación distinta. Retira las direcciones duplicadas.' }); return;
    }
    if (auth && input.email !== auth.customer.email) { res.status(400).json({ message: 'Usa el email de tu cuenta para guardar la consulta en tu historial.' }); return; }
    const requestHash = hash(JSON.stringify(serviceDefinitions ? { inputs, services: serviceDefinitions } : inputs.length === 1 ? input : inputs));
    const accessHash = hash(access.data);
    let record = await repository.getConsultationByAccessHash(accessHash);
    if (!record) {
      const verifiedLocations = submissions.map(location => verifyLocation(location.locationToken));
      const invalidIndex = verifiedLocations.findIndex((verified, index) => !verified || verified.address !== inputs[index].address || verified.city !== inputs[index].city || verified.latitude !== inputs[index].latitude || verified.longitude !== inputs[index].longitude);
      if (invalidIndex >= 0) {
        res.status(422).json({ message: `Confirma la dirección ${invalidIndex + 1} antes de consultar cobertura. Si la modificaste, vuelve a seleccionarla.` }); return;
      }
      let coverages: ConsultationRecord['coverage'][];
      try { coverages = await evaluateConsultationLocations(inputs); }
      catch { coverages = inputs.map(() => ({ status: 'ERROR', providerIds: [], checkedAt: new Date().toISOString(), versions: [], reason: 'No pudimos validar cobertura. Tu solicitud quedó registrada para revisión.' })); }
      const services = serviceDefinitions?.map(service => ({ ...service, coverage: serviceCoverage(service.product, service.locationIndexes.map(index => coverages[index])) }));
      const coverage = services ? combinedCoverage(services.map(service => service.coverage)) : combinedCoverage(coverages);
      if (services && services.length > 1) coverage.reason = `${services.length} servicios consultados. Revisa el resultado y la capacidad de cada servicio.`;
      const qualificationStatus = coverage.status === 'AVAILABLE' ? 'PRICING_PENDING' : coverage.status === 'NO_COVERAGE' ? 'NO_COVERAGE' : coverage.status === 'ERROR' ? 'VALIDATION_PENDING' : 'FEASIBILITY_PENDING';
      const createdAt = new Date().toISOString();
      const carrierRedundancy = services ? services.some(service => serviceCarriers(service, coverages.map(coverage => ({ coverage }))).length >= 2) : coverages.some(result => feasibleCarriers(result).length >= 2);
      const locations = inputs.map((input, index) => {
        const verified = verifiedLocations[index]!;
        return { input, coverage: coverages[index], locationValidation: { originalAddress: verified.originalAddress, originalCity: verified.originalCity, confirmedAddress: verified.address, provider: verified.provider || 'configured-geocoder', confirmedAt: createdAt } };
      });
      record = await reserveConsultation(repository, { ...(auth ? { customerId: auth.customer.id } : {}), accessHash, requestHash, input, coverage, qualificationStatus, createdAt,
        ...(locations.length > 1 ? { locations } : {}), ...(services ? { services } : {}),
        proposalPreferences: { carrierRedundancy, updatedAt: createdAt, source: 'AUTOMATIC' },
        locationValidation: locations[0].locationValidation,
        pricing: { status: 'PENDING', amount: null, currency: 'MXN', reason: 'Estamos preparando tu propuesta. El precio se confirmará después de validar la solución.' },
        opportunity: { prefeasibility: { location: { latitude: input.latitude!, longitude: input.longitude!, address: input.address }, coverage, savedAt: createdAt, ...(locations.length > 1 ? { locations } : {}), ...(services ? { services } : {}) }, carrierRedundancyRequested: carrierRedundancy, id: 'pending-reservation', source: 'DIGITAL', channel: input.channel, origin: 'DIGITAL', siteId: 'pending-reservation', siteName: locations.length > 1 ? `${input.company} · ${locations.length} localidades` : input.address, address: input.address, city: input.city, ...(input.latitude !== undefined ? { latitude: input.latitude, longitude: input.longitude } : {}), level: null, network: null, capacity: services && services.length > 1 ? services.map((service, index) => `Servicio ${index + 1}: ${service.capacityMbps} Mbps`).join(' · ') : `${input.capacityMbps} Mbps`, service: input.product, clientSla: 'Por confirmar', deliveryDate: 'Por confirmar', status: qualificationStatus, mrc: null, margin: null, participantId: null },
      });
    }
    if (record.customerId !== auth?.customer.id) { res.status(409).json({ message: 'La clave pertenece a otra cuenta. Inicia una nueva consulta.' }); return; }
    if (record.requestHash !== requestHash) { res.status(409).json({ message: 'La clave ya corresponde a otra consulta. Inicia una nueva.' }); return; }
    res.status(201).json({ status: 'success', data: await presentConsultation(record) });
  } catch (error) { next(error); }
});
cxRouter.post('/consultations/:code/retrieve', async (req, res, next) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    const parsed = z.object({ email: z.string().trim().max(254).email().toLowerCase() }).strict().safeParse(req.body);
    const now = Date.now();
    for (const [key, value] of recoveryFailures) if (value.expires <= now) recoveryFailures.delete(key);
    const failureKey = `${req.ip ?? 'unknown'}:${code}`;
    const failure = recoveryFailures.get(failureKey);
    if (failure && failure.count >= 5) {
      res.setHeader('Retry-After', String(Math.ceil((failure.expires - now) / 1000)));
      res.status(429).json({ message: 'Demasiados intentos. Intenta nuevamente en un minuto.' }); return;
    }
    const record = validCode(code) ? await repository.getConsultation(code) : null;
    const emailHash = hash(normalizeEmail(parsed.success ? parsed.data.email : ''));
    const storedEmailHash = hash(normalizeEmail(record?.input.email || ''));
    const matches = timingSafeEqual(Buffer.from(emailHash), Buffer.from(storedEmailHash)) && Boolean(record?.input.email);
    if (!parsed.success || !record || !matches) {
      const entry = failure ?? { count: 0, expires: now + 60000 };
      entry.count++; recoveryFailures.set(failureKey, entry);
      res.status(404).json({ message: 'Código o email incorrectos.' }); return;
    }
    recoveryFailures.delete(failureKey);
    res.json({ status: 'success', data: await presentConsultation(record) });
  } catch (error) { next(error); }
});
cxRouter.post('/consultations/:code/email', async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().trim().max(254).email().toLowerCase().optional() }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Indica el email registrado en tu consulta.' }); return; }
    const auth = await customerAuth(req);
    if (sessionToken(req) && !auth) { res.status(401).json({ message: 'Tu sesión venció. Inicia sesión nuevamente.' }); return; }
    if (!validCustomerMutation(req, auth?.token)) { res.status(403).json({ message: 'Solicitud inválida. Recarga tu consulta.' }); return; }
    const code = String(req.params.code).trim().toUpperCase();
    const record = validCode(code) ? await repository.getConsultation(code) : null;
    const emailMatches = Boolean(record?.input.email && parsed.data.email) && timingSafeEqual(Buffer.from(hash(normalizeEmail(record?.input.email || ''))), Buffer.from(hash(parsed.data.email || '')));
    if (!record || !(emailMatches || (auth && record.customerId === auth.customer.id))) { res.status(404).json({ message: 'Consulta o datos de acceso incorrectos.' }); return; }
    await sendConsultationEmail(record);
    res.json({ data: { status: 'ACCEPTED', email: record.input.email } });
  } catch (error) {
    if (error instanceof ConsultationEmailError) { if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter)); res.status(error.status).json({ message: error.message }); return; }
    next(error);
  }
});
cxRouter.patch('/consultations/:code/proposal-options', async (req, res, next) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    const parsed = z.object({ carrierRedundancy: z.boolean(), email: z.string().trim().max(254).email().toLowerCase().optional() }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Indica una preferencia válida para la propuesta.' }); return; }
    const auth = await customerAuth(req);
    if (sessionToken(req) && !auth) { res.status(401).json({ message: 'Tu sesión venció. Inicia sesión nuevamente.' }); return; }
    if (!validCustomerMutation(req, auth?.token)) { res.status(403).json({ message: 'Solicitud inválida. Recarga tu consulta en Link Partner CX.' }); return; }
    const record = validCode(code) ? await repository.getConsultation(code) : null;
    const access = accessSchema.safeParse(req.get('X-Consultation-Key'));
    const emailMatches = Boolean(record?.input.email && parsed.data.email) && timingSafeEqual(Buffer.from(hash(normalizeEmail(record?.input.email || ''))), Buffer.from(hash(parsed.data.email || '')));
    const keyMatches = access.success && Boolean(record) && timingSafeEqual(Buffer.from(record!.accessHash), Buffer.from(hash(access.data)));
    if (!record || !(emailMatches || keyMatches || (auth && record.customerId === auth.customer.id))) { res.status(404).json({ message: 'Consulta o datos de acceso incorrectos.' }); return; }
    const saved = await repository.updateConsultationProposal(record.code, parsed.data.carrierRedundancy, record.accessHash);
    if (!saved) { res.status(404).json({ message: 'Consulta no disponible.' }); return; }
    res.json({ status: 'success', data: await presentConsultation(saved) });
  } catch (error) { next(error); }
});
// Compatibility for consultations created before contact-based recovery.
cxRouter.get('/consultations/:code', async (req, res, next) => {
  try {
    const access = accessSchema.safeParse(req.get('X-Consultation-Key'));
    const code = String(req.params.code);
    if (!access.success || !validCode(code)) { res.status(404).json({ message: 'Consulta o llave incorrecta.' }); return; }
    const record = await repository.getConsultation(code);
    if (!record || !timingSafeEqual(Buffer.from(record.accessHash), Buffer.from(hash(access.data)))) { res.status(404).json({ message: 'Consulta o llave incorrecta.' }); return; }
    res.json({ status: 'success', data: await presentConsultation(record) });
  } catch (error) { next(error); }
});
