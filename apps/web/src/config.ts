const env = import.meta.env;
const isDevelopment = env.DEV;
const publicProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const publicHost = window.location.hostname;
const defaultHubUrl = isDevelopment
  ? 'http://localhost:5173/catalog/link-partner'
  : `${publicProtocol}//${publicHost}:4443`;
const defaultOidcAuthority = isDevelopment
  ? 'http://localhost:8080/realms/application-hub'
  : `${publicProtocol}//${publicHost}:8443/realms/application-hub`;

export const config = {
  apiUrl: env.VITE_API_URL || '/api/v1',
  authMode: env.VITE_AUTH_MODE || (isDevelopment ? 'development' : 'oidc'),
  dataMode: env.VITE_DATA_MODE || (isDevelopment ? 'demo' : 'api'),
  hubUrl: env.VITE_HUB_URL || defaultHubUrl,
  oidc: {
    authority: env.VITE_OIDC_AUTHORITY || defaultOidcAuthority,
    client_id: env.VITE_OIDC_CLIENT_ID || 'link-partner-frontend',
    redirect_uri: `${window.location.origin}/callback`,
    post_logout_redirect_uri: window.location.origin,
    response_type: 'code',
    scope: 'openid profile email',
  },
} as const;
