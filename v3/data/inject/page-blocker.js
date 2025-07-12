// make sure pages loaded from service worker are not in the blocked list

const validate = () => chrome.storage.local.get({
  blocked: [],
  map: {},
  notes: {}
}, async prefs => {
  if (prefs.blocked.length) {
    const rules = await chrome.runtime.sendMessage({
      method: 'convert',
      hosts: prefs.blocked
    });
    for (const {expression, host} of rules) {
      try {
        const r = new RegExp(expression, 'i');
        if (r.test(location.href) === false) {
          continue;
        }
        const {schedules, once} = await chrome.runtime.sendMessage({
          method: 'get-rules'
        });
        // make sure the rule is not excluded by open-once
        if (once) {
          const s = once.condition.urlFilter.slice(0, -1); // remove '*'
          if (location.href.startsWith(s)) {
            continue;
          }
        }
        // make sure the rule does not match schedule
        for (const schedule of schedules) {
          const r = new RegExp(schedule.condition.regexFilter, 'i');
          if (r.test(location.href)) {
            return;
          }
        }
        // Block or Redirect
        let redirect = prefs.map[host];
        if (redirect) {
          const matches = location.href.match(r);
          if (matches) {
            matches.forEach((m, n) => {
              redirect = redirect.replace('\\' + n, m);
            });
          }
        }
        chrome.runtime.sendMessage({
          method: 'block',
          redirect,
          host,
          date: prefs.notes[host]?.date
        });
      }
      catch (e) {}
    }
  }
});

// https://github.com/ray-lothian/Block-Site/issues/85
if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    if (registrations.length) {
      validate();
    }
  });
}
// else {
//   validate();
// }

// https://github.com/ray-lothian/Block-Site/issues/111
if (navigator.userAgent.includes('OPR/')) {
  validate();
}

let href = location.href;
chrome.runtime.onMessage.addListener((request, sender, response) => {
  // push state
  if (request.method === 'address-changed' && href !== location.href) {
    href = location.href;
    validate();
  }
  else if (request.method === 'get-referrer') {
    response(document.referrer);
  }
});
