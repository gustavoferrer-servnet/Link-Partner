import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { repository } from '../repositories/index.js';
import type { CustomerAccount } from '../types.js';

export const customerCookie = config.nodeEnv === 'production' ? '__Host-cx-session' : 'cx-session';
const duration = 30 * 24 * 60 * 60 * 1000;
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfForToken = (value: string) => tokenHash(`csrf:${value}`);
export const publicCustomer = ({ id, fullName, email, company }: CustomerAccount) => ({ id, fullName, email, company });
export function sessionToken(req: Request) {
  const value = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(`${customerCookie}=`))?.slice(customerCookie.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function customerAuth(req: Request) {
  const token = sessionToken(req);
  if (!token) return null;
  const session = await repository.getCustomerSession(tokenHash(token));
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  const customer = await repository.getCustomer(session.customerId);
  return customer ? { customer, token } : null;
}
export function validCustomerMutation(req: Request, token?: string) {
  if (req.get('Sec-Fetch-Site') === 'cross-site' || req.get('X-CX-Request') !== '1' || !req.is('application/json')) return false;
  if (!token) return true;
  const csrf = req.get('X-CSRF-Token') ?? '';
  return /^[a-f0-9]{64}$/.test(csrf) && timingSafeEqual(Buffer.from(csrf), Buffer.from(csrfForToken(token)));
}
export async function issueCustomerSession(req: Request, res: Response, customer: CustomerAccount) {
  const previous = sessionToken(req);
  if (previous) await repository.deleteCustomerSession(tokenHash(previous));
  const token = randomBytes(32).toString('hex');
  await repository.saveCustomerSession({ tokenHash: tokenHash(token), customerId: customer.id, expiresAt: new Date(Date.now() + duration).toISOString() });
  res.cookie(customerCookie, token, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'strict', path: '/', maxAge: duration });
  return { customer: publicCustomer(customer), csrfToken: csrfForToken(token) };
}
export function clearCustomerCookie(res: Response) {
  res.clearCookie(customerCookie, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'strict', path: '/' });
}
// Bound concurrent memory-hard computations, including unknown-account login attempts.
let active = 0;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}
export class AuthBusy extends Error {}
export async function passwordHash(password: string, stored?: string) {
  if (active >= 2) throw new AuthBusy();
  active++;
  try {
    const salt = stored?.split(':')[1] ?? randomBytes(16).toString('hex');
    const derived = await derive(password, salt);
    return `scrypt:${salt}:${derived.toString('hex')}`;
  } finally { active--; }
}
export async function verifyPassword(password: string, stored?: string) {
  const candidate = await passwordHash(password, stored ?? `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
  return Boolean(stored) && candidate.length === stored!.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(stored!));
}
export const newCustomerId = () => randomUUID();
