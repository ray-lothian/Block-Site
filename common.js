'use strict';


const prefs = {
  timeout: 60, // seconds
  keywords: [],
  password: '',
  redirect: '',
  wrong: 1, // minutes,
  reverse: false,
  schedule: {
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    time: {
      start: '',
      end: ''
    }
  },
  rules: [],
  schedules: {},
  initialBlock: true
};

const once = [];
const ids = {};

let paused = false;

const get_id_extension = () => {
  try {
    let str = chrome.runtime.getManifest().background.scripts[0];
    let start = str.indexOf('//') + 2;
    let end = str.substr(start).indexOf('/');
    return `${str.substr(start, end)}`;
  } catch {
    return '*'
  }
}

const ID_extension = get_id_extension()

let WHITE_LIST = [
  `moz-extension://${ID_extension}/data/blocked/*`
]


/* ********************* Utils ************************* */

const createRegexp = rule => {
  if (rule.startsWith('R:')) {
    return new RegExp(rule.substr(2), 'i');
  }
  let pattern = rule
  pattern = pattern.split('*').join('.*')
  return new RegExp('^' + pattern + '$', 'i');
};

const protos = [
  "http:",
  "https:",
  "ws:",
  "wss:",
  "about:",
  "moz-extension:",
  "file:",
  "ftp:",
  "ftps:",
  "data:"
]

const isStartProto = (url) => {
  let ret = protos.findIndex(proto => {
    return url.startsWith(proto)
  })
  return ret === -1 ? false : true
}

const wildcard = h => {
  let newUrl = h
  if (newUrl.indexOf("/*") !== newUrl.length - 2 && !newUrl.startsWith("about:")) {
    newUrl = newUrl.concat('/*')
  }
  if (!isStartProto(h) && !h.startsWith('R:')) {
    return `*://${newUrl}`;
  }

  return newUrl;
};


const removeParametersFromUrl = url => {
  let index = 0;
  let newURL = url;
  index = url.indexOf('?');
  if (index == -1) {
    index = url.indexOf('#');
  }
  if (index != -1) {
    newURL = url.substring(0, index);
  }
  return newURL
}

const toHostname = url => {
  let urlNew = removeParametersFromUrl(url)
  let indexStart = 0
  if (urlNew.startsWith('http')) {
    indexStart = url.indexOf('//') + 2;
    let indexEnd = urlNew.indexOf('/', indexStart);
    if (indexEnd > 0) {
      return url.substring(indexStart, indexEnd);
    }
  }
  return url;
};

const isWhite = (url) => {
  for (const rule of WHITE_LIST) {
    if (rule.test(url)) {
      return true
    }
  }
  return false
}

const isMatch = (url) => {
  //black
  if (getFirstRuleMatch(url) !== undefined) {
    return true
  }
  return false
}

const isMatchSchedule = (schedule) => {
  if (!schedule) {
    return true // match by default
  }
  let days = schedule.days;
  let time = schedule.time;

  if (days.length && time.start && time.end) {
    const d = new Date();
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    if (days.indexOf(day) === -1) {
      return false;
    }
    const now = d.getHours() * 60 + d.getMinutes();
    const [ss, se] = time.start.split(':');
    const start = Number(ss) * 60 + Number(se);
    const [es, ee] = time.end.split(':');

    const end = Number(es) * 60 + Number(ee);

    if (start < end) {
      if (now < start || now > end) {
        return false; // range mismatch, do not block
      }
    } else {
      if (now > end && now < start) {
        return false; // range mismatch, do not block
      }
    }
    return true; // act like schedule is disabled
  }
}

const getFirstRuleMatch = (url) => {
  for (const rule of prefs.rules) {
    if (rule.reg.test(url) && isMatchSchedule(rule.schedule)) {
      return rule
    }
  }
  return false
}

const getRedirect = (d, redirect) => {
  if (redirect) {
    if (redirect === 'close') {
      try {
        chrome.tabs.remove(d.id);
        return;
      } catch (error) {
        return redirectUrl
      }
    }
    return redirect
  }

  // custom URL
  const redirectUrl = prefs.redirect ||
    chrome.runtime.getURL('/data/blocked/index.html') + '?url=' + encodeURIComponent(d.url);
  return redirectUrl
}

const getRule = (searchRule) => {
  return prefs.rules.find(rule => {
    return rule.rule === searchRule
  })
}

// Add rule in prefs + html
function addNewRule(NewRule) {
  if (getRule(NewRule) === undefined) {
    prefs.rules.push({
      rule: NewRule
    })
  }
  // TODO notify
  return undefined
}

// Remove rule in prefs 
function removeRule(removeRule) {
  prefs.rules = prefs.rules.filter(rule => rule.rule !== removeRule)
}

/* *********************************************************** */

WHITE_LIST = WHITE_LIST.map(createRegexp)

const onBeforeRequest2 = (d, rule) => {
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

  return getRedirect(d, rule.redirect)
}

const onRequest = d => {
  if (!isWhite(d.url)) {
    const rule = getFirstRuleMatch(d.url)
    if ((rule && !prefs.reverse) || (!rule && prefs.reverse)) {
      return onBeforeRequest2(d, rule)
    }
  }
  return
}

