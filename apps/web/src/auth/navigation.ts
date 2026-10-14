// OIDC state may restore a local route, never an external URL or another callback.
export function callbackReturnTo(returnTo: unknown, origin: string): string {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/')) return '/';
  try {
    const url = new URL(returnTo, origin);
    if (url.origin !== origin || decodeURIComponent(url.pathname) === '/callback') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}
