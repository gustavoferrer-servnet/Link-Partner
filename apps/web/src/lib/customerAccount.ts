import { useEffect, useState } from 'react';
import { config } from '../config';
export interface Customer { id: string; fullName: string; email: string; company: string }
export interface CustomerSession { customer: Customer; csrfToken: string }
export interface CustomerConsultation {
  services?: { product: 'Internet dedicado' | 'L2L'; capacityMbps: number; locationIndexes: number[]; coverage: CustomerConsultation['coverage'] }[];
  locations?: { input: CustomerConsultation['input']; coverage: CustomerConsultation['coverage'] }[];
  proposalOptions?: { carrierRedundancyAvailable: boolean; carrierRedundancyRequested: boolean; routeCount: number; updatedAt: string | null; redundancyLocations?: string[] };
  code: string; opportunityId: string; createdAt: string; channel: 'ENTERPRISE' | 'WHOLESALE'; qualificationStatus: string;
  input: { address: string; city: string; product: string; capacityMbps: number; latitude?: number; longitude?: number; customerReference?: string; fullName?: string; email?: string; company?: string; firstName?: string; lastName?: string };
  coverage: { routeCount: number; checkedAt?: string; technologies?: { technology: 'MW' | 'FO'; status: string; nearestPopDistanceMeters: number | null }[]; status: string; reason: string };
  pricing: { status: string; reason: string };
  tracking: { stage: string; state: string; commitmentDate: string | null; nextAction: string; installationStarted?: boolean };
}
export class CustomerRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function customerRequest<T>(path: string, init: RequestInit = {}, csrfToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json'); headers.set('X-CX-Request', '1');
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }
  const response = await fetch(`${config.apiUrl}${path}`, { ...init, credentials: 'same-origin', headers, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/customers/login') window.dispatchEvent(new Event('cx-session-expired'));
    throw new CustomerRequestError(body.message || 'No pudimos completar la solicitud. Intenta nuevamente.', response.status);
  }
  return body.data;
}
export function useCustomerAccount() {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  useEffect(() => {
    const expired = () => setSession(null);
    window.addEventListener('cx-session-expired', expired);
    return () => window.removeEventListener('cx-session-expired', expired);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    customerRequest<CustomerSession | null>('/customers/me', { signal: controller.signal })
      .then(setSession).catch(error => { if (!controller.signal.aborted) setSessionError(error instanceof Error ? error.message : 'No pudimos cargar tu sesión.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function authenticate(mode: 'login' | 'register', data: Record<string, string>) {
    const next = await customerRequest<CustomerSession>(`/customers/${mode}`, { method: 'POST', body: JSON.stringify(data) });
    setSession(next); setSessionError(''); return next;
  }
  async function logout() {
    try { await customerRequest('/customers/logout', { method: 'POST', body: '{}' }, session?.csrfToken); }
    catch (error) { if (!(error instanceof CustomerRequestError) || error.status !== 401) throw error; }
    setSession(null);
  }
  return { session, loading, sessionError, authenticate, logout };
}
