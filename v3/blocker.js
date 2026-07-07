/* global convert, notify, translate, resume */

// a plausible URL that a block pattern would match, used to tell whether a
// temporary "open once" allow rule still shadows a currently-blocked site
const sampleUrl = host => {
  if (!host || host.startsWith('R:')) {
    return null; // regex rules: cannot derive a sample safely
  }
  let h = host.replace(/^\*:\/\//, 'https://').replace(/\*/g, '');
  if (h.indexOf('://') === -1) {
    h = 'https://' + h;
  }
  return h;
};

/* update rules */
const update = async () => {
  if (update.busy) {
    update.dirty = true;
    return new Promise((resolve, reject) => update.caches.add({resolve, reject}));
  }
  update.busy = true;

  const cc = e => {
    update.busy = false;
    const waiters = [...update.caches];
    update.caches.clear();
    // preferences changed while this run was in progress; re-run with fresh values
    if (update.dirty) {
      update.dirty = false;
      update().then(
        () => waiters.forEach(({resolve}) => resolve()),
        e => waiters.forEach(({reject}) => reject(e))
      );
      return;
    }
    for (const {resolve, reject} of waiters) {
      if (e) {
        reject(e);
      }
      else {
        resolve();
      }
    }
  };

  try {
    const prefs = await chrome.storage.local.get({
      'max-number-of-rules': (chrome.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES || 1000) / 2,
      'initialBlock': true,
      'initialBlockCurrent': true,
      'blocked': [],
      'notes': {},
      'map': {},
      'reverse': false,
      'redirect': '', // use custom redirect page
      'contexts': ['main_frame', 'sub_frame'],
      'pause-until': ''
    });

    const rules = await chrome.declarativeNetRequest.getDynamicRules();

    const genRedirect = (address, date, host) => {
      if (address && /\\\d/.test(address)) {
        return {
          regexSubstitution: address
        };
      }
      else if (address) {
        return {
          url: address
        };
      }
      const args = []; // do not use URLSearchParams
      if (date) {
        args.push('date=' + date);
      }
      if (host) {
        args.push('host=' + encodeURIComponent(host));
      }
      args.push('type=dnr'); // declarative net request
      args.push('url=\\0');
      return {
        regexSubstitution: chrome.runtime.getURL('/data/blocked/index.html') + '?' + args.join('&')
      };
    };

    // build the new rule set
    const entries = []; // {host, rule}
    if (prefs.reverse) {
      entries.push({
        host: '',
        rule: {
          id: 1,
          action: {
            type: 'redirect',
            redirect: genRedirect(prefs.redirect)
          },
          condition: {
            regexFilter: '^http.*',
            resourceTypes: prefs.contexts,
            isUrlFilterCaseSensitive: false
          }
        }
      });
    }
    const hs = prefs.blocked.filter((s, i, l) => s && l.indexOf(s) === i);
    if (hs.length > prefs['max-number-of-rules']) {
      notify(`You have too many blocking rules! Only the first ${prefs['max-number-of-rules']} rules are applied.

  Please merge them to keep the list less than ${prefs['max-number-of-rules']} items.`);
    }

    const hss = hs.slice(0, prefs['max-number-of-rules']);
    let id = prefs.reverse ? 1 : 0;
    for (const h of hss) {
      id += 1;
      // construct rule
      const rule = {
        id,
        action: {},
        condition: {
          resourceTypes: prefs.contexts,
          isUrlFilterCaseSensitive: false,
          regexFilter: convert(h)
        }
      };
      if (prefs.reverse) {
        Object.assign(rule.action, {
          type: 'allow'
        });
      }
      else {
        if (prefs.map[h] === 'close') {
          rule.priority = 3;
          Object.assign(rule.action, {
            type: 'redirect',
            redirect: {
              extensionPath: '/data/close/index.html'
            }
          });
        }
        else if (prefs.map[h]) {
          rule.priority = 2;
          Object.assign(rule.action, {
            type: 'redirect',
            redirect: genRedirect(prefs.map[h], undefined, h)
          });
        }
        else {
          const date = prefs.notes[h]?.date;
          Object.assign(rule.action, {
            type: 'redirect',
            redirect: genRedirect(prefs.redirect, date, h)
          });
        }
      }
      entries.push({host: h, rule});
    }

    // drop rules the engine cannot handle (e.g. invalid or too-complex regex)
    if (chrome.declarativeNetRequest.isRegexSupported) {
      const checks = await Promise.all(entries.map(({rule}) => chrome.declarativeNetRequest.isRegexSupported({
        regex: rule.condition.regexFilter,
        isCaseSensitive: false
      })));
      for (let n = entries.length - 1; n >= 0; n -= 1) {
        if (checks[n].isSupported === false) {
          console.warn('unsupported rule', entries[n].host, checks[n].reason);
          notify(`cannot add rule "${entries[n].host}"

  Error: ` + checks[n].reason);
          entries.splice(n, 1);
        }
      }
    }

    // replace old rules with the new set in one atomic call so that there is
    // no window where nothing is blocked and no partial set on failure
    const removeRuleIds = rules.filter(r => r.id < 998).map(r => r.id);
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules: entries.map(o => o.rule)
      });
    }
    catch (e) {
      // e.g. the global regex memory limit; retry rule by rule so that one
      // oversized rule does not take down the entire list
      console.warn('batch rule update failed; retrying rule by rule', e);
      await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds});
      for (let n = 0; n < entries.length; n += 1) {
        const {host, rule} = entries[n];
        try {
          chrome.action.setBadgeText({text: (n / entries.length * 100).toFixed(0) + '%'});

          await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [rule]
          });
        }
        catch (e) {
          console.warn(e);
          notify(`cannot add rule "${host}"

  Error: ` + e.message);
        }
      }
    }
    chrome.action.setBadgeText({text: ''});

    // drop temporary "open once" unlocks that no longer shadow any blocked
    // site, so that permanently removing a block (and later re-adding it) is
    // not silently overridden by a stale session allow rule (priority 5)
    if (prefs.reverse === false && hss.some(h => h.startsWith('R:')) === false) {
      const allows = (await chrome.declarativeNetRequest.getSessionRules())
        .filter(r => r.action?.type === 'allow');
      if (allows.length) {
        const samples = hss.map(sampleUrl).filter(Boolean);
        const stale = allows.filter(rule => {
          let re;
          try {
            re = new RegExp(rule.condition.regexFilter, 'i');
          }
          catch (e) {
            return false;
          }
          return samples.some(u => re.test(u)) === false;
        }).map(r => r.id);
        if (stale.length) {
          await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: stale});
        }
      }
    }

    // get existing tabs
    const options = {
      url: '*://*/*'
    };
    if (prefs.initialBlock === false) {
      options.active = true;
      options.currentWindow = true;
    }
    const tabs = prefs.initialBlock === false && prefs.initialBlockCurrent === false ?
      [] : await chrome.tabs.query(options);

    const current = await chrome.declarativeNetRequest.getDynamicRules();
    // get schedule rules
    const scheduleRegExps = current
      .filter(r => r.id > 999)
      .map(r => new RegExp(r.condition.regexFilter, 'i'));

    const regExps = current.filter(r => {
      if (prefs.reverse && r.id === 1) {
        return false;
      }
      return r.id < 998;
    }).map(r => new RegExp(r.condition.regexFilter, 'i'));

    for (const tab of tabs) {
      if (!tab.url) {
        continue;
      }
      // the tab is currently allowed by an active schedule rule
      if (scheduleRegExps.some(r => r.test(tab.url))) {
        continue;
      }
      if (prefs.reverse) {
        if (regExps.some(r => r.test(tab.url)) === false) {
          chrome.tabs.reload(tab.id);
        }
      }
      else if (regExps.some(r => r.test(tab.url))) {
        chrome.tabs.reload(tab.id);
      }
    }
    // Evaluate the address on the active blocked page
    chrome.tabs.query({
      currentWindow: true,
      active: true
    }, tabs => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          method: 'click-address'
        }).catch(() => {});
      }
    });

    // do we have a manual pause
    if (rules.filter(r => r.id === 999).length) {
      const icon = () => {
        chrome.action.setIcon({
          path: {
            '16': '/data/icons/paused/16.png',
            '32': '/data/icons/paused/32.png'
          }
        });
        chrome.action.setTitle({
          title: translate('bg_msg_27')
        });
      };
      if (prefs['pause-until'] === 'no-resume') {
        icon();
      }
      /* removed paused state if there is not timer to reset it and there is no infinite pause */
      else if (prefs['pause-until'] && Date.now() >= prefs['pause-until']) {
        resume();
      }
      else {
        // on Firefox after running "chrome.runtime.restart()" there is no timer
        const alarms = await chrome.alarms.getAll();
        if (alarms.some(a => a.name === 'release.pause')) {
          icon();
        }
        else {
          resume();
        }
      }
    }
    else {
      chrome.action.setTitle({
        title: chrome.runtime.getManifest().name + `

Number of active filters: ` + regExps.length
      });
    }

    cc();
  }
  catch (e) {
    cc(e);
    throw e;
  }
};
update.caches = new Set();

chrome.storage.onChanged.addListener(ps => {
  if (ps.blocked || ps.reverse || ps.map || ps.redirect || ps.changed || ps.contexts) {
    update().catch(e => console.error('[error]', e));
  }
});

// if a page uses history API to push state, the blocker script is not being called
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) {
    chrome.tabs.sendMessage(tabId, {
      method: 'address-changed'
    }, () => chrome.runtime.lastError);
  }
});

{
  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;
    // update
    update();
    // remove "open once" rule on startup
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [998]
    });
  };
  chrome.runtime.onStartup.addListener(once);
  chrome.runtime.onInstalled.addListener(once);
}
