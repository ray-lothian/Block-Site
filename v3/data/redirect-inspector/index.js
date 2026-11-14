/* Redirect Inspector — list and tracking.
   The Block button targets the exact hostname of the hop, so blocking an
   intermediate tracker does not also block its registrable parent domain. */
'use strict';

const params = new URLSearchParams(location.search);
const tabId = Number(params.get('tabId'));

const ui = {
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  enable: document.getElementById('enable'),
  grant: document.getElementById('grant'),
  status: document.getElementById('status'),
  count: document.getElementById('count'),
  subtitle: document.getElementById('subtitle'),
  state: document.getElementById('state'),
  stateLabel: document.getElementById('state-label'),
  clear: document.getElementById('clear'),
  row: document.getElementById('row')
};

let active = false;
let tab = null;
let lastUrl = '';
let total = 0;

const hostOf = url => {
  try {
    return new URL(url).hostname;
  }
  catch (e) {
    return '';
  }
};

const displayHost = url => hostOf(url) || 'unknown';

const isHttp = url => {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }
  catch (e) {
    return false;
  }
};

const setState = (value, label) => {
  ui.state.dataset.state = value;
  ui.stateLabel.textContent = label;
};

const labelOf = kind => ({
  start: 'start',
  request: 'nav',
  redirect: '3xx',
  commit: 'commit'
}[kind] || kind);

const clock = time => {
  const d = new Date(time);
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' +
    pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
};

const updateCount = () => {
  ui.count.textContent = total + (total === 1 ? ' hop' : ' hops');
  ui.empty.hidden = total > 0;
};

const setSubtitle = () => {
  if (!tab) {
    return;
  }
  const domain = displayHost(tab.url);
  ui.subtitle.textContent = 'Tab ' + tab.id + ' · ' + domain;
  ui.subtitle.title = tab.url || '';
};

const add = (url, kind) => {
  if (!isHttp(url) || url === lastUrl) {
    return;
  }
  lastUrl = url;
  total += 1;

  const node = document.importNode(ui.row.content, true);
  node.querySelector('.time').textContent = clock(Date.now());

  const kindEl = node.querySelector('.kind');
  kindEl.textContent = labelOf(kind);
  kindEl.dataset.kind = kind;

  const domain = displayHost(url);
  node.querySelector('.domain').textContent = domain;

  const urlEl = node.querySelector('.url');
  urlEl.textContent = url;
  urlEl.title = url;

  const button = node.querySelector('.block');
  button.title = 'Add "' + domain + '" to the block list';
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', async () => {
    if (button.disabled) {
      return;
    }
    const host = hostOf(url);
    if (!host) {
      return;
    }
    button.disabled = true;
    button.textContent = '…';
    let ok = false;
    try {
      // In reverse mode the block list is a whitelist, so "block" means
      // removing the host from it.
      const {reverse = false} = await chrome.storage.local.get({reverse: false});
      ok = reverse ?
        await chrome.runtime.sendMessage({method: 'remove-hosts', hosts: [host]}) :
        await chrome.runtime.sendMessage({method: 'block-host', host});
    }
    catch (e) {
      ok = false;
    }
    if (ok) {
      button.textContent = 'Blocked';
      button.classList.add('done');
      button.title = host + ' is in the block list';
      button.setAttribute('aria-label', button.title);
    }
    else {
      button.disabled = false;
      button.textContent = 'Block';
    }
  });

  const stick = ui.list.scrollHeight - ui.list.scrollTop - ui.list.clientHeight < 48;
  ui.list.append(node);
  updateCount();
  if (stick) {
    ui.list.scrollTop = ui.list.scrollHeight;
  }
};

const hasWebRequest = () => {
  try {
    return typeof chrome.webRequest === 'object' && chrome.webRequest !== null;
  }
  catch (e) {
    return false;
  }
};

const showEnable = message => {
  setState('not-enabled', 'Not enabled');
  ui.enable.hidden = false;
  ui.status.hidden = false;
  ui.status.textContent = message ||
    'Redirect tracking is not enabled yet.';
};

const onRequest = details => {
  if (details.tabId === tabId) {
    add(details.url, 'request');
  }
};

const onRedirect = details => {
  if (details.tabId !== tabId) {
    return;
  }
  // the source may not have been reported yet
  add(details.url, 'request');
  const target = details.redirectUrl;
  if (target &&
      target.startsWith('chrome-extension://') === false &&
      target.startsWith('moz-extension://') === false) {
    add(target, 'redirect');
  }
};

