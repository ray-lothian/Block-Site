'use strict';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  e[e.dataset.i18nValue || 'textContent'] = chrome.i18n.getMessage(e.dataset.i18n);
});

const toast = (msg, period = 750, type = 'info') => {
  const e = document.getElementById('toast');
  e.dataset.type = type;
  clearTimeout(toast.id);
  toast.id = setTimeout(() => e.textContent = '', period);
  e.textContent = msg;
};

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const warning = e => {
  e.returnValue = 'Changes you made are not saved';
  return true;
};

const DEFAULTS = {
  'timeout': 60, // seconds
  'close': 0, // seconds
  'message': '',
  'css': '',
  'redirect': '',
  'blocked': [],
  'sha256': '',
  'password': '', // deprecated
  'wrong': 1, // minutes
  'title': true,
  'reverse': false,
  'no-password-on-add': false,
  'map': {},
  'schedule': {
    time: { // deprecated
      start: '',
      end: ''
    },
    days, // deprecated
    times: null // per day scheduling {'Mon': [{start, end}], ...}
  },
  'schedules': {},
  'initialBlock': true,
  'contextmenu-resume': true,
  'contextmenu-pause': true,
  'contextmenu-frame': true,
  'contextmenu-top': true
};
const prefs = {};

const list = document.getElementById('list');
const wildcard = h => {
  if (h.indexOf('://') === -1 && h.startsWith('R:') === false) {
    return `*://${h}/*`;
  }
  return h;
};

function validateRegex(regexStr) {
  try {
    new RegExp(regexStr, 'i');
    return '';
  }
  catch (error) {
    return error;
  }
}

function add(hostname) {
  const template = document.querySelector('#list template');
  const node = document.importNode(template.content, true);
  const div = node.querySelector('div');
  div.dataset.pattern = node.querySelector('[data-id=href]').textContent = wildcard(hostname);
  div.dataset.hostname = hostname;
  const rd = node.querySelector('input');
  rd.value = prefs.map[hostname] || '';
  rd.disabled = hostname.indexOf('*') !== -1;
  node.querySelector('[data-cmd="remove"]').value = chrome.i18n.getMessage('options_remove');
  document.getElementById('rules-container').appendChild(node);
  list.dataset.visible = true;

  return rd;
}

document.getElementById('add').addEventListener('submit', e => {
  e.preventDefault();
  const hostname = e.target.querySelector('input[type=text]').value;
  if (hostname) {
    if (hostname.startsWith('R:')) {
      const e = validateRegex(hostname.substr(2));
      if (e) {
        return toast(e.message, 3000, 'error');
      }
    }
    add(hostname);
  }
});

const fs = schedule => {
  if (schedule.times) {
    for (const day of days) {
      document.querySelector(`input[type=time][name=start][data-id=${day}]`).value = '';
      document.querySelector(`input[type=time][name=end][data-id=${day}]`).value = '';
    }
    // we only consider one range per day
    for (const [day, [time]] of Object.entries(schedule.times)) {
      document.querySelector(`input[type=time][name=start][data-id=${day}]`).value = time.start;
      document.querySelector(`input[type=time][name=end][data-id=${day}]`).value = time.end;
    }
  }
  else { // old method
    for (const day of days) {
      if (schedule.days.indexOf(day) !== -1) {
        document.querySelector(`input[type=time][name=start][data-id=${day}]`).value = schedule.time.start;
        document.querySelector(`input[type=time][name=end][data-id=${day}]`).value = schedule.time.end;
      }
      else {
        document.querySelector(`input[type=time][name=start][data-id=${day}]`).value = '';
        document.querySelector(`input[type=time][name=end][data-id=${day}]`).value = '';
      }
    }
  }
};

// double-check password; based on https://github.com/ray-lothian/Block-Site/issues/51
const grant = callback => chrome.storage.local.get({
  'sha256': ''
}, prefs => {
  if (prefs.sha256) {
    chrome.runtime.sendMessage({
      method: 'ask-for-password'
    }, password => {
      chrome.runtime.sendMessage({
        method: 'check-password',
        password
      }, resp => resp && callback());
    });
  }
  else {
    callback();
  }
});

