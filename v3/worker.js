/* global importScripts */

/*
  1-998: blocking rules
  998: one-time browsing
  999: pause blocking
  1000-: schedules
*/

/* notify */
const notify = message => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message: message
});

/* imports */
// importScripts('v2.js');
try {
  importScripts('blocker.js');
}
catch (e) {
  console.warn(e);
  notify(`Failed to local "blocker.js"

Error: ${e.message}`);
}
try {
  importScripts('schedule.js');
}
catch (e) {
  console.warn(e);
  notify(`Failed to local "schedule.js"

Error: ${e.message}`);
}
try {
  importScripts('contextmenu.js');
}
catch (e) {
  console.warn(e);
  notify(`Failed to local "contextmenu.js"

Error: ${e.message}`);
}

/* prompt */
chrome.runtime.onConnect.addListener(port => {
  port.onDisconnect.addListener(() => {
    const o = prompt.instances[port.sender.tab.windowId];
    if (o) {
      o.resolve('');
      delete prompt.instances[port.sender.tab.windowId];
    }
  });
  port.onMessage.addListener(request => {
    if (request.method === 'prompt-resolved') {
      const o = prompt.instances[port.sender.tab.windowId];
      if (o) {
        o.resolve(request.password);
        delete prompt.instances[port.sender.tab.windowId];
      }
    }
    else if (request.method === 'bring-to-front') {
      chrome.windows.update(port.sender.tab.windowId, {
        focused: true
      });
    }
  });
});
const prompt = (msg, value = '', hidden = true) => {
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent(win => {
      chrome.windows.create({
        url: 'data/prompt/index.html?message=' + encodeURIComponent(msg) +
          '&value=' + encodeURIComponent(value) + '&hidden=' + hidden,
        type: 'popup',
        width: 600,
        height: 180,
        left: win.left + Math.round((win.width - 600) / 2),
        top: win.top + Math.round((win.height - 180) / 2)
      }, w => {
        prompt.instances[w.id] = {resolve, reject};
      });
    });
  });
};
prompt.instances = {};

