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
    // Pydantic validation details are objects; their messages keep the banner
    // readable instead of letting Error stringify them as "[object Object]".
    const detail = typeof data.detail === 'string'
      ? data.detail
      : Array.isArray(data.detail)
        ? data.detail
          .filter(item => typeof item?.msg === 'string')
          .map(item => item.msg.replace(/^Value error, /, ''))
          .join('; ')
        : '';
    const message = detail || (typeof data.message === 'string' && data.message) || 'Something went wrong';
    const error = new Error(message);
    // Keep the status: callers need to tell "this link is dead" (404) from "the
    // API is broken", because they deserve different words on screen.
    error.status = res.status;
    throw error;
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

// The token travels in the URL fragment, so it never reaches a server log.
// The GET is a read-only check (it does not consume the token); the POST does.
export async function fetchVerifyEmailLink(token) {
  return request(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export async function verifyEmail(token) {
  return request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function fetchPasswordResetLink(token) {
  return request(`/auth/password-reset/confirm?token=${encodeURIComponent(token)}`);
}

export async function requestPasswordReset(email) {
  return request('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token, newPassword) {
  return request('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function changePassword(currentPassword, newPassword) {
  return request('/auth/password/change', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// Takes no body: the session identifies the account, and the backend answers the
// same way whether the address is already confirmed or not.
export async function resendVerification() {
  return request('/auth/resend-verification', { method: 'POST' });
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

// ── Sharing a domain ────────────────────────────────────────────────────
// The invitation page is the target of an email the backend sends, so its URL
// goes in FRONTEND_DOMAIN_INVITE_URL. The token rides in the fragment.
export async function getDomainMembers(domainId) {
  return request(`/domains/${domainId}/members`);
}

export async function inviteDomainMember(domainId, email) {
  return request(`/domains/${domainId}/members`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function removeDomainMember(domainId, memberId) {
  await request(`/domains/${domainId}/members/${memberId}`, { method: 'DELETE' });
}

export async function fetchDomainInvite(token) {
  return request(`/domains/invites/accept?token=${encodeURIComponent(token)}`);
}

export async function acceptDomainInvite(token) {
  return request('/domains/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function getDomainDeletionImpact(id) {
  return request(`/domains/${id}/deletion-impact`);
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

export async function getAdminUsers(params = {}) {
  return request(`/admin/users?${new URLSearchParams(params)}`);
}

export async function setAdminCloudEntitlement(id, active) {
  return request(`/admin/users/${id}/cloud-entitlement`, {
    method: 'PUT',
    body: JSON.stringify({ active }),
  });
}

export async function suspendAdminUser(id) {
  return request(`/admin/users/${id}/suspend`, { method: 'POST' });
}

export async function activateAdminUser(id) {
  return request(`/admin/users/${id}/activate`, { method: 'POST' });
}

export async function getAdminLinks(params = {}) {
  return request(`/admin/links?${new URLSearchParams(params)}`);
}

export async function flagAdminLink(id) {
  return request(`/admin/links/${id}/flag`, { method: 'POST' });
}

export async function clearAdminLink(id) {
  return request(`/admin/links/${id}/clear`, { method: 'POST' });
}


export async function getAdminReports(params = {}) {
  return request(`/admin/reports?${new URLSearchParams(params)}`);
}

export async function reviewAdminReport(id) {
  return request(`/admin/reports/${id}/review`, { method: 'POST' });
}

export async function submitReport(body) {
  return request('/reports', { method: 'POST', credentials: 'omit', body: JSON.stringify(body) });
}
