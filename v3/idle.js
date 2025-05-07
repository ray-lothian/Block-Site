/* make sure timers are synced */
chrome.idle.onStateChanged.addListener(async state => {
  if (state === 'active') {
    const now = Date.now();
    for (const o of await chrome.alarms.getAll()) {
      if (o.scheduledTime < now) {
        console.log(o);

        chrome.alarms.create(o.name, {
          when: now + Math.round(Math.random() * 1000),
          periodInMinutes: o.periodInMinutes
        });
      }
    }
  }
});
