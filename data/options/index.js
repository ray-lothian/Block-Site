'use strict';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  e[e.dataset.i18nValue || 'textContent'] = chrome.i18n.getMessage(e.dataset.i18n);
});

const info = document.getElementById('info');
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const warning = e => {
  e.returnValue = 'Changes you made are not saved';
  return true;
};

const prefs = {
  timeout: 60, // seconds
  close: 0, // seconds
  message: '',
  redirect: '',
  password: '',
  wrong: 1, // minutes
  title: true,
  reverse: false,
  rules: [],
  schedule: {
    time: {
      start: '',
      end: ''
    },
    days
  },
  initialBlock: true,

};

const list = document.getElementById('list');

const protos = [
  "http:",
  "https:",
  "ws:",
  "wss:",
  "about:",
  "moz-extension:",
  "file:",
  "ftp:",
  "ftps:",
  "data:"
]

const isStartProto = (url) => {
  let ret = protos.findIndex(proto => {
    return url.startsWith(proto)
  })
  return ret === -1 ? false : true
}

const wildcard = h => {
  let newUrl = h
  if (newUrl.indexOf("/*") !== newUrl.length - 2 && !newUrl.startsWith("about:")) {
    newUrl = newUrl.concat('/*')
  }
  if (!isStartProto(h) && !h.startsWith('R:')) {
    return `*://${newUrl}`;
  }

  return newUrl;
};

const getRule = (searchRule) => {
  return prefs.rules.find(rule => {
    return rule.rule === searchRule
  })
}

// Add rule in prefs + html
function addNewRule(NewRule) {
  if (getRule(NewRule) === undefined) {
    prefs.rules.push({
      rule: NewRule
    })
    return add(NewRule)
  }
  // TODO notify
  return undefined
}

// Remove rule in prefs 
function removeRule(removeRule) {
  prefs.rules = prefs.rules.filter(rule => rule.rule !== removeRule)
}


// Add rule in html page
function add(rule, redirect) {
  const template = document.querySelector('#list template');
  const node = document.importNode(template.content, true);
  const div = node.querySelector('div');
  div.dataset.pattern = node.querySelector('[data-id=href]').textContent = rule
  div.dataset.rule = rule;
  const rd = node.querySelector('input');

  // Remove button
  const rm = node.querySelector('[data-cmd="remove"]')
  rm.value = chrome.i18n.getMessage('options_remove');
  rm.dataset.rule = rule

  // redirect input
  if (redirect) {
    const redir = node.querySelector('input[type=text]')
    redir.value = redirect
  }
  document.getElementById('rules-container').appendChild(node);
  list.dataset.visible = true;

  return rd;
}

function addRedirectFromRule(rule, redirect) {
  const changeRule = getRule(rule)
  if (changeRule) {
    changeRule.redirect = redirect
  }
  return changeRule
}

function addTimeScheduleFromRuleHtml(rule) {
  const option = document.createElement('option');
  option.value = rule;
  console.log(option)
  document.getElementById('rules').appendChild(option);
}

function addTimeScheduleFromRule(rule, schedule) {
  const changeRule = getRule(rule)
  if (changeRule) {
    changeRule.schedule = schedule
    addTimeScheduleFromRuleHtml(rule.rule)
  }
  return changeRule
}

function removeTimeScheduleFromRule(rule) {
  const changeRule = getRule(rule)
  if (changeRule) {
    delete changeRule.schedule
  }
  return changeRule
}

// Add click
document.getElementById('add').addEventListener('submit', e => {
  e.preventDefault();
  let newRule = e.target.querySelector('input[type=text]').value;
  if (newRule) {
    newRule = wildcard(newRule)
    addNewRule(newRule);
    e.target.querySelector('input[type=text]').value = ""
  }
});

