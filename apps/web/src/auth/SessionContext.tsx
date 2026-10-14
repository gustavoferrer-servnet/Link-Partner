import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { config } from '../config';
import { demoUser } from '../data/demo';
import type { SessionUser } from '../types';
import { callbackReturnTo } from './navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, ApiError } from '../api/client';
import { useNavigate } from 'react-router-dom';

interface SessionValue {
  user: SessionUser;
  token: string | null;
  logout: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function DevelopmentSession({ children }: { children: ReactNode }) {
  return (
    <SessionContext.Provider value={{ user: demoUser, token: null, logout: () => undefined }}>
      {children}
    </SessionContext.Provider>
  );
}

function OidcSession({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const checkingSession = useRef(false);
  const mounted = useRef(false);
  const isSilentCallback = window.self !== window.top;
  const reauthenticate = useCallback(() => {
    if (checkingSession.current) return;
    checkingSession.current = true;
    const alreadyRetried = (auth.user?.state as { apiSessionRetry?: boolean } | undefined)?.apiSessionRetry === true;
    const returnTo = callbackReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`, window.location.origin);
    // Discard a rejected local token without signing out the Hub SSO session.
    // Retry once only; a configuration failure must not cause a redirect loop.
    void auth.removeUser().then(() => {
      if (alreadyRetried) { window.location.replace(config.hubUrl); return; }
      return auth.signinRedirect({ prompt: 'none', state: { returnTo, apiSessionRetry: true } });
    }).catch(() => window.location.replace(config.hubUrl));
  }, [auth.user?.state, auth.removeUser, auth.signinRedirect]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    // The callback iframe only notifies its parent; it must never navigate to the Hub.
    if (isSilentCallback || auth.isLoading || auth.activeNavigator) return;
    if (auth.isAuthenticated) {
      checkingSession.current = false;
      return;
    }
    const returnToHub = () => {
      if (mounted.current) window.location.replace(config.hubUrl);
    };
    if (auth.error) {
      returnToHub();
      return;
    }
    if (checkingSession.current) return;
    checkingSession.current = true;
    // Establish SSO in the top-level page. Hidden iframes can be blocked even
    // when Hub has an active session. prompt=none still returns guests to Hub.
    const returnTo = callbackReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`, window.location.origin);
    void auth.signinRedirect({ prompt: 'none', state: { returnTo } }).catch(returnToHub);
  }, [auth.isLoading, auth.activeNavigator, auth.isAuthenticated, auth.error, auth.signinRedirect, isSilentCallback]);

  if (isSilentCallback) return null;
  if (!auth.isAuthenticated || auth.isLoading || auth.activeNavigator) {
    return <div className="auth-state"><div>
      <p>{auth.error ? 'Redirigiendo a Application Hub…' : 'Verificando sesión de Application Hub…'}</p>
      <a href={config.hubUrl}>Ir a Application Hub</a>
    </div></div>;
  }

  const profile = auth.user?.profile;
  const user: SessionUser = {
    authUid: profile?.sub || '',
    email: typeof profile?.email === 'string' ? profile.email : '',
    displayName: typeof profile?.name === 'string' ? profile.name : 'Usuario',
    organization: 'Servnet',
    roles: [],
  };

  return <AuthorizedSession user={user} token={auth.user?.access_token || null} logout={() => void auth.signoutRedirect()} onUnauthorized={reauthenticate}>{children}</AuthorizedSession>;
}

function AuthorizedSession({ user, token, logout, children, onUnauthorized }: SessionValue & { children: ReactNode; onUnauthorized: () => void }) {
  const recovering = useRef(false);
  const session = useQuery({ queryKey: ['staff-session', token], queryFn: ({ signal }) => apiGet<SessionUser>('/session', token, signal, 10000), retry: false, staleTime: 5000, refetchOnWindowFocus: true, refetchInterval: 60000 });
  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401 && !recovering.current) {
      recovering.current = true;
      onUnauthorized();
    }
  }, [session.error, onUnauthorized]);
  if (session.isPending) return <div className="auth-state"><p>Verificando acceso a Link Partner…</p></div>;
  if (session.isError) return <div className="auth-state"><div><h1>No pudimos abrir Link Partner</h1><p role="alert">{session.error.message}</p><button className="button" onClick={() => { void session.refetch(); }}>Reintentar</button><p><a href={config.hubUrl}>Volver a Application Hub</a></p></div></div>;
  return <SessionContext.Provider value={{ user: session.data ?? user, token, logout }}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  if (import.meta.env.DEV && config.authMode === 'development') {
    return <DevelopmentSession>{children}</DevelopmentSession>;
  }

  return (
    <AuthProvider
      {...config.oidc}
      onSigninCallback={(user) => {
        if (!user) return;
        const state = user?.state as { returnTo?: string } | undefined;
        navigate(callbackReturnTo(state?.returnTo, window.location.origin), { replace: true });
      }}
    >
      <OidcSession>{children}</OidcSession>
    </AuthProvider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession debe usarse dentro de SessionProvider');
  return session;
}
