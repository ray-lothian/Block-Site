'use strict';

const prefs = {
  timeout: 60, // seconds
  keywords: [],
  blocked: [],
  password: '',
  redirect: '',
  wrong: 1, // minutes,
  reverse: false,
  map: {},
  schedule: {
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    time: {
      start: '',
      end: ''
    }
  },
  initialBlock: true
};

const once = [];
const ids = {};

const toHostname = url => {
  const s = url.indexOf('//') + 2;
  if (s > 1) {
    let o = url.indexOf('/', s);
    if (o > 0) {
      return url.substring(s, o);
    }
    else {
      o = url.indexOf('?', s);
      return o > 0 ? url.substring(s, o) : url.substring(s);
    }
  }
  return url;
};

const onBeforeRequest = d => {
  const hostname = toHostname(d.url);
  if (once.length) {
    const index = once.indexOf(hostname);
    if (index !== -1) {
      if (!(hostname in ids)) {
        ids[hostname] = window.setTimeout(() => {
          once.splice(index, 1);
          delete ids[hostname];
        }, prefs.timeout * 1000);
      }
      return;
    }
  }
  // schedule
  const {days, time} = prefs.schedule;
  if (days.length && time.start && time.end) {
    const d = new Date();
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    if (days.indexOf(day) === -1) {
      return;
    }
    const now = d.getHours() * 60 + d.getMinutes();
    const [ss, se] = time.start.split(':');
    const start = Number(ss) * 60 + Number(se);
    const [es, ee] = time.end.split(':');

    const end = Number(es) * 60 + Number(ee);

    if (start < end) {
      if (now < start || now > end) {
        return;
      }
    }
    else {
      if (now > end && now < start) {
        return;
      }
    }
  }
  // redirect
  if (prefs.map[hostname]) {
    const search = (new URL(d.url)).search;
    return {
      'redirectUrl': prefs.map[hostname] + (search || '')
    };
  }
  // custom URL
  const redirectUrl = prefs.redirect ||
    chrome.runtime.getURL('/data/blocked/index.html') + '?url=' + encodeURIComponent(d.url);
  return {
    redirectUrl
  };
};

let directPattern = [];
const onBeforeRequestDirect = d => {
  for (const rule of directPattern) {
    if (rule.test(d.url)) {
      return onBeforeRequest(d);
    }
  }
};
const onUpdatedDirect = (tabId, changeInfo) => {
  if (changeInfo.url && changeInfo.url.startsWith('http')) {
    const rtn = onBeforeRequestDirect(changeInfo);
    if (rtn && rtn.redirectUrl) {
      chrome.tabs.update(tabId, {
        url: rtn.redirectUrl
      });
    }
  }
};
let reversePattern = [];
const onBeforeRequestReverse = d => {
  for (const rule of reversePattern) {
    if (rule.test(d.url)) {
      return;
    }
  }
  return onBeforeRequest(d);
};
const onUpdatedReverse = (tabId, changeInfo) => {
  if (changeInfo.url && changeInfo.url.startsWith('http')) {
    const rtn = onBeforeRequestReverse(changeInfo);
    if (rtn && rtn.redirectUrl) {
      chrome.tabs.update(tabId, {
        url: rtn.redirectUrl
      });
    }
  }
};

const observe = () => {
  if (prefs.blocked.length && prefs.reverse === false) {
    observe.build.direct();

    chrome.webRequest.onBeforeRequest.addListener(onBeforeRequestDirect, {
      'urls': ['*://*/*'],
      'types': ['main_frame', 'sub_frame']
    }, ['blocking']);
    chrome.tabs.onUpdated.addListener(onUpdatedDirect);
    // check already opened
    if (prefs.initialBlock) {
      chrome.tabs.query({
        url: '*://*/*'
      }, tabs => tabs.forEach(tab => onUpdatedDirect(tab.id, tab)));
    }
  }
  // reverse mode
  else if (prefs.reverse) {
    observe.build.reverse();

    chrome.webRequest.onBeforeRequest.addListener(onBeforeRequestReverse, {
      'urls': ['*://*/*'],
      'types': ['main_frame', 'sub_frame']
    }, ['blocking']);
    chrome.tabs.onUpdated.addListener(onUpdatedReverse);
    // check already opened
    if (prefs.initialBlock) {
      chrome.tabs.query({
        url: '*://*/*'
      }, tabs => tabs.forEach(tab => onUpdatedReverse(tab.id, tab)));
    }
  }
};
observe.wildcard = h => {
  if (h.indexOf('://') === -1) {
    return `*://${h}/*`;
  }
  return h;
};
observe.build = {
  direct() {
    directPattern = prefs.blocked.map(observe.wildcard).map(rule => new RegExp('^' + rule.split('*').join('.*') + '$'));
  },
  reverse() {
    reversePattern = prefs.blocked.map(observe.wildcard).map(rule => new RegExp('^' + rule.split('*').join('.*') + '$'));
  }
};

