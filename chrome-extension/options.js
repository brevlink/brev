import {normalizeBase, request} from './api.js';
import {readState, saveSettings} from './storage.js';
import {$, showError, fillDomains} from './ui.js';

let settings;
let busy = false;
const fail = (error, config = settings) => showError($('error'), error, config);

function dashboardLink() {
  try { $('dashboard').href = `${normalizeBase($('server').value)}/app/dashboard/account`; }
  catch { $('dashboard').removeAttribute('href'); }
}
function renderStored() {
  $('stored-row').hidden = !settings.apiKey;
  $('stored-key').textContent = settings.apiKey ? 'brev_' + '•'.repeat(12) : '';
  $('key').value = '';
}
function setBusy(value) {
  busy = value;
  $('save').disabled = value;
  $('remove').disabled = value;
  $('save').textContent = value ? 'Saving' : 'Save settings';
}
$('server').addEventListener('input', () => {
  dashboardLink();
  // Domain ids are account and server specific, so never carry them to a new server.
  try {
    if (normalizeBase($('server').value) !== settings.baseUrl) fillDomains($('default-domain'), {...settings, baseUrl: normalizeBase($('server').value), defaultDomain: ''}, []);
  } catch { /* The submit action explains incomplete server values. */ }
});
$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  let candidate;
  $('error').hidden = true;
  $('status').textContent = '';
  try {
    const baseUrl = normalizeBase($('server').value);
    const apiKey = $('key').value.trim() || (baseUrl === settings.baseUrl ? settings.apiKey : '');
    if (!apiKey) throw new Error('Paste an API key for this server.');
    if (!apiKey.startsWith('brev_')) throw new Error('Paste an API key beginning with brev_.');
    candidate = {baseUrl, apiKey, autoCopy: $('auto-copy').checked, defaultDomain: $('default-domain').value};
    setBusy(true);
    const origin = new URL(baseUrl).origin;
    const permission = {origins: [`${origin}/*`]};
    if (!(await chrome.permissions.contains(permission)) && !(await chrome.permissions.request(permission))) {
      throw new Error(`Cannot reach ${baseUrl}. Origin permission was not granted. Save again to grant it.`);
    }
    const me = await request(candidate, '/api/v1/auth/me');
    const oldAccount = (await readState()).cache.me?.data.id;
    if (oldAccount !== me.id) candidate.defaultDomain = '';
    settings = await saveSettings(candidate);
    $('server').value = settings.baseUrl;
    renderStored();
    $('account').textContent = `Configured account: ${me.email}`;
    $('status').textContent = 'Settings saved.';
    dashboardLink();
    // Save succeeds after key verification; domain readiness is a separate request.
    delete $('default-domain').dataset.ready;
    const response = await chrome.runtime.sendMessage({type: 'refresh-cache'});
    if (!response?.ok) throw new Error(response?.message || 'Could not load domains.');
    if (response.revision !== settings.revision) return;
    fillDomains($('default-domain'), settings, response.cache.domains?.data.items || []);
    for (const error of response.errors) fail(error);
  } catch (error) { fail(error, candidate || settings); }
  finally { setBusy(false); }
});
$('remove').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try {
    settings = await saveSettings({...settings, apiKey: '', defaultDomain: ''});
    renderStored();
    fillDomains($('default-domain'), settings, []);
    $('account').textContent = '';
    $('error').hidden = true;
    $('status').textContent = 'API key removed from this browser. Revoke it in the dashboard to disable it everywhere.';
  } catch (error) { fail(error); }
  finally { setBusy(false); }
});
async function init() {
  const state = await readState();
  settings = state.settings;
  $('server').value = settings.baseUrl;
  $('auto-copy').checked = settings.autoCopy;
  fillDomains($('default-domain'), settings, state.cache.domains?.data.items || []);
  if (state.cache.me) $('account').textContent = `Configured account: ${state.cache.me.data.email}`;
  renderStored();
  dashboardLink();
  if (settings.apiKey) {
    const response = await chrome.runtime.sendMessage({type: 'refresh-cache'});
    if (!response?.ok) throw new Error(response?.message || 'Could not load account data.');
    if (response.revision !== settings.revision) return;
    fillDomains($('default-domain'), settings, response.cache.domains?.data.items || []);
    if (response.cache.me) $('account').textContent = `Configured account: ${response.cache.me.data.email}`;
    for (const error of response.errors) fail(error);
  }
}
init().catch((error) => fail(error, settings || {baseUrl: 'configured server'}));
