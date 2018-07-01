'use strict';

var prefs = {
  timeout: 60, // seconds
  blocked: [],
  password: '',
  wrong: 1, // minutes,
  map: {},
  schedule: {
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    time: {
      start: '',
      end: ''
    }
  }
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
  // schedule
  const {days, time} = prefs.schedule;
  if (days.length && time.start && time.end) {
    const d = new Date();
    if (days.indexOf(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] !== -1)) {
      const now = d.getHours() * 60 + d.getMinutes();
      const [ss, se] = time.start.split(':');
      const start = Number(ss) * 60 + Number(se);
      const [es, ee] = time.end.split(':');

      let end = Number(es) * 60 + Number(ee);

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
  }
  // redirect
  if (prefs.map[hostname]) {
    const search = (new URL(d.url)).search;
    return {
      'redirectUrl': prefs.map[hostname] + (search || '')
    };
  }
  return {
    'redirectUrl': chrome.runtime.getURL('/data/blocked/index.html') + '?url=' + encodeURIComponent(d.url)
  };
};

var observe = () => {
  if (prefs.blocked.length) {
    chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, {
      'urls': prefs.blocked.map(h => `*://${h}/*`),
      'types': ['main_frame']
    }, ['blocking']);
  }
};

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
  else if (request.method === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.browserAction.onClicked.addListener(tab => {
  const {hostname} = new URL(tab.url);
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

// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': true,
  'last-update': 0
}, prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '?version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        });
      }
    });
  }
});

{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '?rd=feedback&name=' + name + '&version=' + version
  );
}
