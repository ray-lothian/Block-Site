'use strict';

const prefs = {
  'timeout': 60, // seconds
  'keywords': [],
  'blocked': [],
  'sha256': '', // sha256 hash code of the user password
  'password': '', // deprecated
  'redirect': '',
  'wrong': 1, // minutes,
  'reverse': false,
  'no-password-on-add': false,
  'map': {},
  'schedule': {
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    time: {
      start: '',
      end: ''
    }
  },
  'schedules': {},
  'initialBlock': true,
  'contextmenu-pause': true,
  'contextmenu-resume': true
};

const prompt = msg => {
  return new Promise((resolve, reject) => chrome.windows.create({
    url: 'data/prompt/index.html?message=' + encodeURIComponent(msg),
    type: 'popup',
    width: 600,
    height: 180,
    left: screen.availLeft + Math.round((screen.availWidth - 600) / 2),
    top: screen.availTop + Math.round((screen.availHeight - 180) / 2)
  }, w => {
    prompt.cache[w.id] = {resolve, reject};
  }));
};
prompt.cache = {};

const once = [];
const ids = {};

let paused = false;

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

const schedule = {
  test(d) {
    // "days" and "time" are deprecated; use "times" instead
    let {days, time, times} = prefs.schedule;
    if (times) {
      days = Object.keys(times);
    }

    // per rule schedule
    for (const rule of schedule.rules) {
      if (rule.test(d.url)) {
        const index = schedule.rules.indexOf(rule);
        const o = Object.values(prefs.schedules)[index];
        times = o.times;
        time = o.time;
        days = times ? Object.keys(times) : o.days;
        break;
      }
    }
    if (days.length) {
      const d = new Date();
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      if (days.indexOf(day) === -1) {
        return false;
      }
      const match = time => {
        if (!time.start || !time.end) {
          return false;
        }
        const [ss, se] = time.start.split(':');
        const start = Number(ss) * 60 + Number(se);
        const [es, ee] = time.end.split(':');
        const end = Number(es) * 60 + Number(ee);

        if (start < end) {
          if (now < start || now > end) {
            return false; // range mismatch, do not block
          }
        }
        else {
          if (now > end && now < start) {
            return false; // range mismatch, do not block
          }
        }
        return true;
      };
      const now = d.getHours() * 60 + d.getMinutes();
      // return true -> act like schedule is disabled
      if (times) {
        return times[day].some(match);
      }
      else {
        return match(time);
      }
    }
    // schedule is disabled -> ignore
    return true;
  },
  build() {
    schedule.rules = Object.keys(prefs.schedules).map(r => new RegExp(r, 'i'));
  }
};
schedule.rules = [];

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
  // pause blocking
  if (paused) {
    return;
  }
  // schedule
  if (schedule.test(d) === false) {
    return;
  }
  // redirect
  if (prefs.map[hostname]) {
    if (prefs.map[hostname] === 'close') {
      chrome.tabs.remove(d.tabId);
      return {
        'redirectUrl': 'JavaScript:window.close()'
      };
    }
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
  if (changeInfo.url && ['http', 'file', 'ftp'].some(s => changeInfo.url.startsWith(s))) {
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
  if (h.indexOf('://') === -1 && h.startsWith('R:') === false) {
    return `*://${h}/*`;
  }
  return h;
};

observe.regexp = rule => {
  if (rule.startsWith('R:')) {
    return new RegExp(rule.substr(2), 'i');
  }
  const escapeRegexp = str => {
    const specials = [
      // order matters for these
      '-', '[', ']',
      // order doesn't matter for any of these
      '/', '{', '}', '(', ')', '*', '+', '?', '.', '\\', '^', '$', '|'
    ];
    const regex = RegExp('[' + specials.join('\\') + ']', 'g');
    return str.replace(regex, '\\$&');
  };
  return new RegExp('^' + rule.split('*').map(escapeRegexp).join('.*') + '$', 'i');
};
observe.build = {
  direct() {
    directPattern = prefs.blocked.filter(a => a).map(observe.wildcard).map(observe.regexp);
  },
  reverse() {
    reversePattern = prefs.blocked.filter(a => a).map(observe.wildcard).map(observe.regexp);
  }
};

chrome.storage.local.get(prefs, p => {
  Object.assign(prefs, p);
  schedule.build();
  observe();
  contextmenu.build();
});
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).forEach(n => prefs[n] = ps[n].newValue);
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestDirect);
  chrome.tabs.onUpdated.removeListener(onUpdatedDirect);
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestReverse);
  chrome.tabs.onUpdated.removeListener(onUpdatedReverse);
  observe();

  if (ps.schedules) {
    schedule.build();
  }
  if (ps['contextmenu-pause']) {
    chrome.contextMenus.update('pause', {
      visible: prefs['contextmenu-pause']
    });
  }
  if (ps['contextmenu-resume']) {
    chrome.contextMenus.update('resume', {
      visible: prefs['contextmenu-resume']
    });
  }
});
//
const notify = message => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: 'Block Site',
  message: chrome.i18n.getMessage(message) || message
});

