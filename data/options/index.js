'use strict';

var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

var prefs = {
  timeout: 60, // seconds
  close: 0, // seconds
  message: '',
  redirect: '',
  blocked: [],
  password: '',
  wrong: 1, // minutes
  title: true,
  reverse: false,
  map: {},
  schedule: {
    time: {
      start: '',
      end: ''
    },
    days
  },
  initialBlock: true
};

var list = document.getElementById('list');
var tbody = document.querySelector('#list tbody');
var wildcard = h => {
  if (h.indexOf('://') === -1) {
    return `*://${h}/*`;
  }
  return h;
};

function add(hostname) {
  const template = document.querySelector('#list template');
  const node = document.importNode(template.content, true);
  const tr = node.querySelector('tr');
  tr.dataset.pattern = node.querySelector('td:nth-child(1)').textContent = wildcard(hostname);
  tr.dataset.hostname = hostname;
  node.querySelector('td:nth-child(2) input').value = prefs.map[hostname] || '';
  node.querySelector('td:nth-child(2) input').disabled = hostname.indexOf('*') !== -1;
  tbody.appendChild(node);
  list.dataset.visible = true;
}

document.getElementById('add').addEventListener('submit', e => {
  e.preventDefault();
  const hostname = e.target.querySelector('input[type=text]').value;
  if (hostname) {
    add(hostname);
  }
});

var init = (table = true) => chrome.storage.local.get(prefs, ps => {
  Object.assign(prefs, ps);
  if (table) {
    prefs.blocked.forEach(add);
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
  document.querySelector('[data-cmd=unlock]').disabled = prefs.password === '';
  document.querySelector('[data-cmd=save]').disabled = prefs.password !== '';
});
init();

document.addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'remove') {
    const tr = target.closest('tr');
    tr.parentNode.removeChild(tr);
  }
  else if (cmd === 'unlock') {
    const password = document.getElementById('password').value;
    chrome.runtime.sendMessage({
      method: 'check-password',
      password
    }, resp => {
      document.querySelector('[data-cmd=unlock]').disabled = resp;
      document.querySelector('[data-cmd=save]').disabled = !resp;
    });
  }
  else if (cmd === 'save') {
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
      schedule: {
        time: {
          start: document.querySelector('#schedule [name=start]').value,
          end: document.querySelector('#schedule [name=end]').value
        },
        days: document.querySelector('#schedule [name=days]').value.split(/\s*,\s*/)
          .map(s => {
            return days.filter(d => s.trim().toLowerCase().startsWith(d.toLowerCase())).shift();
          }).filter((s, i, l) => s && l.indexOf(s) === i)
      },
      blocked: [...document.querySelectorAll('#list tbody tr')]
        .map(tr => tr.dataset.hostname)
        .filter((s, i, l) => s && l.indexOf(s) === i),
      map: [...document.querySelectorAll('#list tbody tr')].reduce((p, c) => {
        const {hostname} = c.dataset;
        const mapped = c.querySelector('input[type=text]').value;
        if (mapped) {
          p[hostname] = mapped;
        }
        return p;
      }, {})
    }, () => {
      const info = document.getElementById('info');
      info.textContent = 'Options saved';
      window.setTimeout(() => info.textContent = '', 750);
      init(false);
    });
  }
});

document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));
