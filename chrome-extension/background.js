import {createLink, errorInfo, isHttpUrl} from './api.js';
import {readState, refreshCache} from './storage.js';

const menus = [
  {id: 'brev-page', title: 'Create a short link with Brev', contexts: ['page']},
  {id: 'brev-link', title: 'Shorten this link with Brev', contexts: ['link'], targetUrlPatterns: ['https', 'http'].map((scheme) => `${scheme}://*/*`)},
  {id: 'brev-selection', title: 'Shorten the selected URL with Brev', contexts: ['selection']}
];
let menuQueue = Promise.resolve();
function registerMenus() {
  menuQueue = menuQueue.catch(() => {}).then(async () => {
    await chrome.contextMenus.removeAll();
    for (const menu of menus) {
      await new Promise((resolve, reject) => chrome.contextMenus.create(menu, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      }));
    }
  });
  menuQueue.catch((error) => report(false, error.message));
}
chrome.runtime.onInstalled.addListener(registerMenus);
chrome.runtime.onStartup.addListener(registerMenus);

let colors;
async function badgeColors() {
  if (!colors) {
    const css = await (await fetch(chrome.runtime.getURL('palette.css'))).text();
    colors = Object.fromEntries(['success', 'danger'].map((name) => {
      const value = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1].trim();
      if (!value) throw new Error('Badge palette is missing.');
      return [name, value];
    }));
  }
  return colors;
}
let reportGeneration = 0;
async function report(success, title) {
  const generation = ++reportGeneration;
  await chrome.action.setTitle({title});
  await chrome.action.setBadgeText({text: success ? 'OK' : '!'});
  const palette = await badgeColors();
  await chrome.action.setBadgeBackgroundColor({color: success ? palette.success : palette.danger});
  if (success) {
    setTimeout(() => {
      if (generation === reportGeneration) chrome.action.setBadgeText({text: ''}).catch(() => {});
    }, 3000);
  }
}

let clipboardQueue = Promise.resolve();
function copyOffscreen(text) {
  const work = clipboardQueue.catch(() => {}).then(async () => {
    try {
      const url = chrome.runtime.getURL('offscreen.html');
      const contexts = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url]});
      if (!contexts.length) await chrome.offscreen.createDocument({
        url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: 'Copy the created short link to the clipboard.'
      });
      const response = await chrome.runtime.sendMessage({target: 'offscreen', type: 'copy', text});
      if (!response?.ok) throw new Error(response?.message || 'Clipboard write failed.');
    } finally {
      if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
    }
  });
  clipboardQueue = work;
  return work;
}

async function quickCreate(url) {
  let settings;
  try {
    ({settings} = await readState());
    if (!isHttpUrl(url || '')) throw new Error('Select an absolute HTTP or HTTPS URL, or open a web page.');
    // Quick actions always use the deployment default and a generated slug.
    const link = await createLink(settings, {url});
    if (!isHttpUrl(link.short_url || '')) throw new Error('The server returned an invalid short URL.');
    let title = link.short_url;
    try { await copyOffscreen(link.short_url); }
    catch { title += ' - Link created, but copy failed. Open the popup Recent list to copy it.'; }
    await report(true, title);
    refreshCache().catch((error) => report(true, `${title} - Recent refresh failed: ${error.message}`));
  } catch (error) {
    const info = errorInfo(error, settings || {baseUrl: 'configured server'});
    await report(false, info.message);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.menuItemId === 'brev-link' ? info.linkUrl
    : info.menuItemId === 'brev-selection' ? info.selectionText?.trim() : tab?.url || info.pageUrl;
  quickCreate(url).catch((error) => chrome.action.setTitle({title: error.message}));
});
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'shorten-current-page') return;
  chrome.tabs.query({active: true, currentWindow: true})
    .then(([tab]) => quickCreate(tab?.url))
    .catch((error) => report(false, error.message));
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message.type !== 'refresh-cache') return;
  refreshCache().then((result) => sendResponse({ok: true, ...result}))
    .catch((error) => sendResponse({ok: false, message: error.message}));
  return true;
});