const sha256 = async message => {
  const msgBuffer = new TextEncoder('utf-8').encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
  return hashHex;
};
window.sha256 = sha256;
const retries = {
  id: null,
  count: 0
};
sha256.validate = ({password}, resolve, reject) => {
  const s = () => {
    window.clearTimeout(retries.id);
    retries.count = 0;
    resolve();
  };
  const f = () => {
    retries.count += 1;
    window.clearTimeout(retries.id);
    retries.id = window.setTimeout(() => {
      retries.count = 0;
    }, prefs.wrong * 60 * 1000);

    reject();
  };

  if (retries.count >= 5) {
    reject(chrome.i18n.getMessage('bg_msg_4').replace('##', prefs.wrong));
  }
  else if (password && password === prefs.password) {/* deprecated */
    s();
  }
  else if (prefs.sha256) {
    sha256(password).then(hash => {
      if (hash === prefs.sha256) {
        s();
      }
      else {
        f();
      }
    });
  }
  else {
    f();
  }
};

const onMessage = (request, sender, response) => {
  if (request.method === 'open-once') {
    const next = () => {
      const {url} = request;
      once.push(toHostname(url));
      chrome.tabs.update(sender.tab.id, {url});
    };

    if (prefs.password === '' && prefs.sha256 === '') {
      notify('bg_msg_3');
    }
    else {
      sha256.validate(request, next, msg => notify(msg || 'bg_msg_2'));
    }
  }
  else if (request.method === 'check-password') {
    sha256.validate(request, () => response(true), msg => {
      response(false);
      notify(msg || 'bg_msg_2');
    });
    return true;
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
  else if (request.method === 'prompt-resolved') {
    const o = prompt.cache[sender.tab.windowId];
    if (o) {
      o.resolve(request.password);
      delete prompt.cache[sender.tab.windowId];
    }
  }
  else if (request.method === 'bring-to-front') {
    chrome.windows.update(sender.tab.windowId, {
      focused: true
    });
  }
};
chrome.runtime.onMessage.addListener(onMessage);

chrome.browserAction.onClicked.addListener(tab => {
  // this is an internal tab, press the unblock button
  if (tab.url.indexOf(chrome.runtime.id) !== -1) {
    return chrome.tabs.sendMessage(tab.id, {
      method: 'press-exception'
    });
  }
  if (tab.url.startsWith('http') === false) {
    return notify('bg_msg_1');
  }

  const next = () => {
    const hostname = toHostname(tab.url);
    const msg = chrome.i18n.getMessage('bg_msg_14');

    console.log(hostname);

    chrome.tabs.executeScript(tab.id, {
      'runAt': 'document_start',
      'file': 'data/blocked/tld.js'
    }, () => chrome.tabs.executeScript(tab.id, {
      'runAt': 'document_start',
      'code': `(() => {
        window.stop();
        const hostname = ${JSON.stringify(hostname)};
        const domain =  tld.getDomain(hostname);
        const msg = ${JSON.stringify(msg)}.replace('##', domain || hostname);
        if (window.confirm(msg)) {
          if (hostname === domain) {
            return [domain];
          }
          else if (domain) {
            return [domain, '*.' + domain];
          }
          else if (hostname) {
            return [hostname];
          }
        }
      })()`
    }, r => {
      console.log(r);
      if (chrome.runtime.lastError) {
        notify(chrome.runtime.lastError.message);
      }
      if (r && r.length && r[0]) {
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
            hostnames: r[0]
          }, null, () => chrome.tabs.reload(tab.id));
        }
      }
    }));
  };

  if ((prefs.password || prefs.sha256) && prefs['no-password-on-add'] === false) {
    prompt(chrome.i18n.getMessage('bg_msg_17')).then(password => {
      if (password) {
        sha256.validate({password}, next, msg => notify(msg || 'bg_msg_2'));
      }
    });
  }
  else {
    next();
  }
});
// context menus
const contextmenu = {
  build() {
    const root = chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_5'),
      id: 'pause',
      contexts: ['browser_action'],
      visible: prefs['contextmenu-pause']
    });
    chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_7'),
      id: 'pause-10',
      contexts: ['browser_action'],
      parentId: root
    });
    chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_8'),
      id: 'pause-30',
      contexts: ['browser_action'],
      parentId: root
    });
    chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_9'),
      id: 'pause-60',
      contexts: ['browser_action'],
      parentId: root
    });
    chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_10'),
      id: 'pause-360',
      contexts: ['browser_action'],
      parentId: root
    });
    chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_11'),
      id: 'pause-1440',
      contexts: ['browser_action'],
      parentId: root
    });
    chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_6'),
      id: 'resume',
      contexts: ['browser_action'],
      visible: prefs['contextmenu-resume']
    });
  },
  click(info) {
    if (info.menuItemId === 'resume') {
      paused = false;
      chrome.alarms.clear('paused');
      notify('bg_msg_16');
    }
    else {
      const resolve = () => {
        paused = true;
        const when = Date.now() + Number(info.menuItemId.replace('pause-', '')) * 60 * 1000;
        chrome.alarms.create('paused', {
          when
        });
        notify('bg_msg_15');
      };


      if (prefs.password || prefs.sha256) {
        prompt(chrome.i18n.getMessage('bg_msg_12')).then(password => {
          if (password) {
            sha256.validate({password}, resolve, msg => notify(msg || 'bg_msg_2'));
          }
        });
      }
      else {
        resolve();
      }
    }
  }
};
chrome.contextMenus.onClicked.addListener(contextmenu.click);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'paused') {
    paused = false;
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install'
            });
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