const init = (table = true) => chrome.storage.local.get(DEFAULTS, ps => {
  Object.assign(prefs, ps);

  if (table) {
    prefs.blocked.filter(a => a).forEach(add);
  }
  document.getElementById('title').checked = prefs.title;
  document.getElementById('initialBlock').checked = prefs.initialBlock;
  document.getElementById('reverse').checked = prefs.reverse;
  document.getElementById('no-password-on-add').checked = prefs['no-password-on-add'];
  document.getElementById('timeout').value = prefs.timeout;
  document.getElementById('close').value = prefs.close;
  document.getElementById('wrong').value = prefs.wrong;
  document.getElementById('message').value = prefs.message;
  document.getElementById('css').value = prefs.css;
  document.getElementById('redirect').value = prefs.redirect;

  fs(prefs.schedule);
  document.querySelector('#schedule [name=hostname]').value = '';

  document.getElementById('contextmenu-resume').checked = prefs['contextmenu-resume'];
  document.getElementById('contextmenu-pause').checked = prefs['contextmenu-pause'];
  document.getElementById('contextmenu-frame').checked = prefs['contextmenu-frame'];
  document.getElementById('contextmenu-top').checked = prefs['contextmenu-top'];

  const safe = prefs.password !== '' || prefs.sha256 !== '';
  document.querySelector('[data-cmd=unlock]').disabled = safe === false;
  document.querySelector('[data-cmd="save"]').disabled = safe;
  document.querySelector('[data-cmd="export"]').disabled = safe;
  document.querySelector('[data-cmd="import-json"]').disabled = safe;
  document.getElementById('rules').textContent = '';
  for (const rule of Object.keys(prefs.schedules)) {
    const option = document.createElement('option');
    option.value = rule;
    document.getElementById('rules').appendChild(option);
  }
  document.getElementById('mode-top').value = localStorage.getItem('mode-top') || 'complete';
  document.getElementById('mode-frame').value = localStorage.getItem('mode-frame') || 'complete'; // 'simple'
});
init();

document.querySelector('#schedule [name="hostname"]').addEventListener('input', e => {
  const schedule = prefs.schedules[e.target.value];
  if (schedule) {
    fs(schedule);
  }
});

document.getElementById('save-container').onsubmit = e => {
  e.preventDefault();
  e.stopPropagation();

  const password = document.getElementById('password').value;
  chrome.runtime.sendMessage({
    method: 'check-password',
    password
  }, resp => {
    document.querySelector('[data-cmd="unlock"]').disabled = resp;
    document.querySelector('[data-cmd="save"]').disabled = !resp;
    document.querySelector('[data-cmd="export"]').disabled = !resp;
    document.querySelector('[data-cmd="import-json"]').disabled = !resp;
    if (!resp) {
      document.getElementById('password').focus();
    }
  });
};

