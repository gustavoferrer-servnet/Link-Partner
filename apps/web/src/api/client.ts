import { config } from '../config';

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || 'No fue posible consultar Link Partner');
  }

  const body = (await response.json()) as { data: T };
  return body.data;
}

export async function apiGet<T>(path: string, token: string | null, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });

  return parseResponse<T>(response);
}

export async function apiSend<T>(path: string, token: string | null, method: 'POST' | 'PUT', data: unknown): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  return parseResponse<T>(response);
}