chrome.storage.local.get(prefs, p => {
  Object.assign(prefs, p);
  observe();
});
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).forEach(n => prefs[n] = ps[n].newValue);
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestDirect);
  chrome.tabs.onUpdated.removeListener(onUpdatedDirect);
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestReverse);
  chrome.tabs.onUpdated.removeListener(onUpdatedReverse);
  observe();
});
//
const notify = message => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: 'Block Site',
  message: chrome.i18n.getMessage(message) || message
});

const retries = {
  id: null,
  count: 0
};

const onMessage = (request, sender, response) => {
  const wrong = () => {
    retries.count += 1;
    window.clearTimeout(retries.id);
    retries.id = window.setTimeout(() => {
      retries.count = 0;
    }, prefs.wrong * 60 * 1000);
    notify('bg_msg_2');
  };

  if (request.method === 'open-once') {
    if (prefs.password === '') {
      notify('bg_msg_3');
    }
    else if (retries.count >= 5) {
      notify(chrome.i18n.getMessage('bg_msg_4').replace('##', prefs.wrong));
    }
    else if (request.password === prefs.password) {
      const {url} = request;
      once.push(toHostname(url));
      chrome.tabs.update(sender.tab.id, {url});
    }
    else {
      wrong();
    }
  }
  else if (request.method === 'check-password') {
    if (retries.count >= 5) {
      notify(chrome.i18n.getMessage('bg_msg_4').replace('##', prefs.wrong));
      response(false);
    }
    else if (request.password === prefs.password) {
      response(true);
    }
    else {
      wrong();
      response(false);
    }
  }
  else if (request.method === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
  else if (request.method === 'close-tab') {
    chrome.tabs.remove(sender.tab.id);
  }
  else if (request.method === 'append-to-list') {
    const blocked = [...prefs.blocked, ...request.hostnames].filter((s, i, l) => l.indexOf(s) === i);
    chrome.storage.local.set({
      blocked
    }, response);
    return true;
  }
  else if (request.method === 'remove-from-list') {
    const ids = [];
    (request.mode === 'reverse' ? reversePattern : directPattern).forEach((rule, index) => {
      if (rule.test(request.href)) {
        ids.push(index);
      }
    });
    const blocked = prefs.blocked.filter((a, i) => ids.indexOf(i) === -1);
    chrome.storage.local.set({
      blocked
    }, response);
    return true;
  }
};
chrome.runtime.onMessage.addListener(onMessage);

chrome.browserAction.onClicked.addListener(tab => {
  if (tab.url.startsWith('http') === false) {
    return notify('bg_msg_1');
  }
  const hostname = toHostname(tab.url);
  const msg = prefs.reverse ? `Remove "${hostname}" from the whitelist?` : `Add "${hostname}" to the blocked list?`;
  chrome.tabs.executeScript(tab.id, {
    'runAt': 'document_start',
    'code': `window.confirm('${msg}')`
  }, r => {
    if (chrome.runtime.lastError) {
      notify(chrome.runtime.lastError.message);
    }
    if (r && r.length && r[0] === true) {
      if (prefs.reverse) {
        onMessage({
          method: 'remove-from-list',
          href: tab.url,
          mode: 'reverse'
        }, null, () => chrome.tabs.reload(tab.id));
      }
      else {
        onMessage({
          method: 'append-to-list',
          hostnames: [hostname]
        }, null, () => chrome.tabs.reload(tab.id));
      }
    }
  });
});
// FAQs
{
  const {onInstalled, setUninstallURL, getManifest} = chrome.runtime;
  const {name, version} = getManifest();
  const page = getManifest().homepage_url;
  onInstalled.addListener(({reason, previousVersion}) => {
    chrome.storage.local.get({
      'faqs': true,
      'last-update': 0
    }, prefs => {
      if (reason === 'install' || (prefs.faqs && reason === 'update')) {
        const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
        if (doUpdate && previousVersion !== version) {
          chrome.tabs.create({
            url: page + '?version=' + version +
              (previousVersion ? '&p=' + previousVersion : '') +
              '&type=' + reason,
            active: reason === 'install'
          });
          chrome.storage.local.set({'last-update': Date.now()});
        }
      }
    });
  });
  setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
}
