const API_BASE = '/api/v1';

function basePath() {
  return window.location.pathname.startsWith('/app') ? '/app' : '';
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (res.status === 401) {
    if (!window.location.pathname.endsWith('/login')) {
      window.location.href = `${basePath()}/login`;
    }
    throw new Error('Unauthorized');
  }

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const contentType = res.headers.get('content-type') || 'unknown content type';
      throw new Error(
        `API returned ${contentType} instead of JSON. Check that /api is routed to the Brev backend.`,
      );
    }
  }

  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Something went wrong');
  }

  return data;
}

export async function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email, password) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function me() {
  return request('/auth/me');
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' });
}

export async function getLinks() {
  return request('/links');
}

export async function createLink({ url, slug, title, domainId }) {
  return request('/links', {
    method: 'POST',
    body: JSON.stringify({ url, slug: slug || null, title: title || null, domain_id: domainId || null }),
  });
}

export async function deleteLink(id) {
  return request(`/links/${id}`, { method: 'DELETE' });
}

export async function getDomains() {
  return request('/domains');
}

export async function createDomain(domain) {
  return request('/domains', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

export async function verifyDomain(id) {
  return request(`/domains/${id}/verify`, { method: 'POST' });
}

export async function deleteDomain(id) {
  return request(`/domains/${id}`, { method: 'DELETE' });
}

export async function getApiKeys() {
  return request('/api-keys');
}

export async function createApiKey(name) {
  return request('/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiKey(id) {
  return request(`/api-keys/${id}`, { method: 'DELETE' });
}

export async function getBillingStatus() {
  return request('/billing/status');
}

export async function createCheckoutSession() {
  return request('/billing/checkout', { method: 'POST' });
}

export async function getAdminUsers() {
  return request('/admin/users');
}

export async function suspendAdminUser(id) {
  return request(`/admin/users/${id}/suspend`, { method: 'POST' });
}

export async function activateAdminUser(id) {
  return request(`/admin/users/${id}/activate`, { method: 'POST' });
}

export async function getAdminLinks() {
  return request('/admin/links');
}

export async function flagAdminLink(id) {
  return request(`/admin/links/${id}/flag`, { method: 'POST' });
}

export async function clearAdminLink(id) {
  return request(`/admin/links/${id}/clear`, { method: 'POST' });
}
