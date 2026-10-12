import {createLink, isHttpUrl, request} from './api.js';
import {readState} from './storage.js';
import {$, showError, fillDomains, safeShortUrl, copyText} from './ui.js';

let settings;
let result;
let busy = false;
let recentGeneration = 0;
let domains = [];
const fail = (error) => showError($('error'), error, settings);

for (const id of ['settings', 'setup-settings']) {
  $(id).addEventListener('click', () => chrome.runtime.openOptionsPage().catch(fail));
}

function renderCache(cache) {
  if (cache.me) $('account').textContent = cache.me.data.email;
  if (cache.domains) {
    domains = fillDomains($('domain'), settings, cache.domains.data.items);
    $('domain-field').hidden = domains.length === 0;
  }
  if (cache.recent) renderRecent(cache.recent.data.items);
}

function renderRecent(items) {
  $('recent').replaceChildren();
  $('recent-note').textContent = items.length ? '' : 'No links yet.';
  for (const item of items) {
    const url = safeShortUrl(item.short_url);
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.textContent = url;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.setAttribute('aria-label', `Copy ${url}`);
    copy.addEventListener('click', () => copyText(url, $('status')).catch(fail));
    row.append(link, copy);
    $('recent').append(row);
  }
}

async function refresh() {
  const generation = recentGeneration;
  const response = await chrome.runtime.sendMessage({type: 'refresh-cache'});
  if (!response?.ok) throw new Error(response?.message || 'Could not refresh account data.');
  if (response.revision !== settings.revision) return;
  // A refresh started before creation must not overwrite the newly fetched list.
  renderCache({...response.cache, ...(generation !== recentGeneration ? {recent: undefined} : {})});
  for (const error of response.errors) {
    fail(error);
    if (error.area === 'recent') $('recent-note').textContent = 'Could not refresh recent links.';
  }
}

$('url').addEventListener('input', () => { $('create').disabled = busy || !isHttpUrl($('url').value.trim()); });
$('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  $('create').disabled = true;
  $('create').textContent = 'Creating';
  $('error').hidden = true;
  $('status').textContent = '';
  try {
    const body = {url: $('url').value.trim()};
    if ($('slug').value) body.slug = $('slug').value;
    if ($('title').value) body.title = $('title').value;
    if ($('domain').value) {
      if (!domains.some((domain) => domain.id === $('domain').value)) throw new Error('Domain no longer available. Choose another domain.');
      body.domain_id = $('domain').value;
    }
    const created = await createLink(settings, body);
    result = {...created, short_url: safeShortUrl(created.short_url)};
    recentGeneration += 1;
    $('short-url').href = result.short_url;
    $('short-url').textContent = result.short_url;
    $('open').href = result.short_url;
    $('result').hidden = false;
    $('result-heading').focus();
    $('qr').hidden = true;
    $('qr').removeAttribute('src');
    $('qr-toggle').hidden = false;
    $('qr-toggle').setAttribute('aria-expanded', 'false');
    if (settings.autoCopy) {
      try { await copyText(result.short_url, $('status')); }
      catch { fail(new Error('Link created. Could not copy the link. Select the short URL and copy it manually.')); }
    }
    // The worker persists the recent list even when this popup closes.
    await refresh();
  } catch (error) { fail(error); }
  finally {
    busy = false;
    $('create').disabled = !isHttpUrl($('url').value.trim());
    $('create').textContent = 'Create link';
  }
});

$('copy').addEventListener('click', () => copyText(result.short_url, $('status')).catch(fail));
$('qr').addEventListener('error', () => {
  $('qr').hidden = true;
  $('qr-toggle').hidden = true;
  fail(new Error('Could not display the QR code. The short link is still available.'));
});
$('qr-toggle').addEventListener('click', async () => {
  const current = result;
  $('qr-toggle').disabled = true;
  try {
    if (!$('qr').hasAttribute('src')) {
      const host = new URL(current.short_url).host;
      const svg = await request(settings, `/api/v1/links/${encodeURIComponent(current.slug)}/qr.svg?host=${encodeURIComponent(host)}&scale=8`, {svg: true});
      if (result !== current) return;
      $('qr').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    $('qr').hidden = !$('qr').hidden;
    $('qr-toggle').setAttribute('aria-expanded', String(!$('qr').hidden));
  } catch (error) {
    if (result === current) {
      $('qr-toggle').hidden = true;
      fail(error);
    }
  } finally { $('qr-toggle').disabled = false; }
});

async function init() {
  const state = await readState();
  settings = state.settings;
  if (!settings.apiKey) {
    $('setup').hidden = false;
    return;
  }
  $('create-form').hidden = false;
  $('recent-section').hidden = false;
  fillDomains($('domain'), settings, []);
  renderCache(state.cache);
  // Neither tab inspection nor account refresh delays rendering the form.
  chrome.tabs.query({active: true, currentWindow: true}).then(([tab]) => {
    if (isHttpUrl(tab?.url || '')) {
      $('url').value = tab.url;
      $('title').value = (tab.title || '').slice(0, 256);
      $('create').disabled = false;
    } else { $('page-note').hidden = false; }
  }).catch(fail);
  refresh().catch(fail);
}
init().catch((error) => {
  settings ||= {baseUrl: 'configured server'};
  fail(error);
});
