/* global getRelativeTime */
'use strict';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  e[e.dataset.i18nValue || 'textContent'] = chrome.i18n.getMessage(e.dataset.i18n);
});

const send = o => new Promise(resolve => chrome.runtime.sendMessage(o, resolve));

let currentTab = null;
let currentMatches = []; // blocked rules whose pattern matches the current URL

// when the current tab is our own blocked page, act on the site it stands for
const BLOCKED_BASE = chrome.runtime.getURL('/data/blocked/');
const effective = () => {
  const u = (currentTab && currentTab.url) || '';
  if (u.startsWith(BLOCKED_BASE)) {
    const orig = u.split('&url=')[1]; // the blocked page carries the raw address
    if (orig) {
      return {url: orig, onBlockedPage: true};
    }
  }
  return {url: u, onBlockedPage: false};
};

// which blocked rules apply to a url
const computeMatches = async (blocked, url) => {
  if (!url || /^https?:/.test(url) === false || blocked.length === 0) {
    return [];
  }
  const rules = await send({method: 'convert', hosts: blocked});
  return blocked.filter((h, i) => {
    try {
      return new RegExp(rules[i].expression, 'i').test(url);
    }
    catch (e) {
      return false;
    }
  });
};

// a blocking rule for a url's path (on the homepage the path is "/" -> whole site)
const ruleForUrl = url => {
  try {
    const u = new URL(url);
    return '*://' + u.hostname + u.pathname + '*';
  }
  catch (e) {
    return '';
  }
};

// block the current URL straight away; the tab is reloaded onto the blocked page
const blockCurrent = () => {
  const host = ruleForUrl(effective().url);
  if (!host) {
    return;
  }
  chrome.runtime.sendMessage({method: 'block-host', host, tabId: currentTab.id}, () => window.close());
};

// permanently unblock the current URL (remove its rule[s])
const unblockCurrent = async () => {
  if (currentMatches.length === 0) {
    return;
  }
  const {onBlockedPage} = effective();
  const ok = await send({method: 'remove-hosts', hosts: currentMatches});
  if (!ok) {
    return;
  }
  if (onBlockedPage) {
    // the worker's update() sends the blocked page back to the now-allowed site
    window.close();
  }
  else {
    render(); // flip the button back to "Block this URL"
  }
};

const removeHosts = async hosts => {
  const ok = await send({method: 'remove-hosts', hosts});
  if (ok) {
    render();
  }
};

const updateToggle = prefs => {
  const btn = document.getElementById('toggle');
  const {url} = effective();
  const usable = /^https?:/.test(url || '');
  let host = null;
  try {
    host = usable ? new URL(url).hostname : null;
  }
  catch (e) {}

  document.getElementById('host').textContent = host || chrome.i18n.getMessage('popup_no_site');
  btn.disabled = !usable;
  btn.title = '';
  btn.classList.remove('block');
  if (!usable) {
    btn.value = chrome.i18n.getMessage('popup_block');
    return;
  }
  if (prefs.reverse) {
    if (currentMatches.length) {
      // explicitly allowed in reverse mode; the action removes that allow entry
      btn.value = chrome.i18n.getMessage('popup_block');
      btn.onclick = blockCurrent;
      btn.classList.add('block');
    }
    else {
      // blocked-by-default in reverse mode: adding an allow rule happens on the
      // blocked page ("Add to Whitelist"); don't offer a no-op button
      btn.value = chrome.i18n.getMessage('popup_toggle');
      btn.onclick = null;
      btn.disabled = true;
      btn.title = chrome.i18n.getMessage('popup_reverse_hint');
    }
  }
  else if (currentMatches.length) {
    btn.value = chrome.i18n.getMessage('popup_unblock');
    btn.onclick = unblockCurrent;
  }
  else {
    btn.value = chrome.i18n.getMessage('popup_block');
    btn.onclick = blockCurrent;
    btn.classList.add('block');
  }
};

const render = async () => {
  const prefs = await chrome.storage.local.get({blocked: [], notes: {}, reverse: false});
  // recompute on every render so the toggle flips right after a block/unblock
  currentMatches = await computeMatches(prefs.blocked, effective().url);
  updateToggle(prefs);

  const filter = document.getElementById('filter').value.trim().toLowerCase();
  const hosts = prefs.blocked
    .filter(h => h)
    .filter(h => !filter || h.toLowerCase().includes(filter) ||
      (prefs.notes[h]?.note || '').toLowerCase().includes(filter))
    .sort((a, b) => (prefs.notes[b]?.date || 0) - (prefs.notes[a]?.date || 0));

  const list = document.getElementById('list');
  list.textContent = '';
  const tmpl = document.getElementById('row');
  for (const h of hosts) {
    const node = document.importNode(tmpl.content, true);
    node.querySelector('.host').textContent = h;

    const note = prefs.notes[h]?.note;
    const noteEl = node.querySelector('.note');
    if (note) {
      noteEl.textContent = note;
      noteEl.title = note;
    }
    else {
      noteEl.remove();
    }

    const parts = [];
    const count = prefs.notes[h]?.count;
    if (count) {
      parts.push(chrome.i18n.getMessage('popup_blocked_count').replace('##', count));
    }
    const date = prefs.notes[h]?.date;
    if (date) {
      parts.push(getRelativeTime(new Date(date)));
    }
    node.querySelector('.meta').textContent = parts.join(' - ');

    node.querySelector('.remove').addEventListener('click', () => removeHosts([h]));
    list.appendChild(node);
  }
  document.getElementById('empty').hidden = hosts.length > 0;
};

document.getElementById('filter').addEventListener('input', render);
document.getElementById('options').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});

// keep the list fresh if rules change while the popup is open
chrome.storage.onChanged.addListener(ps => {
  if (ps.blocked || ps.notes) {
    render();
  }
});

// is this site unblocked by a session rule
const warning = async () => {
  if (!currentTab || !currentTab.url) {
    return;
  }

  const rules = await chrome.declarativeNetRequest.getSessionRules();
  for (const rule of rules) {
    try {
      if (new RegExp(rule.condition.regexFilter, 'i').test(currentTab.url)) {
        document.getElementById('warning').textContent = chrome.i18n.getMessage('bg_msg_31');
        return;
      }
    }
    catch (e) {}
  }
};

chrome.tabs.query({active: true, currentWindow: true}, tabs => {
  currentTab = tabs && tabs[0];
  render();
  warning();
});

