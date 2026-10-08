import { createContext, useContext, type ReactNode } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { config } from '../config';
import { demoUser } from '../data/demo';
import type { SessionUser } from '../types';

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

  if (auth.isLoading || auth.activeNavigator) {
    return <div className="auth-state">Preparando sesión segura…</div>;
  }

  if (auth.error) {
    return <div className="auth-state auth-state--error">No fue posible iniciar sesión: {auth.error.message}</div>;
  }

  if (!auth.isAuthenticated) {
    void auth.signinRedirect({ state: { returnTo: window.location.pathname } });
    return <div className="auth-state">Redirigiendo a Application Hub…</div>;
  }

  const profile = auth.user?.profile;
  const user: SessionUser = {
    authUid: profile?.sub || '',
    email: typeof profile?.email === 'string' ? profile.email : '',
    displayName: typeof profile?.name === 'string' ? profile.name : 'Usuario',
    organization: 'Servnet',
    roles: [],
  };

  return (
    <SessionContext.Provider
      value={{
        user,
        token: auth.user?.access_token || null,
        logout: () => void auth.signoutRedirect(),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  if (config.authMode === 'development') {
    return <DevelopmentSession>{children}</DevelopmentSession>;
  }

  return (
    <AuthProvider
      {...config.oidc}
      onSigninCallback={(user) => {
        const state = user?.state as { returnTo?: string } | undefined;
        window.history.replaceState({}, document.title, state?.returnTo || '/');
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
