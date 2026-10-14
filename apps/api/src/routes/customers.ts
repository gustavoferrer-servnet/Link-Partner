import { isConsultationCode, isShortConsultationCode } from '../services/consultationCodes.js';
import { Router } from 'express';
import { z } from 'zod';
import { CustomerEmailConflict } from '../types.js';
import { repository } from '../repositories/index.js';
import { presentConsultation } from '../services/coverageEngine.js';
import { publicConsultation } from '../services/prefeasibility.js';
import { AuthBusy, clearCustomerCookie, csrfForToken, customerAuth, issueCustomerSession, newCustomerId, passwordHash, publicCustomer, tokenHash, validCustomerMutation, verifyPassword } from '../services/customerAuth.js';

export const customerRouter = Router();
const email = z.string().trim().max(254).email().toLowerCase();
const login = z.object({ email, password: z.string().min(1).max(128) }).strict();
const registration = login.extend({ password: z.string().min(8).max(128).regex(/\p{Lu}/u).regex(/\p{Ll}/u).regex(/[^\p{L}\p{N}\s]/u), fullName: z.string().trim().min(1).max(200), company: z.string().trim().min(1).max(200) });
const windows = new Map<string, { count: number; expires: number }>();
customerRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.get('Sec-Fetch-Site') === 'cross-site') { res.status(403).json({ message: 'Abre tu cuenta desde Link Partner CX.' }); return; }
  if (req.method !== 'GET') {
    if (!validCustomerMutation(req)) { res.status(403).json({ message: 'Solicitud inválida. Recarga la página.' }); return; }
    const now = Date.now();
    for (const [key, value] of windows) if (value.expires <= now) windows.delete(key);
    const loginAttempt = req.path === '/login' || req.path === '/register';
    // Shared email quota prevents brute force from several addresses; IP quota bounds registration and imports.
    const keys = [`ip:${req.ip}:${loginAttempt ? 'auth' : 'write'}`, ...(loginAttempt && typeof req.body?.email === 'string' ? [`email:${tokenHash(req.body.email.trim().toLowerCase())}`] : [])];
    for (const key of keys) {
      const entry = windows.get(key) ?? { count: 0, expires: now + 15 * 60000 };
      entry.count++; windows.set(key, entry);
      if (entry.count > (key.startsWith('email:') ? 10 : loginAttempt ? 300 : 120)) { res.set('Retry-After', String(Math.ceil((entry.expires - now) / 1000))).status(429).json({ message: 'Demasiados intentos. Intenta más tarde.' }); return; }
    }
  }
  next();
});
customerRouter.post('/register', async (req, res, next) => {
  try {
    const parsed = registration.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Revisa nombre completo, empresa y email. Usa una contraseña de 8 a 128 caracteres, con al menos una mayúscula, una minúscula y un carácter especial.' }); return; }
    const { password, ...profile } = parsed.data;
    const customer = { ...profile, id: newCustomerId(), passwordHash: await passwordHash(password), createdAt: new Date().toISOString() };
    await repository.createCustomer(customer);
    res.status(201).json({ data: await issueCustomerSession(req, res, customer) });
  } catch (error) {
    if (error instanceof CustomerEmailConflict) { res.status(409).json({ message: 'No se pudo crear la cuenta. Si ya te registraste, inicia sesión.' }); return; }
    if (error instanceof AuthBusy) { res.set('Retry-After', '3').status(503).json({ message: 'Intenta nuevamente en unos segundos.' }); return; }
    next(error);
  }
});
customerRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = login.safeParse(req.body);
    if (!parsed.success) { res.status(401).json({ message: 'Email o contraseña incorrectos.' }); return; }
    const customer = await repository.getCustomerByEmail(parsed.data.email);
    if (!await verifyPassword(parsed.data.password, customer?.passwordHash) || !customer) { res.status(401).json({ message: 'Email o contraseña incorrectos.' }); return; }
    res.json({ data: await issueCustomerSession(req, res, customer) });
  } catch (error) {
    if (error instanceof AuthBusy) { res.set('Retry-After', '3').status(503).json({ message: 'Intenta nuevamente en unos segundos.' }); return; }
    next(error);
  }
});
customerRouter.get('/me', async (req, res, next) => {
  try { const auth = await customerAuth(req); res.json({ data: auth ? { customer: publicCustomer(auth.customer), csrfToken: csrfForToken(auth.token) } : null }); }
  catch (error) { next(error); }
});
customerRouter.use(async (req, res, next) => {
  try {
    const auth = await customerAuth(req);
    if (!auth) { clearCustomerCookie(res); res.status(401).json({ message: 'Inicia sesión para ver tus consultas.' }); return; }
    if (req.method !== 'GET' && !validCustomerMutation(req, auth.token)) { res.status(403).json({ message: 'Tu sesión cambió. Recarga la página.' }); return; }
    res.locals.customer = auth.customer; res.locals.sessionToken = auth.token; next();
  } catch (error) { next(error); }
});
customerRouter.post('/logout', async (_req, res, next) => {
  try { await repository.deleteCustomerSession(tokenHash(res.locals.sessionToken)); clearCustomerCookie(res); res.json({ data: null }); }
  catch (error) { next(error); }
});
// Publish only known milestones; free-form project text can identify the delivery network.
const customerStages = new Set(['Planeación', 'Implementación', 'Instalación', 'Activación', 'Entrega', 'Cierre']);
const customerStates = new Set(['Pendiente', 'En curso', 'En espera', 'Cancelado', 'Concluido']);
async function customerResult(record: Parameters<typeof publicConsultation>[0], annotateCoverage = true) {
  const result = annotateCoverage ? await presentConsultation(record) : publicConsultation(record);
  const projects = await repository.listOpportunityDeliveryProjects(record.opportunity.id);
  return { ...result, tracking: projects[0] ? { stage: customerStages.has(projects[0].stage) ? projects[0].stage : 'Instalación en seguimiento', state: customerStates.has(projects[0].operationalStatus) ? projects[0].operationalStatus : 'En validación', commitmentDate: /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(projects[0].currentCommitment ?? '') ? projects[0].currentCommitment : null, nextAction: 'Tu asesor confirmará los avances y la fecha de entrega.', installationStarted: true } : { ...result.tracking, installationStarted: false } };
}
customerRouter.get('/consultations', async (_req, res, next) => {
  try {
    const records = await repository.listCustomerConsultations(res.locals.customer.id);
    // The history shows saved results; opening a consultation preserves its saved anonymous summary.
    res.json({ data: await Promise.all(records.map(record => customerResult(record, false))) });
  } catch (error) { next(error); }
});
customerRouter.get('/consultations/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    const record = isConsultationCode(code) ? await repository.getConsultation(code) : null;
    if (!record || record.customerId !== res.locals.customer.id) { res.status(404).json({ message: 'Consulta no encontrada en tu cuenta.' }); return; }
    res.json({ data: await customerResult(record) });
  } catch (error) { next(error); }
});
customerRouter.post('/consultations/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    if (!isShortConsultationCode(code) || !await repository.claimCustomerConsultation(code, res.locals.customer.id, res.locals.customer.email)) { res.status(404).json({ message: 'El código y el email de tu cuenta no corresponden a una consulta disponible.' }); return; }
    res.json({ data: await customerResult((await repository.getConsultation(code))!) });
  } catch (error) { next(error); }
});