/* helper */
const convert = (h = '') => {
  if (h.startsWith('R:') === false) {
    if (h.indexOf('://') === -1 && h.indexOf('*') === -1) {
      return `^https*:\\/\\/([^/])*` + convert.escape(h);
    }
    else {
      return '^' + h.split('*').map(convert.escape).join('.*');
    }
  }
  if (h.startsWith('R:^')) {
    return h.substr(2);
  }
  return '^.*' + h.substr(2);
};
convert.escape = str => {
  const specials = [
    // order matters for these
    '-', '[', ']',
    // order doesn't matter for any of these
    '/', '{', '}', '(', ')', '*', '+', '?', '.', '\\', '^', '$', '|'
  ];
  const regex = RegExp('[' + specials.join('\\') + ']', 'g');
  return str.replace(regex, '\\$&');
};
const sha256 = async (message = '') => {
  const msgBuffer = new TextEncoder('utf-8').encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
  return hashHex;
};
sha256.validate = ({password}, resolve, reject) => storage({
  'sha256': '', // sha256 hash code of the user password
  'password': '', // deprecated
  'wrong': 1, // minutes,
  'retries': {
    'count': 0,
    'first': 0
  }
}).then(prefs => {
  if (prefs.retries.first < ( Date.now() - prefs.wrong * 60 * 1000)) {
    prefs.retries = {
      'count': 0,
      'first': Date.now()
    };
  }
  if (prefs.retries.count >= 5) {
    return translate('bg_msg_4').then(msg => {
      reject(msg.replace('##', prefs.wrong));
    });
  }

  const f = () => {
    if (prefs.retries.count === 0) {
      prefs.retries.first = Date.now();
    }
    prefs.retries.count += 1;

    chrome.storage.local.set({
      retries: prefs.retries
    });

    reject();
  };
  const s = () => {
    chrome.storage.local.set({
      'retries': {
        'count': 0,
        'first': 0
      }
    });
    resolve();
  };

  if (password && password === prefs.password) {/* deprecated */
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
});

/* storage */
const storage = prefs => new Promise(resolve => chrome.storage.local.get(prefs, resolve));

/* translate */
const translate = async id => {
  const lang = navigator.language.split('-')[0];
  translate.objects = translate.objects || await Promise.all([
    fetch('_locales/' + lang + '/messages.json').then(r => r.json()).catch(() => ({})),
    fetch('_locales/en/messages.json').then(r => r.json())
  ]);
  return translate.objects[0][id]?.message || translate.objects[1][id]?.message || id;
};

/* user action */
const userAction = async (tabId, href, frameId) => {
  // this is an internal tab, press the unblock button
  if (href.startsWith(chrome.runtime.getURL(''))) {
    return chrome.tabs.sendMessage(tabId, {
      method: 'press-exception'
    });
  }
  if (href.startsWith('http') === false) {
    return notify(await translate('bg_msg_1'));
  }

  const prefs = await storage({
    'blocked': [],
    'reverse': false,
    'no-password-on-add': false,
    'sha256': '', // sha256 hash code of the user password
    'password': '' // deprecated
  });

  const next = async () => {
    try {
      await chrome.scripting.executeScript({
        target: {tabId},
        files: ['data/blocked/tld.js']
      });
      const r = await chrome.scripting.executeScript({
        target: {tabId},
        func: () => {
          /* global tld */
          window.stop();
          const domain = tld.getDomain(location.hostname);
          if (domain) {
            return [domain];
          }
          return [location.hostname];
        }
      });

      const reload = () => chrome.tabs.executeScript(tabId, {
        frameId,
        code: 'location.reload()',
        runAt: 'document_start'
      });

      if (prefs.reverse) {
        prefs.blocked = prefs.blocked.filter(s => {
          const r = new RegExp(convert(s), 'i');

          return r.test(href) === false;
        });
        chrome.storage.local.set(prefs);
      }
      else {
        const msg = await translate('bg_msg_14');
        prompt(msg.replace('##', r[0].result[0]), r[0].result.join(', '), false).then(async a => {
          if (a) {
            const prefs = await storage({
              blocked: []
            });
            prefs.blocked.push(...a.split(/\s*,\s*/));
            chrome.storage.local.set(prefs);
          }
        });
      }
    }
    catch (e) {
      console.warn(e);
      notify(e.message);
    }
  };

  if ((prefs.password || prefs.sha256) && prefs['no-password-on-add'] === false) {
    const password = await prompt(await translate('bg_msg_17'));
    if (password) {
      sha256.validate({password}, next, async msg => notify(msg || await translate('bg_msg_2')));
    }
  }
  else {
    next();
  }
};
chrome.action.onClicked.addListener(tab => {
  userAction(tab.id, tab.url, 0);
});

/* messaging */
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'convert') {
    response(request.hosts.map(convert));
  }
  else if (request.method === 'check-password') {
    sha256.validate(request, () => response(true), async msg => {
      response(false);
      notify(msg || await translate('bg_msg_2'));
    });
    return true;
  }
  else if (request.method === 'ask-for-password') {
    translate('bg_msg_17').then(msg => prompt(msg)).then(response);
    return true;
  }
  else if (request.method === 'convert-to-sha256') {
    sha256(request.password).then(response);
    return true;
  }
  else if (request.method === 'open-once') {
    storage({
      'timeout': 60, // seconds
      'sha256': '', // sha256 hash code of the user password
      'password': '' // deprecated
    }).then(async prefs => {
      const next = async () => {
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [998],
            addRules: [{
              'id': 998,
              'priority': 3,
              'action': {
                'type': 'allow'
              },
              'condition': {
                'urlFilter': request.url,
                'resourceTypes': ['main_frame', 'sub_frame']
              }
            }]
          });
          chrome.alarms.create('release.open.once', {
            when: Date.now() + prefs.timeout * 1000
          });
          response(true);
        }
        catch (e) {
          notify(e.message);
        }
      };

      if (prefs.password === '' && prefs.sha256 === '') {
        notify(await translate('bg_msg_3'));
      }
      else {
        sha256.validate(request, next, async msg => notify(msg || await translate('bg_msg_2')));
      }
    });

    return true;
  }
});

/* update prefs from the managed storage */
{
  const once = () => chrome.storage.managed.get({
    json: ''
  }, async rps => {
    if (!chrome.runtime.lastError && rps.json) {
      try {
        rps = JSON.parse(rps.json);
        const prefs = await storage(null);

        if (prefs.guid !== rps.guid || rps['managed.storage.overwrite.on.start'] === true) {
          Object.assign(prefs, rps);
          chrome.storage.local.set(prefs);
          console.warn('Your preferences are configured by the admin');
        }
      }
      catch (e) {
        console.warn('cannot parse the managed JSON string');
      }
    }
  });
  chrome.runtime.onStartup.addListener(once);
  chrome.runtime.onInstalled.addListener(once);
}

/* release open once */
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'release.open.once') {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [998]
    });
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
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
