import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import type { Identity } from '../types.js';

export class HubAccessError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const schema = z.object({ status: z.literal('success'), data: z.object({
  application: z.object({ slug: z.string() }), deployment: z.object({ _id: z.string() }),
  tenant: z.object({ slug: z.string(), name: z.string().min(1) }), email: z.string(),
}) });
const cache = new Map<string, { expires: number; result: Promise<string> }>();

// Hub remains the source of authorization. Deduplicate map downloads without retaining bearer tokens.
export async function hubOrganization(identity: Identity, authorization: string): Promise<string> {
  const key = createHash('sha256').update(authorization).digest('hex');
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.result;
  const result = check(identity, authorization);
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 5000, result });
  try { return await result; } catch (error) { cache.delete(key); throw error; }
}

async function check(identity: Identity, authorization: string): Promise<string> {
  try {
    const url = `${config.hubApiUrl}/applications/${config.hubApplicationSlug}/access?deploymentId=${config.hubDeploymentId}`;
    const response = await fetch(url, { headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(5000) });
    if ([401,403,404].includes(response.status)) throw new HubAccessError(403, 'Tu acceso a Link Partner no está activo en Application Hub.');
    if (!response.ok) throw new HubAccessError(503, 'No pudimos verificar tu acceso con Application Hub. Intenta nuevamente.');
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new HubAccessError(503, 'Application Hub no devolvió una validación de acceso válida.');
    const access = parsed.data.data;
    if (access.application.slug !== config.hubApplicationSlug || access.deployment._id !== config.hubDeploymentId || access.email.toLowerCase() !== identity.email.toLowerCase()) throw new HubAccessError(403, 'La autorización no corresponde a esta sesión o instancia de Link Partner.');
    if (access.tenant.slug !== config.hubInternalTenantSlug) throw new HubAccessError(403, 'Tu organización no tiene un perfil interno configurado en Link Partner.');
    return access.tenant.name;
  } catch (error) {
    if (error instanceof HubAccessError) throw error;
    throw new HubAccessError(503, 'No pudimos conectar con Application Hub para verificar tu acceso. Intenta nuevamente.');
  }
}
