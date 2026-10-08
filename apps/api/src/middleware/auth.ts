import type { NextFunction, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { seedUser } from '../data/seed.js';
import { repository } from '../repositories/index.js';
import type { AppRole, AuthenticatedRequest, Identity } from '../types.js';

const jwks = createRemoteJWKSet(new URL(`${config.keycloakAuthority}/protocol/openid-connect/certs`));

function bearerToken(header?: string) {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (config.authMode === 'development') {
      if (config.nodeEnv === 'production') throw new Error('AUTH_MODE=development no está permitido en producción');
      req.identity = seedUser;
      next();
      return;
    }

    const token = bearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ status: 'error', message: 'Se requiere una sesión válida.' });
      return;
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.keycloakAuthority,
    });

    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    const authorizedParty = typeof payload.azp === 'string' ? payload.azp : '';

    if (!audiences.includes(config.keycloakClientId) && authorizedParty !== config.keycloakClientId) {
      res.status(401).json({ status: 'error', message: 'La sesión no pertenece a Link Partner.' });
      return;
    }

    const identity: Identity = {
      authUid: payload.sub || '',
      email: typeof payload.email === 'string' ? payload.email : '',
      displayName: typeof payload.name === 'string' ? payload.name : String(payload.preferred_username || 'Usuario'),
    };

    if (!identity.authUid) {
      res.status(401).json({ status: 'error', message: 'La sesión no contiene una identidad válida.' });
      return;
    }

    req.identity = identity;
    next();
  } catch {
    res.status(401).json({ status: 'error', message: 'La sesión expiró o no es válida.' });
  }
}

export async function loadAppUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.identity) {
      res.status(401).json({ status: 'error', message: 'Se requiere una sesión válida.' });
      return;
    }

    let user = await repository.getUserByAuthUid(req.identity.authUid);

    if (!user && config.authMode === 'development') user = seedUser;

    if (!user && config.bootstrapAdminEmails.has(req.identity.email.toLowerCase())) {
      user = {
        ...req.identity,
        participantId: null,
        organization: 'Servnet',
        roles: ['internal_admin'],
        enabled: true,
      };
    }

    if (!user || !user.enabled) {
      res.status(403).json({ status: 'error', message: 'Tu cuenta no está habilitada en Link Partner.' });
      return;
    }

    req.appUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: AppRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.appUser || !req.appUser.roles.some((role) => roles.includes(role))) {
      res.status(403).json({ status: 'error', message: 'No tienes permiso para realizar esta acción.' });
      return;
    }
    next();
  };
}
