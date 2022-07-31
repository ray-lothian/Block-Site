/* global notify, storage, once */

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
    const prefs = await storage({
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
          const start = new Date();
          const ofsb = start.getTimezoneOffset();
          // apply offset
          start.setTime(
            start.getTime() + prefs['schedule-offset'] * 60 * 1000
          );
          const [sh, sm] = o.start.split(':');
          start.setSeconds(0);
          start.setMinutes(Number(sm));
          start.setHours(Number(sh));
          start.setDate(
            start.getDate() + (days.indexOf(day) - start.getDay())
          );
          start.setTime(
            start.getTime() - prefs['schedule-offset'] * 60 * 1000
          );
          // consider timezone changes
          const ofsa = start.getTimezoneOffset();
          start.setTime(start.getTime() + (ofsb - ofsa) * 60 * 1000);

          const end = new Date(start);
          const [eh, em] = o.end.split(':');
          end.setSeconds(0);
          end.setMinutes(Number(em));
          end.setHours(Number(eh));

          if (start.getTime() < now && end.getTime() < now) {
            start.setDate(start.getDate() + 7);
            end.setDate(end.getDate() + 7);
          }

          // console.log(start, 'Start');
          // console.log(end, 'End');

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
once(schedule.update);

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
            'priority': 2,
            'action': {
              'type': 'allow'
            },
            'condition': {
              'isUrlFilterCaseSensitive': false,
              'regexFilter': rule === 'global' ? '^http' : rule,
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
        return r.condition.regexFilter === '^http';
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
