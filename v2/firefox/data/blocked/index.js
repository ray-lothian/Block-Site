/* globals tld */
'use strict';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  e[e.dataset.i18nValue || 'textContent'] = chrome.i18n.getMessage(e.dataset.i18n);
});

const args = new URLSearchParams(location.search);

document.getElementById('date').textContent = (new Date()).toLocaleString();
if (args.get('url')) {
  const o = new URL(args.get('url'));
  o.domain = tld.getDomain(o.host);

  document.getElementById('url').href = o.href;
  if (o.domain) {
    document.getElementById('sub-domain').textContent = o.hostname.replace(o.domain, '');
    document.getElementById('domain').textContent = o.domain;
  }
  else {
    document.getElementById('domain').textContent = o.host;
  }
  document.getElementById('pathname').textContent = o.pathname;
  document.getElementById('search').textContent = o.search;
}

document.addEventListener('submit', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({
    method: 'open-once',
    url: args.get('url'),
    password: e.target.querySelector('[type=password]').value
  });
});

document.getElementById('switch').addEventListener('click', () => {
  const val = document.documentElement.classList.contains('dark') === false;
  localStorage.setItem('dark', val);
  document.documentElement.classList[val ? 'add' : 'remove']('dark');
});
document.getElementById('options').addEventListener('click', e => {
  e.stopPropagation();
  chrome.runtime.sendMessage({
    'method': 'open-options'
  });
});

const title = () => fetch(args.get('url')).then(r => r.text()).then(content => {
  const dom = new DOMParser().parseFromString(content, 'text/html');
  if (dom.title) {
    document.getElementById('title').textContent = dom.title;
  }
});
// storage

Promise.all([
  new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve)),
  new Promise(resolve => chrome.storage.local.get({
    title: true,
    close: 0,
    message: '',
    css: '',
    password: '',
    sha256: '',
    reverse: false
  }, prefs => {
    document.getElementById('css').textContent = prefs.css;
    document.getElementById('message').textContent = prefs.message;

    resolve(prefs);
  }))
]).then(a => a[1]).then(prefs => {
  if (prefs.title && args.get('url')) {
    title();
  }
  // https://github.com/ray-lothian/Block-Site/issues/6
  if (prefs.close && window.top === window) {
    const title = document.title;
    window.setInterval(() => {
      document.title = title + ` (${prefs.close})`;
      prefs.close -= 1;
      if (prefs.close === -1) {
        chrome.runtime.sendMessage({
          method: 'close-tab'
        });
      }
    }, 1000);
  }
  //
  document.getElementById('exception').textContent = chrome.i18n.getMessage(
    prefs.reverse ? 'blocked_add_to_whitelist' : 'blocked_remove_blocking'
  );
  document.getElementById('exception').addEventListener('click', async e => {
    e.stopPropagation();
    const next = () => {
      if (prefs.reverse === false) {
        const url = document.getElementById('url');
        chrome.runtime.sendMessage({
          method: 'remove-from-list',
          href: url.href
        }, () => url.click());
      }
      else {
        const hostnames = [document.getElementById('domain').textContent];
        if (document.getElementById('sub-domain').textContent) {
          hostnames.push('*.' + document.getElementById('domain').textContent);
        }
        chrome.runtime.sendMessage({
          method: 'append-to-list',
          hostnames
        }, () => document.getElementById('url').click());
      }
    };
    const password = document.querySelector('[type=password]');
    if (prefs.password || prefs.sha256) {
      chrome.runtime.sendMessage({
        method: 'check-password',
        password: password.value
      }, resp => {
        if (resp) {
          next();
        }
        else {
          return password.focus();
        }
      });
    }
    else {
      next();
    }
  });
});

// external commands
chrome.runtime.onMessage.addListener(request => {
  if (request.method === 'press-exception') {
    const msg = chrome.i18n.getMessage('bg_msg_13').replace('##', document.getElementById('domain').textContent);
    // Ignored call to 'confirm()'. The document is sandboxed, and the 'allow-modals' keyword is not set.
    if (window.confirm(msg) || window.top !== window) {
      document.getElementById('exception').click();
    }
  }
});

// live style editing
chrome.storage.onChanged.addListener(prefs => {
  if (prefs.css) {
    document.getElementById('css').textContent = prefs.css.newValue;
  }
});
