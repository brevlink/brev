const API_BASE = '/api/v1';

function getToken() {
  return localStorage.getItem('brev_token');
}

function setToken(token) {
  localStorage.setItem('brev_token', token);
}

function clearToken() {
  localStorage.removeItem('brev_token');
}

function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Something went wrong');
  }

  return data;
}

// Auth
export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data;
}

export async function register(email, password) {
  const data = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data;
}

export async function me() {
  return request('/auth/me');
}

// Links
export async function getLinks() {
  return request('/links');
}

export async function createLink(url, slug = null) {
  return request('/links', {
    method: 'POST',
    body: JSON.stringify({ url, slug }),
  });
}

export async function deleteLink(slug) {
  return request(`/links/${slug}`, { method: 'DELETE' });
}

export async function getLinkStats(slug) {
  return request(`/links/${slug}/stats`);
}

// Utils
export function logout() {
  clearToken();
  window.location.href = '/login';
}

export function isAuthenticated() {
  return !!getToken();
}