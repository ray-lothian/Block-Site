/*
  dynamic rules:
    1-997: blocking rules
    998: (legacy) one-time browsing — superseded by the session ruleset below
    999: pause blocking
    1000-: schedules
  session rules (own id space, dropped automatically on browser restart):
    1-: temporary "open once" unlocks
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

  // the page is already covered by a blocking rule and only reachable because
  // a temporary (session-rule) unlock allows it: adding another rule would
  // change nothing, so warn and offer to remove the unlock instead
  if (prefs.reverse === false && prefs.blocked.some(s => {
    try {
      return new RegExp(convert(s), 'i').test(href);
    }
    catch (e) {
      return false;
    }
  })) {
    const unlocks = unlockMatches(await sessionUnlocks(), href);
    if (unlocks.length) {
      const ok = await prompt(translate('bg_msg_31'), 'ok', false, 'confirm');
      if (ok) {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: unlocks.map(r => r.id)
        });
        refreshUnlockIcons();
        chrome.tabs.reload(tabId);
      }
      return;
    }
  }

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

/* temporary "open once" unlocks

   These live in the DNR *session* ruleset instead of the dynamic one:
   - their id space never collides with the blocking rules
   - "for this browser session" needs no bookkeeping: session rules are
     dropped automatically when the browser shuts down

   An unlock always covers the whole site (host + subdomains, both
   protocols) via the same regex the blocking rules use, so opening other
   pages/tabs of the same site works too.

   The unlock MODE is encoded in the rule id range so the state survives a
   background suspension (no separate storage.session needed):
     id <  TAB_ID_MAX : "while tabs of the site are open" — pruned on tab close
                        when no open tab matches the rule any more
     id >= TAB_ID_MAX : "for N seconds" (release.once.<id> alarm) or
                        "for this browser session" (dropped on restart)          */
const TAB_ID_MAX = 1000000;

const openOnceImpl = async ({host, mode}) => {
  // guard: an empty host would compile to a match-everything allow rule that
  // silently disables *all* blocking
  if (!host || /^[.\s]*$/.test(host)) {
    throw new Error('cannot unlock: unknown site');
  }
  const regexFilter = convert(host);
  const isTab = mode?.type === 'tab';
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  // reuse the id already allowing this exact site if it is in the right range;
  // otherwise drop it and take a fresh id from the range matching the new mode
  const same = existing.find(r => r.action?.type === 'allow' && r.condition?.regexFilter === regexFilter);
  let id = null;
  if (same) {
    if ((same.id < TAB_ID_MAX) === isTab) {
      id = same.id;
    }
    else {
      await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [same.id]});
    }
  }
  if (id === null) {
    const inRange = existing.filter(r => (r.id < TAB_ID_MAX) === isTab);
    const base = isTab ? 1 : TAB_ID_MAX;
    id = inRange.reduce((m, r) => Math.max(m, r.id), base - 1) + 1;
  }

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{
      id,
      priority: 5,
      action: {type: 'allow'},
      condition: {
        regexFilter,
        isUrlFilterCaseSensitive: false,
        resourceTypes: ['main_frame', 'sub_frame']
      }
    }]
  });

  await chrome.alarms.clear('release.once.' + id);
  if (mode?.type === 'for') {
    chrome.alarms.create('release.once.' + id, {
      when: Date.now() + mode.seconds * 1000
    });
  }
  // 'tab' and 'session' modes need no per-id bookkeeping
  refreshUnlockIcons();
};
// serialize unlock installs: id allocation reads getSessionRules() then writes,
// so two concurrent unlocks could otherwise pick the same id and clobber each other
let openOnceLock = Promise.resolve();
const openOnce = opts => {
  const result = openOnceLock.then(() => openOnceImpl(opts));
  openOnceLock = result.catch(() => {}); // keep the chain alive on failure
  return result;
};

// the url a tab counts as — for our own blocked page it is the site it stands
// in for (via ?url=), so a "tab" unlock is not dropped mid-navigation
const tabUrl = url => {
  if (!url) {
    return '';
  }
  if (url.startsWith(chrome.runtime.getURL('/data/blocked/'))) {
    return url.split('&url=')[1] || '';
  }
  return url;
};
// a "tab" unlock lives while any open tab still matches its rule; re-check on close
chrome.tabs.onRemoved.addListener(async closedId => {
  const unlocks = (await chrome.declarativeNetRequest.getSessionRules())
    .filter(r => r.id < TAB_ID_MAX && r.action?.type === 'allow');
  if (unlocks.length === 0) {
    return;
  }
  // Firefox still lists the closing tab here, so exclude it explicitly —
  // otherwise the just-closed site tab would keep its own unlock alive
  const tabs = (await chrome.tabs.query({})).filter(t => t.id !== closedId);
  const urls = tabs.map(t => tabUrl(t.url)).filter(Boolean);

  const remove = [];
  for (const rule of unlocks) {
    let re;
    try {
      re = new RegExp(rule.condition.regexFilter, 'i');
    }
    catch (e) {
      continue;
    }
    if (urls.some(u => re.test(u)) === false) {
      remove.push(rule.id);
    }
  }
  if (remove.length) {
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: remove});
    refreshUnlockIcons();
  }
});

