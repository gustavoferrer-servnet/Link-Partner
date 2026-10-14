import { z } from 'zod';
import { config } from '../config.js';
import { seedUser } from '../data/seed.js';
import { HubAccessError } from './hubAccess.js';
import type { Identity } from '../types.js';

const schema = z.object({ status: z.literal('success'), data: z.object({
  application: z.object({ slug: z.string() }), deployment: z.object({ _id: z.string() }), tenant: z.object({ slug: z.string() }),
  users: z.array(z.object({ authUid: z.string().min(1), email: z.string().email(), displayName: z.string().trim().min(1) })),
}) });
export type SupplierManagerUser = Identity & { source: 'application-hub' | 'development' };
export async function supplierManagerUsers(authorization?: string): Promise<SupplierManagerUser[]> {
  if (config.authMode === 'development' && config.nodeEnv !== 'production') return [{ authUid: seedUser.authUid, email: seedUser.email, displayName: seedUser.displayName, source: 'development' }];
  if (!config.hubApiUrl || !config.hubDeploymentId || !config.hubInternalTenantSlug || !authorization) throw new HubAccessError(503, 'Configura la conexión con Application Hub para seleccionar al gestor responsable.');
  try {
    const url = new URL(`${config.hubApiUrl}/applications/${config.hubApplicationSlug}/users`);
    url.searchParams.set('deploymentId', config.hubDeploymentId); url.searchParams.set('tenantSlug', config.hubInternalTenantSlug);
    const response = await fetch(url, { headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(5000) });
    if ([401, 403].includes(response.status)) throw new HubAccessError(403, 'Application Hub no permite consultar los usuarios asignados a esta instancia.');
    if (!response.ok) throw new HubAccessError(503, 'No se pudo consultar el directorio de usuarios de Application Hub.');
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new HubAccessError(503, 'Application Hub devolvió un directorio de usuarios inválido.');
    const data = parsed.data.data;
    if (data.application.slug !== config.hubApplicationSlug || data.deployment._id !== config.hubDeploymentId || data.tenant.slug !== config.hubInternalTenantSlug || new Set(data.users.map(u => u.authUid)).size !== data.users.length) throw new HubAccessError(503, 'El directorio no corresponde a la organización e instancia de Link Partner.');
    return data.users.map(user => ({ ...user, source: 'application-hub' }));
  } catch (error) { if (error instanceof HubAccessError) throw error; throw new HubAccessError(503, 'Application Hub no está disponible. La asignación del gestor no se guardó.'); }
}
