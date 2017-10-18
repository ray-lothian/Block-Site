'use strict';

var prefs = {
  timeout: 60,
  blocked: [],
  password: '',
  wrong: 1, // minutes
  title: true,
  map: {}
};

var list = document.getElementById('list');
var tbody = document.querySelector('#list tbody');
function add(hostname) {
  const template = document.querySelector('#list template');
  const node = document.importNode(template.content, true);
  const tr = node.querySelector('tr');
  tr.dataset.pattern = node.querySelector('td:nth-child(1)').textContent = '*://' + hostname + '/*';
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

chrome.storage.local.get(prefs, ps => {
  Object.assign(prefs, ps);
  prefs.blocked.forEach(add);
  document.getElementById('title').checked = prefs.title;
  document.getElementById('timeout').value = prefs.timeout;
  document.getElementById('wrong').value = prefs.wrong;
  document.querySelector('[data-cmd=unlock]').disabled = prefs.password === '';
  document.querySelector('[data-cmd=save]').disabled = prefs.password !== '';
});

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
      timeout: Math.max(Number(document.getElementById('timeout').value), 1),
      wrong: Math.max(Number(document.getElementById('wrong').value), 1),
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
      }, {}),
    }, () => {
      const info = document.getElementById('info');
      info.textContent = 'Options saved';
      window.setTimeout(() => info.textContent = '', 750);
    });
  }
});
