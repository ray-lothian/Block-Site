/* global convert, storage, notify, once, translate */

/* update rules */
const update = async () => {
  if (update.busy) {
    return new Promise((resolve, reject) => update.caches.add({resolve, reject}));
  }
  update.busy = true;

  const cc = e => {
    update.busy = false;
    for (const {resolve, reject} of update.caches) {
      if (e) {
        reject(e);
      }
      else {
        resolve();
      }
    }
    update.caches.clear();
  };

  try {
    const prefs = await storage({
      'max-number-of-rules': (chrome.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES || 1000) / 2,
      'initialBlock': true,
      'initialBlockCurrent': true,
      'blocked': [],
      'notes': {},
      'map': {},
      'reverse': false,
      'redirect': '' // use custom redirect page
    });
    // remove old rules
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.filter(r => r.id < 998).map(r => r.id)
    });
    const ids = [];

    const genRedirect = (address, date) => {
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
      args.push('url=\\0');
      return {
        regexSubstitution: chrome.runtime.getURL('/data/blocked/index.html') + '?' + args.join('&')
      };
    };

    // add new rules
    if (prefs.reverse) {
      ids.push(1);
      const rule = {
        id: 1,
        action: {
          type: 'redirect',
          redirect: genRedirect(prefs.redirect)
        },
        condition: {
          regexFilter: '^http.*',
          resourceTypes: ['main_frame', 'sub_frame'],
          isUrlFilterCaseSensitive: false
        }
      };
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [rule]
      });
    }
    const hs = prefs.blocked.filter((s, i, l) => s && l.indexOf(s) === i);
    if (hs.length > prefs['max-number-of-rules']) {
      notify(`You have too many blocking rules! Only the first 500 rules are applied.

  Please merge them to keep the list less than ${prefs['max-number-of-rules']} items.`);
    }

    const hss = hs.slice(0, prefs['max-number-of-rules']);
    let n = 0;
    for (const h of hss) {
      // visual indicator
      n += 1;
      chrome.action.setBadgeText({text: (n / hss.length * 100).toFixed(0) + '%'});

      // find a free id
      let id;
      for (let n = 1; ; n += 1) {
        if (ids.indexOf(n) === -1) {
          id = n;
          ids.push(id);
          break;
        }
      }
      // construct rule
      const rule = {
        id,
        action: {},
        condition: {
          resourceTypes: ['main_frame', 'sub_frame'],
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
            redirect: genRedirect(prefs.map[h])
          });
        }
        else {
          const date = prefs.notes[h]?.date;
          Object.assign(rule.action, {
            type: 'redirect',
            redirect: genRedirect(prefs.redirect, date)
          });
        }
      }

      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [rule]
        });
      }
      catch (e) {
        console.warn(e);
        notify(`cannot add rule "${h}"

  Error: ` + e.message);
      }
    }
    chrome.action.setBadgeText({text: ''});
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

    // get schedule rules
    const scheduleRegExp = (await chrome.declarativeNetRequest.getDynamicRules())
      .filter(r => r.id > 999)
      .map(r => new RegExp(r.condition.regexFilter, 'i'));

    const regExps = (await chrome.declarativeNetRequest.getDynamicRules()).filter(r => {
      if (prefs.reverse && r.id === 1) {
        return false;
      }
      return r.id < 998;
    }).map(r => new RegExp(r.condition.regexFilter, 'i'));

    for (const tab of tabs) {
      if (tab.url) {
        for (const r of scheduleRegExp) {
          if (r.test(tab.url)) {
            continue;
          }
        }
        if (prefs.reverse) {
          if (regExps.some(r => r.test(tab.url)) === false) {
            chrome.tabs.reload(tab.id);
          }
        }
        else {
          for (const r of regExps) {
            if (r.test(tab.url)) {
              chrome.tabs.reload(tab.id);
            }
          }
        }
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
      chrome.action.setIcon({
        path: {
          '16': '/data/icons/paused/16.png',
          '32': '/data/icons/paused/32.png'
        }
      });
      chrome.action.setTitle({
        title: translate('bg_msg_27')
      });
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
  if (ps.blocked || ps.reverse || ps.map || ps.redirect || ps.changed) {
    update().catch(e => console.error('[error]', e));
  }
});
once(update, {
  installed: true
});

// if a page uses history API to push state, the blocker script is not being called
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) {
    chrome.tabs.sendMessage(tabId, {
      method: 'address-changed'
    }, () => chrome.runtime.lastError);
  }
});

// remove once rule on startup
once(() => chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [998]
}));
