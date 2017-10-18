'use strict';

var prefs = {
  timeout: 60, // seconds
  blocked: [],
  password: '',
  wrong: 1, // minutes,
  map: {}
};

var once = [];
var ids = {};
var onBeforeRequest = d => {
  const hostname = (new URL(d.url)).hostname;
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
  if (prefs.map[hostname]) {
    const search = (new URL(d.url)).search;
    return {
      'redirectUrl': prefs.map[hostname] + (search || '')
    };
  }
  return {
    'redirectUrl': chrome.runtime.getURL('/data/blocked/index.html') + '?url=' + d.url
  };
};

var observe = () => prefs.blocked.length && chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, {
  'urls': prefs.blocked.map(h => `*://${h}/*`),
  'types': ['main_frame']
}, ['blocking']);

chrome.storage.local.get(prefs, p => {
  Object.assign(prefs, p);
  observe();
});
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).forEach(n => prefs[n] = ps[n].newValue);
  if (ps.blocked) {
    chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
    observe();
  }
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
      once.push((new URL(url)).hostname);
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
});

chrome.browserAction.onClicked.addListener(tab => {
  const {hostname} = new URL(tab.url);
  chrome.tabs.executeScript(tab.id, {
    code: `window.confirm('Add "${hostname}" to the block list?')`
  }, r => {
    if (chrome.runtime.lastError) {
      notify(chrome.runtime.lastError.message);
    }
    if (r && r.length) {
      const blocked = [...prefs.blocked, hostname].filter((s, i, l) => l.indexOf(s) === i);
      chrome.storage.local.set({
        blocked
      }, () => chrome.tabs.reload(tab.id));
    }
  });
});