const onUpdated = (tabId, changeInfo) => {
  if (changeInfo.url) {
    const rtn = onRequest(changeInfo);
    if (rtn) {
      chrome.tabs.update(tabId, {
        url: rtn
      });
    }
  }
};

const observe = () => {
  let listen = {
    'urls': [
      "http://*",
      "https://*",
      "about://*",
      "moz-extension://*",
      "file://*",
      "ftp://*",
      "ftps://*",
      "data://*"
    ],
    'types': ['main_frame', 'sub_frame']
  }

  observe.build();

  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest2,
    listen,
    ['blocking']);
  chrome.tabs.onUpdated.addListener(onUpdated);
  // check already opened
  if (prefs.initialBlock) {
    chrome.tabs.query({
      url: '*://*/*'
    }, tabs => tabs.forEach(tab => onUpdated(tab.id, tab)));
  }
};


observe.build = () => {
  prefs.rules.forEach(rule => rule.reg = createRegexp(rule.rule))
}

chrome.storage.local.get(prefs, p => {
  Object.assign(prefs, p);
  observe();
});
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).forEach(n => prefs[n] = ps[n].newValue);
  chrome.webRequest.onBeforeRequest.removeListener(onRequest)
  chrome.tabs.onUpdated.removeListener(onUpdated);
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
    } else if (retries.count >= 5) {
      notify(chrome.i18n.getMessage('bg_msg_4').replace('##', prefs.wrong));
    } else if (request.password === prefs.password) {
      const {
        url
      } = request;
      once.push(toHostname(url));
      chrome.tabs.update(sender.tab.id, {
        url
      });
    } else {
      wrong();
    }
  } else if (request.method === 'check-password') {
    if (retries.count >= 5) {
      notify(chrome.i18n.getMessage('bg_msg_4').replace('##', prefs.wrong));
      response(false);
    } else if (request.password === prefs.password) {
      response(true);
    } else {
      wrong();
      response(false);
    }
  } else if (request.method === 'open-options') {
    chrome.runtime.openOptionsPage();
  } else if (request.method === 'close-tab') {
    chrome.tabs.remove(sender.tab.id);
  } else if (request.method === 'append-to-list') {
    addNewRule(request.rule)
    chrome.storage.local.set({
      rules: prefs.rules
    }, response);

    return true;
  } else if (request.method === 'remove-from-list') {
    //check
    /*     const ids = [];
        (pattern).forEach((rule, index) => {
          if (rule.test(request.rule)) {
            ids.push(index);
          }
        }); */

    removeRule(request.rule)
    chrome.storage.local.set({
      rules: prefs.rules
    }, response);
    return true;
  }
};
chrome.runtime.onMessage.addListener(onMessage);

chrome.browserAction.onClicked.addListener(tab => {
  if (isWhite(tab.url)) {
    return notify('bg_msg_1');
  }
  const rule = wildcard(toHostname(tab.url));
  let msg = ""

  if (prefs.reverse) {
    msg = chrome.i18n.getMessage('bg_msg_13').replace('##', rule)
  } else {
    msg = chrome.i18n.getMessage('bg_msg_14').replace('##', rule)
  }
  msg = JSON.stringify(msg);

  chrome.tabs.executeScript(tab.id, {
    'runAt': 'document_start',
    'code': `window.stop(); window.confirm(${msg})`
  }, r => {
    if (chrome.runtime.lastError) {
      notify(chrome.runtime.lastError.message);
    }
    if (r && r.length && r[0] === true) {
      onMessage({
        method: 'append-to-list',
        rule
      }, null, () => chrome.tabs.reload(tab.id));
    }
  });
});
// context menus
{
  const update = () => {
    const root = chrome.contextMenus.create({
      title: chrome.i18n.getMessage('bg_msg_5'),
      contexts: ['browser_action']
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
      contexts: ['browser_action']
    });
  };
  chrome.runtime.onInstalled.addListener(update);
  chrome.runtime.onStartup.addListener(update);
}
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'resume') {
    paused = false;
    chrome.alarms.clear('paused');
  } else {
    const next = () => {
      paused = true;
      const when = Date.now() + Number(info.menuItemId.replace('pause-', '')) * 60 * 1000;
      chrome.alarms.create('paused', {
        when
      });
    };
    if (prefs.password) {
      if (/Firefox/.test(navigator.userAgent)) {
        chrome.tabs.executeScript({
          code: `window.prompt("${chrome.i18n.getMessage('bg_msg_12')}")`
        }, arr => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            return notify(lastError.message);
          }
          if (arr[0] === prefs.password) {
            next();
          } else {
            notify('bg_msg_2');
          }
        });
      } else if (window.prompt(chrome.i18n.getMessage('bg_msg_12')) === prefs.password) {
        next();
      } else {
        notify('bg_msg_2');
      }
    } else {
      next();
    }
  }
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'paused') {
    paused = false;
  }
});

/* FAQs & Feedback */
{
  const {
    onInstalled,
    setUninstallURL,
    getManifest
  } = chrome.runtime;
  const {
    name,
    version
  } = getManifest();
  const page = getManifest().homepage_url;
  if (navigator.webdriver !== true) {
    onInstalled.addListener(({
      reason,
      previousVersion
    }) => {
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
            chrome.storage.local.set({
              'last-update': Date.now()
            });
          }
        }
      });
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}