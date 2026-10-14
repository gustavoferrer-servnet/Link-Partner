import { config } from '../config';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; code?: string } | null;
    throw new ApiError(body?.message || 'No fue posible consultar Link Partner', response.status, body?.code);
  }

  const body = (await response.json()) as { data: T };
  return body.data;
}

export async function apiGet<T>(path: string, token: string | null, signal?: AbortSignal, timeoutMs?: number): Promise<T> {
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
  const response = await fetch(`${config.apiUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: timeout ? signal ? AbortSignal.any([signal, timeout]) : timeout : signal,
  });

  return parseResponse<T>(response);
}

export async function apiSend<T>(path: string, token: string | null, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', data: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
    signal,
  });

  return parseResponse<T>(response);
}
