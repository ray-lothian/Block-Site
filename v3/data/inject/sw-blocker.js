// make sure pages loaded from service worker are not in the blocked list
navigator.serviceWorker.getRegistrations().then(registrations => {
  if (registrations.length) {
    chrome.storage.local.get({
      blocked: []
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
                    method: 'block'
                  });
                });
              }
            }
            catch (e) {}
          }
        });
      }
    });
  }
});
