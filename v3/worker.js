/*
  1-998: blocking rules
  998: one-time browsing
  999: pause blocking
  1000-: schedules
*/
/* global translate, notify, browser */

/* imports */
if (typeof importScripts !== 'undefined') {
  self.importScripts('helper.js');
  self.importScripts('blocker.js');
  self.importScripts('schedule.js');
  self.importScripts('contextmenu.js');
  self.importScripts('idle.js');
  self.importScripts('managed.js');
}

if (typeof browser === 'object' && browser.declarativeNetRequest) {
  chrome.declarativeNetRequest = browser.declarativeNetRequest;
}

/* helper; check sw-blocker and block/index.js for compatibility checks */
const convert = (h = '') => {
  if (h.startsWith('R:') === false) {
    if (h.indexOf('://') === -1 && h.indexOf('*') === -1) {
      // Firefox needs the RegExp to include the full address to provide it on "\\0"
      return `^https*:\\/\\/([^/]+\\.)*` + convert.escape(h) + '.*';
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
sha256.validate = ({password}, resolve, reject) => chrome.storage.local.get({
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
    return reject(translate('bg_msg_4').replace('##', prefs.wrong));
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

/* user action */
const userAction = async (tabId, href, frameId) => {
  // this is an internal tab, press the unblock button
  if (href.startsWith(chrome.runtime.getURL(''))) {
    return chrome.tabs.sendMessage(tabId, {
      method: 'press-exception'
    });
  }
  if (href.startsWith('http') === false) {
    return notify(translate('bg_msg_1'));
  }

  const prefs = await chrome.storage.local.get({
    'blocked': [],
    'notes': {},
    'reverse': false,
    'no-password-on-add': false,
    'sha256': '', // sha256 hash code of the user password
    'password': '' // deprecated
  });

  const next = () => {
    const reload = () => frameId !== 0 && chrome.tabs.reload(tabId);

    if (prefs.reverse) {
      prefs.blocked = prefs.blocked.filter(s => {
        const r = new RegExp(convert(s), 'i');
        const b = r.test(href);
        if (b) { // delete the note
          delete prefs.notes[s];
        }

        return b === false;
      });
      prefs.changed = Math.random(); // make sure the blocker gets reloaded even if prefs.blocked is not changed
      chrome.storage.local.set(prefs, reload);
    }
    else {
      chrome.tabs.sendMessage(tabId, {
        method: 'get-referrer'
      }, (referrer = '') => {
        chrome.runtime.lastError;
        prompt(translate('bg_msg_14'), href, false, 'convert-to-domain', {referrer});
      });
    }
  };

  if ((prefs.password || prefs.sha256) && prefs['no-password-on-add'] === false) {
    const password = await prompt(translate('bg_msg_17'));
    if (password) {
      sha256.validate({password}, next, msg => notify(msg || translate('bg_msg_2')));
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
    response(request.hosts.map(host => ({
      expression: convert(host),
      host
    })));
  }
  else if (request.method === 'check-password') {
    sha256.validate(request, () => response(true), msg => {
      response(false);
      notify(msg || translate('bg_msg_2'));
    });
    return true;
  }
  else if (request.method === 'ask-for-password') {
    prompt(translate('bg_msg_17')).then(response);
    return true;
  }
  else if (request.method === 'convert-to-sha256') {
    sha256(request.password).then(response);
    return true;
  }
  else if (request.method === 'open-once') {
    chrome.storage.local.get({
      'timeout': 60, // seconds
      'sha256': '', // sha256 hash code of the user password
      'password': '' // deprecated
    }).then(prefs => {
      const next = async () => {
        try {
          const condition = {
            'urlFilter': request.url,
            'resourceTypes': ['main_frame', 'sub_frame']
          };

          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [998],
            addRules: [{
              'id': 998,
              'priority': 5,
              'action': {
                'type': 'allow'
              },
              condition
            }]
          });
          chrome.alarms.create('release.open.once', {
            when: Date.now() + prefs.timeout * 1000
          });
          response(true);
        }
        catch (e) {
          response(false);
          notify(e.message);
        }
      };

      if (prefs.password === '' && prefs.sha256 === '') {
        response(false);
        notify(translate('bg_msg_3'));
      }
      else {
        sha256.validate(request, next, msg => {
          response(false);
          notify(msg || translate('bg_msg_2'));
        });
      }
    });

    return true;
  }
  else if (request.method === 'block') {
    if (request.redirect) {
      chrome.tabs.update(sender.tab.id, {
        url: request.redirect
      });
    }
    else {
      const args = new URLSearchParams();
      args.set('date', request.date);
      args.set('host', request.host);
      args.set('type', 'ipb'); // inline page blocker
      args.set('url', sender.tab.url);
      chrome.tabs.update(sender.tab.id, {
        url: chrome.runtime.getURL('/data/blocked/index.html') + '?' + args.toString()
      });
    }
  }
  else if (request.method === 'get-rules') {
    chrome.declarativeNetRequest.getDynamicRules().then(rules => {
      response({
        schedules: rules.filter(r => r.action?.type === 'allow'),
        once: rules.filter(r => r.id === 998).shift()
      });
    });

    return true;
  }
  else if (request.method === 'block-host') {
    // block a site straight from the popup: add it and let update() reload the
    // tab onto the blocked page immediately (no domain-confirmation prompt),
    // honoring the master password unless the user opted out
    chrome.storage.local.get({
      'blocked': [],
      'notes': {},
      'no-password-on-add': false,
      'sha256': '',
      'password': ''
    }).then(prefs => {
      const host = (request.host || '').trim();
      if (!host) {
        response(false);
        return;
      }
      const doAdd = () => {
        if (prefs.blocked.includes(host) === false) {
          prefs.blocked.push(host);
          prefs.notes[host] = {date: Date.now(), origin: 'popup', count: 0};
        }
        chrome.storage.local.set({
          blocked: prefs.blocked,
          notes: prefs.notes,
          changed: Math.random() // make sure the blocker reloads matching tabs
        }, () => response(true));
      };
      if ((prefs.password || prefs.sha256) && prefs['no-password-on-add'] === false) {
        prompt(translate('bg_msg_17')).then(password => {
          if (password) {
            sha256.validate({password}, doAdd, msg => {
              response(false);
              notify(msg || translate('bg_msg_2'));
            });
          }
          else {
            response(false);
          }
        });
      }
      else {
        doAdd();
      }
    });

    return true;
  }
  else if (request.method === 'remove-hosts') {
    // remove one or more blocked hostnames from the popup, honoring the
    // master password unless the user opted out for adding/removing rules
    chrome.storage.local.get({
      'blocked': [],
      'notes': {},
      'no-password-on-add': false,
      'sha256': '',
      'password': ''
    }).then(prefs => {
      const doRemove = () => {
        const drop = new Set(request.hosts);
        const blocked = prefs.blocked.filter(h => drop.has(h) === false);
        for (const h of request.hosts) {
          delete prefs.notes[h];
        }
        chrome.storage.local.set({
          blocked,
          notes: prefs.notes,
          changed: Math.random() // make sure the blocker reloads
        }, () => response(true));
      };
      if ((prefs.password || prefs.sha256) && prefs['no-password-on-add'] === false) {
        prompt(translate('bg_msg_17')).then(password => {
          if (password) {
            sha256.validate({password}, doRemove, msg => {
              response(false);
              notify(msg || translate('bg_msg_2'));
            });
          }
          else {
            response(false);
          }
        });
      }
      else {
        doRemove();
      }
    });

    return true;
  }
  else if (request.method === 'close-page') {
    if (sender.frameId === 0) {
      chrome.tabs.remove(sender.tab.id);
    }
  }
});

/* release open once */
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'release.open.once') {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [998]
    });
  }
});

/* toolbar popup: show the blocked-sites overview, or fall back to the
   one-click "block current site" action when the popup is disabled */
const applyPopup = () => chrome.storage.local.get({popup: true}, prefs => {
  chrome.action.setPopup({
    popup: prefs.popup ? '/data/popup/index.html' : ''
  });
});
chrome.runtime.onStartup.addListener(applyPopup);
chrome.runtime.onInstalled.addListener(applyPopup);
chrome.storage.onChanged.addListener(ps => {
  if (ps.popup) {
    applyPopup();
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