document.addEventListener('click', async e => {
  const {target} = e;
  const cmd = target.dataset.cmd;
  if (cmd === 'remove') {
    target.closest('div').remove();
  }
  else if (cmd === 'save') {
    grant(async () => {
      let schedule = {
        times: days.reduce((p, c) => {
          const start = document.querySelector(`input[type=time][name=start][data-id=${c}]`).value;
          const end = document.querySelector(`input[type=time][name=end][data-id=${c}]`).value;

          if (start && end) {
            p[c] = [{start, end}];
          }

          return p;
        }, {})
      };
      const rule = document.querySelector('#schedule [name="hostname"]');
      if (rule.value) {
        const e = validateRegex(rule.value);
        if (e) {
          return toast('Schedule Blocking; ' + e.message, 3000, 'error');
        }
        else {
          if (Object.values(schedule.times).some(times => times.some(({start, end}) => start && end))) {
            prefs.schedules[rule.value] = schedule;
          }
          else {
            delete prefs.schedules[rule.value];
            console.log('deleting rule for', rule.value);
          }
          schedule = prefs.schedule;
        }
      }
      localStorage.setItem('mode-top', document.getElementById('mode-top').value);
      localStorage.setItem('mode-frame', document.getElementById('mode-frame').value);

      const password = document.getElementById('password').value;
      const sha256 = password ? await new Promise(resolve => {
        chrome.runtime.getBackgroundPage(bg => resolve(bg.sha256(password)));
      }) : '';

      // clear deprecated password preference
      chrome.storage.local.remove('password');
      chrome.storage.local.set({
        sha256,
        'title': document.getElementById('title').checked,
        'initialBlock': document.getElementById('initialBlock').checked,
        'reverse': document.getElementById('reverse').checked,
        'no-password-on-add': document.getElementById('no-password-on-add').checked,
        'redirect': document.getElementById('redirect').value,
        'message': document.getElementById('message').value,
        'css': document.getElementById('css').value,
        'timeout': Math.max(Number(document.getElementById('timeout').value), 1),
        'close': Math.max(Number(document.getElementById('close').value), 0),
        'wrong': Math.max(Number(document.getElementById('wrong').value), 1),
        schedule,
        'schedules': prefs.schedules,
        'blocked': [...document.querySelectorAll('#rules-container > div')]
          .map(tr => tr.dataset.hostname)
          .filter((s, i, l) => s && l.indexOf(s) === i),
        'map': [...document.querySelectorAll('#rules-container > div')].reduce((p, c) => {
          const {hostname} = c.dataset;
          const mapped = c.querySelector('input[type=text]').value;
          if (mapped) {
            p[hostname] = mapped;
          }
          return p;
        }, {}),
        'contextmenu-resume': document.getElementById('contextmenu-resume').checked,
        'contextmenu-pause': document.getElementById('contextmenu-pause').checked,
        'contextmenu-frame': document.getElementById('contextmenu-frame').checked,
        'contextmenu-top': document.getElementById('contextmenu-top').checked
      }, () => {
        toast('Options saved');
        window.removeEventListener('beforeunload', warning);
        init(false);
      });
    });
  }
  else if (cmd === 'import-txt') {
    const input = document.createElement('input');
    input.style.display = 'none';
    input.type = 'file';
    input.accept = '.txt';
    input.acceptCharset = 'utf-8';

    document.body.appendChild(input);
    input.initialValue = input.value;
    input.onchange = () => {
      if (input.value !== input.initialValue) {
        const file = input.files[0];
        if (file.size > 100e6) {
          return toast('100MB backup? I don\'t believe you.', undefined, 'error');
        }
        const reader = new FileReader();
        reader.onloadend = event => {
          input.remove();
          event.target.result.split('\n').map(l => l.trim()).filter(l => l && l[0] !== '#').forEach(l => {
            const [a, b] = l.split(/\s+/);
            const rd = add(a);
            if (b) {
              rd.value = b;
            }
          });
        };
        reader.readAsText(file, 'utf-8');
      }
    };
    input.click();
  }
  else if (cmd === 'export') {
    grant(() => {
      chrome.storage.local.get(null, prefs => {
        const guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          const v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });

        const blob = new Blob([
          JSON.stringify(Object.assign({}, prefs, {
            'managed.storage.overwrite.on.start': false,
            guid
          }), null, e.shiftKey ? '' : '  ')
        ], {type: 'application/json'});
        const href = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), {
          href,
          type: 'application/json',
          download: 'block-site-preferences.json'
        }).dispatchEvent(new MouseEvent('click'));
        setTimeout(() => URL.revokeObjectURL(href));
      });
    });
  }
  else if (cmd == 'import-json') {
    grant(() => {
      const input = document.createElement('input');
      input.style.display = 'none';
      input.type = 'file';
      input.accept = '.json';
      input.acceptCharset = 'utf-8';

      document.body.appendChild(input);
      input.initialValue = input.value;
      input.onchange = () => {
        if (input.value !== input.initialValue) {
          const file = input.files[0];
          if (file.size > 100e6) {
            return toast('100MB backup? I don\'t believe you.', undefined, 'error');
          }
          const reader = new FileReader();
          reader.onloadend = event => {
            input.remove();
            const json = JSON.parse(event.target.result);
            chrome.storage.local.clear(() => chrome.storage.local.set(json, () => {
              chrome.runtime.reload();
              window.close();
            }));
          };
          reader.readAsText(file, 'utf-8');
        }
      };
      input.click();
    });
  }
  else if (cmd === 'reset') {
    if (e.detail === 1) {
      toast('Double-click to reset!');
    }
    else {
      localStorage.clear();
      chrome.storage.local.clear(() => {
        chrome.runtime.reload();
        window.close();
      });
    }
  }
});

document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));

/* change reminder */
document.addEventListener('change', () => {
  window.addEventListener('beforeunload', warning);
});

/* auto type rule */
document.getElementById('rules-container').addEventListener('click', e => {
  if (e.target.dataset.id === 'href') {
    const value = e.target.parentElement.dataset.hostname;
    if (value) {
      document.querySelector('#add input[name="hostname"]').value = value;
      document.dispatchEvent(new Event('change'));
    }
  }
});
