import {DEFAULT_SERVER, request} from './api.js';

export const CACHE_TTL = 5 * 60 * 1000;
export const defaults = {baseUrl: DEFAULT_SERVER, apiKey: '', defaultDomain: '', autoCopy: true, revision: ''};

export async function readState() {
  const {settings, cache} = await chrome.storage.local.get(['settings', 'cache']);
  const config = {...defaults, ...settings};
  return {settings: config, cache: cache?.revision === config.revision ? cache : {revision: config.revision}};
}

export async function saveSettings(settings) {
  const updated = {...settings, revision: crypto.randomUUID()};
  await chrome.storage.local.set({settings: updated, cache: {revision: updated.revision}});
  return updated;
}

let refreshQueue = Promise.resolve();
export function refreshCache() {
  const work = refreshQueue.then(async () => {
    const {settings, cache} = await readState();
    if (!settings.apiKey) return {cache, errors: []};
    const errors = [];
    await Promise.all(['me', 'domains', 'recent'].map(async (name) => {
      if (name !== 'recent' && cache[name] && Date.now() - cache[name].at < CACHE_TTL) return;
      const path = {me: '/api/v1/auth/me', domains: '/api/v1/domains', recent: '/api/v1/links?limit=5'}[name];
      try {
        cache[name] = {at: Date.now(), data: await request(settings, path)};
      } catch (error) {
        errors.push({status: error.status, message: error.message, area: name});
        // Invalid credentials must not leave old account data looking current.
        if (error.status === 401) delete cache[name];
      }
    }));
    const current = await readState();
    if (current.settings.revision === settings.revision) await chrome.storage.local.set({cache});
    return {cache, errors, revision: settings.revision};
  });
  refreshQueue = work.catch(() => {});
  return work;
}