/* action icon as a traffic light, per tab, so the state of the current page is
   visible at a glance (echoes the blocked-page octagon graphic):
     red   + "!"  the page is blocked (our blocked page is showing)
     yellow + clock  the site is temporarily allowed by a session-rule unlock
     green + check  the page is not blocked
   Global blocking-paused keeps its own (blue) icon. */
const sessionUnlocks = async () => (await chrome.declarativeNetRequest.getSessionRules())
  .filter(r => r.action?.type === 'allow');
const unlockMatches = (unlocks, url) => unlocks.filter(rule => {
  try {
    return new RegExp(rule.condition.regexFilter, 'i').test(url);
  }
  catch (e) {
    return false;
  }
});
const ICON_STATE = {
  blocked: {dir: 'blocked/', msg: 'bg_msg_33'},
  unlocked: {dir: 'unlocked/', msg: 'bg_msg_32'},
  paused: {dir: 'paused/', msg: 'bg_msg_27'},
  allowed: {dir: 'allowed/', msg: 'bg_msg_34'}
};
const tabIconState = async (tab, unlocks) => {
  // our own blocked page is showing -> the page is blocked
  if ((tab.url || '').startsWith(chrome.runtime.getURL('/data/blocked/'))) {
    return 'blocked';
  }
  // the site is reachable only because a temporary unlock allows it
  const url = tabUrl(tab.url);
  if (url.startsWith('http') && unlockMatches(unlocks, url).length) {
    return 'unlocked';
  }
  // blocking is globally paused -> keep the dedicated paused state
  if ((await chrome.declarativeNetRequest.getDynamicRules()).some(r => r.id === 999)) {
    return 'paused';
  }
  return 'allowed';
};
const syncActionIcon = async (tab, unlocks) => {
  const {dir, msg} = ICON_STATE[await tabIconState(tab, unlocks)];
  chrome.action.setIcon({
    tabId: tab.id,
    path: {'16': `/data/icons/${dir}16.png`, '32': `/data/icons/${dir}32.png`}
  }, () => chrome.runtime.lastError);
  chrome.action.setTitle({
    tabId: tab.id,
    title: chrome.runtime.getManifest().name + (msg ? ' — ' + translate(msg) : '')
  }, () => chrome.runtime.lastError);
};
// re-evaluate the visible tabs (after an unlock is installed or removed);
// background tabs are re-checked on activation
const refreshUnlockIcons = async () => {
  try {
    const unlocks = await sessionUnlocks();
    for (const tab of await chrome.tabs.query({active: true})) {
      await syncActionIcon(tab, unlocks);
    }
  }
  catch (e) {
    console.warn('cannot refresh the action icons', e);
  }
};
chrome.tabs.onActivated.addListener(({tabId}) => chrome.tabs.get(tabId)
  .then(async tab => syncActionIcon(tab, await sessionUnlocks()))
  .catch(() => {}));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // a navigation resets the tab-scoped icon, so re-evaluate it
  if (info.url || info.status === 'loading' || info.status === 'complete') {
    sessionUnlocks().then(unlocks => syncActionIcon(tab, unlocks)).catch(() => {});
  }
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
      'timeout': 60, // seconds; default unlock duration
      'sha256': '', // sha256 hash code of the user password
      'password': '' // deprecated
    }).then(prefs => {
      // normalize the requested unlock mode; fall back to the configured seconds
      let mode = request.mode;
      if (!mode || (mode.type === 'for' && (!mode.seconds || mode.seconds < 1))) {
        mode = {type: 'for', seconds: prefs.timeout};
      }
      const next = async () => {
        try {
          await openOnce({host: request.host, mode});
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
    Promise.all([
      chrome.declarativeNetRequest.getDynamicRules(),
      chrome.declarativeNetRequest.getSessionRules()
    ]).then(([rules, session]) => {
      response({
        schedules: rules.filter(r => r.action?.type === 'allow'),
        // temporary "open once" unlocks now live in the session ruleset
        once: session.filter(r => r.action?.type === 'allow')
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
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name.startsWith('release.once.')) {
    const id = Number(alarm.name.slice('release.once.'.length));
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [id]
    });
    refreshUnlockIcons();
  }
  else if (alarm.name === 'release.open.once') { // legacy dynamic rule
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
{
  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;
    applyPopup();
  };
  chrome.runtime.onStartup.addListener(once);
  chrome.runtime.onInstalled.addListener(once);
}
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
