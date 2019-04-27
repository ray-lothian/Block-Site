'use strict';

var prefs = {
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

var once = [];
var ids = {};

var toHostname = url => {
  const s = url.indexOf('//') + 2;
  if (s > 1) {
    var o = url.indexOf('/', s);
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

var onBeforeRequest = d => {
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

var directPattern = [];
var onBeforeRequestDirect = d => {
  for (const rule of directPattern) {
    if (rule.test(d.url)) {
      return onBeforeRequest(d);
    }
  }
};
var onUpdatedDirect = (tabId, changeInfo) => {
  if (changeInfo.url && changeInfo.url.startsWith('http')) {
    const rtn = onBeforeRequestDirect(changeInfo);
    if (rtn && rtn.redirectUrl) {
      chrome.tabs.update(tabId, {
        url: rtn.redirectUrl
      });
    }
  }
};
var reversePattern = [];
var onBeforeRequestReverse = d => {
  for (const rule of reversePattern) {
    if (rule.test(d.url)) {
      return;
    }
  }
  return onBeforeRequest(d);
};
var onUpdatedReverse = (tabId, changeInfo) => {
  if (changeInfo.url && changeInfo.url.startsWith('http')) {
    const rtn = onBeforeRequestReverse(changeInfo);
    if (rtn && rtn.redirectUrl) {
      chrome.tabs.update(tabId, {
        url: rtn.redirectUrl
      });
    }
  }
};

var observe = () => {
  const wildcard = h => {
    if (h.indexOf('://') === -1) {
      return `*://${h}/*`;
    }
    return h;
  };
  if (prefs.blocked.length && prefs.reverse === false) {
    directPattern = prefs.blocked.map(wildcard).map(rule => new RegExp('^' + rule.split('*').join('.*') + '$'));

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
  else if (prefs.blocked.length) {
    reversePattern = prefs.blocked.map(wildcard).map(rule => new RegExp('^' + rule.split('*').join('.*') + '$'));

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
var notify = message => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: 'Block Site',
  message
});

var retries = {
  id: null,
  count: 0
};

chrome.runtime.onMessage.addListener((request, sender, response) => {
  const wrong = () => {
    retries.count += 1;
    window.clearTimeout(retries.id);
    retries.id = window.setTimeout(() => {
      retries.count = 0;
    }, prefs.wrong * 60 * 1000);
    notify('Wrong password! Please retry!');
  };

  if (request.method === 'open-once') {
    if (prefs.password === '') {
      notify('Master password is not set! Go to the options page a set a master password');
    }
    else if (retries.count >= 5) {
      notify(`Too many wrong passwords. Please wait for ${prefs.wrong} minute(s) and retry.`);
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
      notify(`Too many wrong passwords. Please wait for ${prefs.wrong} minute(s) and retry.`);
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
});

chrome.browserAction.onClicked.addListener(tab => {
  const hostname = toHostname(tab.url);
  chrome.tabs.executeScript(tab.id, {
    'runAt': 'document_start',
    'code': `window.confirm('Add "${hostname}" to the blocked list?')`
  }, r => {
    if (chrome.runtime.lastError) {
      notify(chrome.runtime.lastError.message);
    }
    if (r && r.length && r[0] === true) {
      const blocked = [...prefs.blocked, hostname].filter((s, i, l) => l.indexOf(s) === i);
      chrome.storage.local.set({
        blocked
      }, () => chrome.tabs.reload(tab.id));
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
