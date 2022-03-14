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
            if (rule.startsWith('||')) {
              if (location.href.startsWith('https://' + rule.slice(2)) || location.href.startsWith('http://' + rule.slice(2))) {
                chrome.runtime.sendMessage({
                  method: 'block'
                });
              }
            }
            else {
              try {
                const r = new RegExp(rule, 'i');
                if (r.test(location.href)) {
                  chrome.runtime.sendMessage({
                    method: 'block'
                  });
                }
              }
              catch (e) {}
            }
          }
        });
      }
    });
  }
});
