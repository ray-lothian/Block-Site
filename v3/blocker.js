/* global convert, storage, notify */

/* update rules */
const update = () => storage({
  initialBlock: true,
  blocked: [],
  map: {},
  reverse: false,
  redirect: '' // use custom redirect page
}).then(async prefs => {
  // remove old rules
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.filter(r => r.id < 998).map(r => r.id)
  });
  const ids = [];

  // add new rules
  if (prefs.reverse) {
    ids.push(1);
    const rule = {
      id: 1,
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution: (prefs.redirect || chrome.runtime.getURL('/data/blocked/index.html')) + '?url=\\0'
        }
      },
      condition: {
        regexFilter: '^http',
        resourceTypes: ['main_frame', 'sub_frame'],
        isUrlFilterCaseSensitive: false
      }
    };
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [rule]
    });
  }

  for (const h of prefs.blocked) {
    if (h) {
      // find free id
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
          Object.assign(rule.action, {
            type: 'redirect',
            redirect: {
              extensionPath: '/data/close/index.html'
            }
          });
        }
        else if (prefs.map[h]) {
          Object.assign(rule.action, {
            type: 'redirect',
            redirect: {
              regexSubstitution: prefs.map[h]
            }
          });
        }
        else {
          Object.assign(rule.action, {
            type: 'redirect',
            redirect: {
              regexSubstitution: (prefs.redirect || chrome.runtime.getURL('/data/blocked/index.html')) + '?url=\\0'
            }
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
  }
  // get existing tabs
  const tabs = prefs.initialBlock ? await chrome.tabs.query({
    url: '*://*/*'
  }) : [];
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
});

chrome.storage.onChanged.addListener(ps => {
  if (ps.blocked || ps.reverse || ps.map || ps.redirect) {
    update();
  }
});
chrome.runtime.onInstalled.addListener(update);