const init = (table = true) => chrome.storage.local.get(prefs, ps => {
  Object.assign(prefs, ps);
  if (table) {
    prefs.rules.forEach(rule => add(rule.rule, rule.redirect))
  }
  document.getElementById('title').checked = prefs.title;
  document.getElementById('initialBlock').checked = prefs.initialBlock;
  document.getElementById('reverse').checked = prefs.reverse;
  document.getElementById('timeout').value = prefs.timeout;
  document.getElementById('close').value = prefs.close;
  document.getElementById('wrong').value = prefs.wrong;
  document.getElementById('message').value = prefs.message;
  document.getElementById('redirect').value = prefs.redirect;
  document.querySelector('#schedule [name=start]').value = prefs.schedule.time.start;
  document.querySelector('#schedule [name=end]').value = prefs.schedule.time.end;
  document.querySelector('#schedule [name=days]').value = prefs.schedule.days.join(', ');
  document.querySelector('#schedule [name=hostname]').value = '';
  document.querySelector('[data-cmd=unlock]').disabled = prefs.password === '';
  document.querySelector('[data-cmd="save"]').disabled = prefs.password !== '';
  document.querySelector('[data-cmd="export"]').disabled = prefs.password !== '';
  document.querySelector('[data-cmd="import-json"]').disabled = prefs.password !== '';
  document.getElementById('rules').textContent = '';

  prefs.rules.forEach(r => {
    if (r.schedule) {
      addTimeScheduleFromRuleHtml(r.rule)
    }
  })
});
init();

document.querySelector('#schedule [name="hostname"]').addEventListener('input', e => {
  const rule = getRule(e.target.value)
  if (rule) {
    const schedule = rule.schedule
    if (schedule) {
      document.querySelector('#schedule [name=start]').value = schedule.time.start;
      document.querySelector('#schedule [name=end]').value = schedule.time.end;
      document.querySelector('#schedule [name=days]').value = schedule.days.join(', ');
    }
  }
});

document.addEventListener('click', e => {
  const {
    target
  } = e;
  const cmd = target.dataset.cmd;
  if (cmd === 'remove') {
    removeRule(target.dataset.rule)
    target.closest('div').remove();
    //todo remove host
  } else if (cmd === 'unlock') {
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
  } else if (cmd === 'save') {
    let schedule = {
      time: {
        start: document.querySelector('#schedule [name=start]').value,
        end: document.querySelector('#schedule [name=end]').value
      },
      days: document.querySelector('#schedule [name=days]').value.split(/\s*,\s*/)
        .map(s => {
          return days.filter(d => s.trim().toLowerCase().startsWith(d.toLowerCase())).shift();
        }).filter((s, i, l) => s && l.indexOf(s) === i)
    };
    const rule = document.querySelector('#schedule [name="hostname"]');
    if (rule.value) {
      if (schedule.days.length && schedule.time.start && schedule.time.end) {
        addTimeScheduleFromRule(rule.value, schedule)
      } else {
        removeTimeScheduleFromRule(rule.value)
      }
      schedule = prefs.schedule;
    }

    //map redirect with rules
    [...document.querySelectorAll('#rules-container > div')].forEach((divRule) => {
      const {
        rule
      } = divRule.dataset;
      const redirect = divRule.querySelector('input[type=text]').value;
      if (redirect) {
        addRedirectFromRule(rule, redirect)
      }
    })
    console.log(prefs.rules)

    const password = document.getElementById('password').value;
    chrome.storage.local.set({
      password,
      title: document.getElementById('title').checked,
      initialBlock: document.getElementById('initialBlock').checked,
      reverse: document.getElementById('reverse').checked,
      redirect: document.getElementById('redirect').value,
      message: document.getElementById('message').value,
      timeout: Math.max(Number(document.getElementById('timeout').value), 1),
      close: Math.max(Number(document.getElementById('close').value), 0),
      wrong: Math.max(Number(document.getElementById('wrong').value), 1),
      schedule,
      rules: prefs.rules,
    }, () => {
      info.textContent = 'Options saved';
      window.setTimeout(() => info.textContent = '', 750);
      window.removeEventListener('beforeunload', warning);
      init(false);
    });
  } else if (cmd === 'import-txt') {
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
          return console.warn('100MB backup? I don\'t believe you.');
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
  } else if (cmd === 'export') {
    chrome.storage.local.get(null, prefs => {
      const blob = new Blob([
        JSON.stringify(prefs, null, '\t')
      ], {
        type: 'application/json'
      });
      const href = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), {
        href,
        type: 'application/json',
        download: 'block-site-preferences.json'
      }).dispatchEvent(new MouseEvent('click'));
      setTimeout(() => URL.revokeObjectURL(href));
    });
  } else if (cmd == 'import-json') {
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
          console.warn('100MB backup? I don\'t believe you.');
          return;
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
  } else if (cmd === 'reset') {
    if (e.detail === 1) {
      info.textContent = 'Double-click to reset!';
      window.setTimeout(() => info.textContent = '', 750);
    } else {
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