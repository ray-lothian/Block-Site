/* global notify */

const schedule = {
  async update() {
    // clear schedule alarms
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    for (const a of await chrome.alarms.getAll()) {
      if (a.name.startsWith('schedule.')) {
        await chrome.alarms.clear(a.name);
      }
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.filter(r => r.id > 999).map(r => r.id)
    });
    // schedules
    const prefs = await chrome.storage.local.get({
      'schedule': {},
      'schedules': {},
      'schedule-offset': 0 // in minutes
    });

    const schedules = prefs.schedules;
    if (Object.keys(prefs.schedule).length) {
      schedules['global'] = prefs.schedule;
    }
    // set alarms
    const now = Date.now();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const [rule, value] of Object.entries(schedules)) {
      for (const [day, arr] of Object.entries(value.times)) {
        for (const o of arr) {
          const base = new Date();
          // apply offset to the base date so the weekday and time are in the
          // offset-adjusted frame
          base.setTime(
            base.getTime() + prefs['schedule-offset'] * 60 * 1000
          );
          base.setDate(
            base.getDate() + (days.indexOf(day) - base.getDay())
          );

          const start = new Date(base);
          const [sh, sm] = o.start.split(':');
          start.setSeconds(0);
          start.setMinutes(Number(sm));
          start.setHours(Number(sh));

          const end = new Date(base);
          const [eh, em] = o.end.split(':');
          end.setSeconds(0);
          end.setMinutes(Number(em));
          end.setHours(Number(eh));
          // "23:59" is the highest value the time input accepts; treat it as
          // end-of-day so the last minute of the day is not left out
          if (Number(eh) === 23 && Number(em) === 59) {
            end.setHours(24, 0, 0);
          }

          // remove the offset from both boundaries
          start.setTime(
            start.getTime() - prefs['schedule-offset'] * 60 * 1000
          );
          end.setTime(
            end.getTime() - prefs['schedule-offset'] * 60 * 1000
          );

          if (start.getTime() < now && end.getTime() < now) {
            start.setDate(start.getDate() + 7);
            end.setDate(end.getDate() + 7);
          }

          if (start.getTime() >= end.getTime()) {
            notify(`Schedule time for "${day}" - "${rule}" rule is ignored!

"From" must be less than "To"`);
            continue;
          }

          const guid = (Math.random() + 1).toString(36).substring(7);

          chrome.alarms.create('schedule.start.' + guid + '.' + rule, {
            when: start.getTime(),
            periodInMinutes: 7 * 24 * 60
          });
          chrome.alarms.create('schedule.end.' + guid + '.' + rule, {
            when: end.getTime(),
            periodInMinutes: 7 * 24 * 60
          });
        }
      }
    }
  }
};
chrome.storage.onChanged.addListener(prefs => {
  if (prefs.schedule || prefs.schedules || prefs.reverse) {
    schedule.update();
  }
});
{
  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;
    schedule.update();
  };
  chrome.runtime.onStartup.addListener(once);
  chrome.runtime.onInstalled.addListener(once);
}

/* recompute weekly alarms when the timezone offset changes */
{
  const ALARM = 'timezone-offset-check';
  const KEY = 'schedule-last-timezone-offset';

  const nextMidnight = () => {
    const date = new Date();
    date.setHours(24, 0, 0, 0);
    return date.getTime();
  };
  const arm = () => chrome.alarms.create(ALARM, {
    when: nextMidnight()
  });

  const check = async () => {
    try {
      const offset = new Date().getTimezoneOffset();
      const prefs = await chrome.storage.local.get({
        [KEY]: null
      });
      if (prefs[KEY] !== null && prefs[KEY] !== offset) {
        await schedule.update();
      }
      await chrome.storage.local.set({
        [KEY]: offset
      });
    }
    catch (e) {
      console.warn('Cannot check the timezone offset', e);
    }
    finally {
      arm();
    }
  };

  chrome.alarms.onAlarm.addListener(o => {
    if (o.name === ALARM) {
      check();
    }
  });

  {
    const once = async () => {
      if (once.done) {
        return;
      }
      once.done = true;
      try {
        await chrome.storage.local.set({
          [KEY]: new Date().getTimezoneOffset()
        });
      }
      catch (e) {
        console.warn('Cannot store the timezone offset', e);
      }
      finally {
        arm();
      }
    };
    chrome.runtime.onStartup.addListener(once);
    chrome.runtime.onInstalled.addListener(once);
  }
}

const schTMPIds = {}; // in case more than one schedule fired
chrome.alarms.onAlarm.addListener(async o => {
  if (o.name.startsWith('schedule.') === false) {
    return;
  }

  const rule = o.name.replace('schedule.', '')
    .replace('start.', '')
    .replace('end.', '')
    .replace(/^[^.]+\./, '');

  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  if (o.name.startsWith('schedule.start.')) {
    // find free id
    const ids = rules.map(r => r.id);
    for (let id = 1000; ; id += 1) {
      if (ids.indexOf(id) === -1 && schTMPIds[id] !== true) {
        schTMPIds[id] = true;
        chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [{
            id,
            'priority': 4,
            'action': {
              'type': 'allow'
            },
            'condition': {
              'isUrlFilterCaseSensitive': false,
              'regexFilter': rule === 'global' ? '^http.*' : rule,
              'resourceTypes': ['main_frame', 'sub_frame']
            }
          }]
        }).then(() => {
          delete schTMPIds[id];
        }).catch(e => notify(`Cannot apply "${rule}" schedule rule:

Error: ${e.message}`));
        break;
      }
    }
  }
  else {
    const removeRuleIds = rules.filter(r => r.id > 999).filter(r => {
      if (rule === 'global') {
        return r.condition.regexFilter === '^http.*';
      }
      else {
        return r.condition.regexFilter === rule;
      }
    }).map(r => r.id);

    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds
    });
  }
});
