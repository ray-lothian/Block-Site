// make sure pages loaded from service worker are not in the blocked list

const validate = () => chrome.storage.local.get({
  blocked: [],
  notes: {}
}, prefs => {
  if (prefs.blocked.length) {
    chrome.runtime.sendMessage({
      method: 'convert',
      hosts: prefs.blocked
    }, rules => {
      for (const rule of rules) {
        try {
          const r = new RegExp(rule, 'i');
          if (r.test(location.href)) {
            // make sure the rule does not match schedule
            return chrome.runtime.sendMessage({
              method: 'get-schedule-rules'
            }, schedules => {
              for (const schedule of schedules) {
                const r = new RegExp(schedule.condition.regexFilter, 'i');
                if (r.test(location.href)) {
                  return;
                }
              }
              chrome.runtime.sendMessage({
                method: 'block',
                date: prefs.notes[prefs.blocked[rules.indexOf(rule)]]?.date
              });
            });
          }
        }
        catch (e) {}
      }
    });
  }
});

// https://github.com/ray-lothian/Block-Site/issues/85
navigator?.serviceWorker?.getRegistrations()?.then(registrations => {
  if (registrations.length) {
    validate();
  }
});

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
