import {errorInfo, isHttpUrl, usableDomains} from './api.js';

export const $ = (id) => document.getElementById(id);

export function showError(element, error, settings) {
  const info = errorInfo(error, settings);
  element.replaceChildren(document.createTextNode(info.message));
  if (info.action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = info.action === 'settings' ? 'Open settings' : 'Open dashboard';
    button.addEventListener('click', () => {
      const work = info.action === 'settings' ? chrome.runtime.openOptionsPage() : chrome.tabs.create({url: `${settings.baseUrl}/app/dashboard`});
      work.catch((failure) => { element.textContent = failure.message; });
    });
    element.append(' ', button);
  }
  element.hidden = false;
}

export function fillDomains(select, settings, items) {
  const selected = select.dataset.ready ? select.value : settings.defaultDomain;
  select.replaceChildren(new Option(`${new URL(settings.baseUrl).hostname} (default)`, ''));
  const domains = usableDomains(items);
  for (const domain of domains) select.add(new Option(domain.domain, domain.id));
  select.value = domains.some((domain) => domain.id === selected) ? selected : '';
  if (items.length) select.dataset.ready = 'true';
  return domains;
}

export function safeShortUrl(value) {
  if (!isHttpUrl(value)) throw new Error('The server returned an invalid short URL.');
  return value;
}

export async function copyText(text, message) {
  await navigator.clipboard.writeText(text);
  message.textContent = 'Link copied.';
}
