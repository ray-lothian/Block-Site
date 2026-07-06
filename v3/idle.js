/* make sure timers are synced */

/* global schedule */

{
  const validate = async () => {
    const now = Date.now();
    let reschedule = false;
    for (const o of await chrome.alarms.getAll()) {
      if (o.scheduledTime < now) {
        console.info('outdated timer', o);
        // recreating a periodic "schedule.*" alarm with "when: now" permanently
        // shifts its weekly phase to the wake-up time; recompute them instead
        if (o.name.startsWith('schedule.')) {
          reschedule = true;
        }
        else {
          chrome.alarms.create(o.name, {
            when: now + Math.round(Math.random() * 1000),
            periodInMinutes: o.periodInMinutes
          });
        }
      }
    }
    if (reschedule) {
      schedule.update();
    }
  };

  chrome.idle.onStateChanged.addListener(state => {
    if (state === 'active') {
      validate();
    }
  });
  // Firefox does not reliably fire "locked -> active" state so we check whenever possible
  // https://github.com/ray-lothian/Block-Site/pull/165
  if (navigator.userAgent.includes('Firefox')) {
    validate();
  }
}