const onUpdated = (id, info) => {
  if (id !== tabId) {
    return;
  }
  if (info.url) {
    tab = {...tab, url: info.url};
    setSubtitle();
    add(info.url, 'commit');
  }
};

const onRemoved = id => {
  if (id === tabId) {
    closeWindow();
  }
};

const closeWindow = () => {
  window.close();
  // fallback for browsers that keep an extension window alive
  try {
    chrome.windows.getCurrent(win => {
      if (win && win.id !== chrome.windows.WINDOW_ID_NONE) {
        const removing = chrome.windows.remove(win.id);
        if (removing && removing.catch) {
          removing.catch(() => {});
        }
      }
    });
  }
  catch (e) {}
};

// Always close with the tracked tab, even before tracking is enabled.
chrome.tabs.onRemoved.addListener(onRemoved);

const onPermissionsRemoved = permissions => {
  if (permissions && permissions.permissions &&
      permissions.permissions.includes('webRequest')) {
    stopTracking();
    showEnable('Redirect tracking was disabled because the permission was removed.');
  }
};

const startTracking = () => {
  if (active || !hasWebRequest()) {
    return false;
  }
  try {
    chrome.webRequest.onBeforeRequest.addListener(onRequest, {
      urls: ['<all_urls>'],
      types: ['main_frame'],
      tabId
    }, []);
    chrome.webRequest.onBeforeRedirect.addListener(onRedirect, {
      urls: ['<all_urls>'],
      types: ['main_frame'],
      tabId
    }, []);
  }
  catch (e) {
    try {
      chrome.webRequest.onBeforeRequest.removeListener(onRequest);
      chrome.webRequest.onBeforeRedirect.removeListener(onRedirect);
    }
    catch (ignore) {}
    showEnable('Could not start tracking: ' + e.message);
    return false;
  }

  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.permissions.onRemoved.addListener(onPermissionsRemoved);
  active = true;

  setState('recording', 'Recording');
  ui.enable.hidden = true;
  ui.status.hidden = true;
  ui.status.textContent = '';
  return true;
};

const stopTracking = () => {
  if (!active) {
    return;
  }
  active = false;
  setState('stopped', 'Stopped');
  if (hasWebRequest()) {
    try {
      chrome.webRequest.onBeforeRequest.removeListener(onRequest);
      chrome.webRequest.onBeforeRedirect.removeListener(onRedirect);
    }
    catch (e) {}
  }
  chrome.tabs.onUpdated.removeListener(onUpdated);
  chrome.permissions.onRemoved.removeListener(onPermissionsRemoved);
};

const load = async () => {
  setState('starting', 'Starting…');

  if (Number.isInteger(tabId) === false || tabId < 0) {
    ui.empty.hidden = true;
    ui.enable.hidden = true;
    ui.status.hidden = false;
    ui.status.textContent = 'Open this window from a tab’s context menu.';
    setState('stopped', 'Not running');
    return false;
  }

  try {
    tab = await chrome.tabs.get(tabId);
  }
  catch (e) {
    ui.empty.hidden = true;
    ui.enable.hidden = true;
    ui.status.hidden = false;
    ui.status.textContent = 'The tracked tab is already closed.';
    setState('stopped', 'Tab closed');
    setTimeout(closeWindow, 1200);
    return false;
  }

  document.title = 'Redirects · ' + (hostOf(tab.url) || 'tab');
  setSubtitle();
  add(tab.url || tab.pendingUrl || '', 'start');
  return true;
};

ui.grant.addEventListener('click', async () => {
  ui.grant.disabled = true;
  let granted = false;
  try {
    granted = await chrome.permissions.request({permissions: ['webRequest']});
  }
  catch (e) {}
  ui.grant.disabled = false;

  if (!granted) {
    setState('not-enabled', 'Not enabled');
    ui.status.hidden = false;
    ui.status.textContent = 'Permission was not granted.';
    return;
  }
  if (hasWebRequest()) {
    startTracking();
  }
  else {
    // the bindings can lag one instant behind the grant
    location.reload();
  }
});

ui.clear.addEventListener('click', () => {
  ui.list.textContent = '';
  lastUrl = '';
  total = 0;
  updateCount();
});

(async () => {
  if (await load() === false) {
    return;
  }

  let granted = false;
  try {
    granted = await chrome.permissions.contains({permissions: ['webRequest']});
  }
  catch (e) {}

  if (granted === false || !hasWebRequest()) {
    showEnable(granted ?
      'Reload this window to finish enabling tracking.' :
      'Redirect tracking needs permission to observe network requests for this tab.');
    return;
  }
  startTracking();
})();
