export const DEFAULT_SERVER = 'https://brevl.ink';

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}

export function normalizeBase(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter an HTTP or HTTPS server URL without credentials, a query or a fragment.');
  }
  return url.href.replace(/\/+$/, '');
}

export function isHttpUrl(value) {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validateLink(body) {
  if (!isHttpUrl(body.url)) throw new Error('Enter an absolute HTTP or HTTPS destination URL.');
  if (body.slug && !/^[a-zA-Z0-9_-]{3,64}$/.test(body.slug)) {
    throw new Error('Custom slug must be 3 to 64 letters, numbers, underscores or hyphens.');
  }
  if (body.title && body.title.length > 256) throw new Error('Title must be at most 256 characters.');
}

export function usableDomains(items) {
  return items.filter((item) => item.is_verified === true && [null, 'active'].includes(item.cloudflare_status));
}

export function errorInfo(error, settings) {
  const status = error.status;
  const detail = error.message || 'Something went wrong. Please try again.';
  if (status === 401) return {message: `${detail}. Add or replace your API key in settings.`, action: 'settings'};
  if (status === 403) return {message: `${detail}. Verify your email in the dashboard before using links.`, action: 'dashboard'};
  if (status === 0) return {message: `Cannot reach ${settings.baseUrl}. Check the server and origin permission in settings.`, action: 'settings'};
  return {message: detail};
}

// Pure module: browser storage and messaging live in other modules.
export async function request(settings, path, {method = 'GET', body, svg = false} = {}) {
  if (!settings.apiKey) throw new ApiError(401, 'Not authenticated');
  let response;
  try {
    response = await fetch(`${settings.baseUrl}${path}`, {
      method,
      headers: {
        Accept: svg ? 'image/svg+xml' : 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
        ...(body ? {'Content-Type': 'application/json'} : {})
      },
      ...(body ? {body: JSON.stringify(body)} : {}),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new ApiError(0, `Cannot reach ${settings.baseUrl}`);
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.detail === 'string') detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail.map((item) => item.msg || String(item)).join('; ');
    } catch { /* Keep the HTTP status when the response is not JSON. */ }
    throw new ApiError(response.status, detail);
  }
  try {
    if (svg) return await response.text();
    return response.status === 204 ? {} : await response.json();
  } catch {
    throw new ApiError(0, `Cannot read the response from ${settings.baseUrl}`);
  }
}

export function createLink(settings, body) {
  validateLink(body);
  return request(settings, '/api/v1/links', {method: 'POST', body});
}
