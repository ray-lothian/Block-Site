/* global tld */
'use strict';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  e[e.dataset.i18nValue || 'textContent'] = chrome.i18n.getMessage(e.dataset.i18n);
});

// post with health check
const post = (o, c = () => {}) => {
  const check = () => {
    if (confirm('Worker is not responding! Would you like to restart the extension?')) {
      chrome.runtime.reload();
    }
  };
  const id = setTimeout(check, 2000);

  chrome.runtime.sendMessage(o, r => {
    clearTimeout(id);
    c(r);
  });
};

const args = new URLSearchParams(location.search);
const href = location.search.split('url=')[1];

document.getElementById('date').textContent = (new Date()).toLocaleString();
if (args.has('url')) {
  const o = new URL(href);
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
  post({
    method: 'open-once',
    url: href.split('?')[0] + '*',
    password: e.target.querySelector('[type=password]').value
  }, b => {
    if (b) {
      document.getElementById('url').click();
    }
  });
});

document.getElementById('switch').addEventListener('click', () => {
  const val = document.documentElement.classList.contains('dark') === false;
  localStorage.setItem('dark', val);
  document.documentElement.classList[val ? 'add' : 'remove']('dark');
});
document.getElementById('options').addEventListener('click', e => {
  e.stopPropagation();

  if (chrome.extension.inIncognitoContext) {
    return alert(chrome.i18n.getMessage('bg_msg_29'));
  }

  chrome.runtime.openOptionsPage();
});

const title = () => fetch(href).then(r => r.text()).then(content => {
  const dom = new DOMParser().parseFromString(content, 'text/html');
  document.getElementById('title').textContent = dom.title || 'Unknown';
}).catch(() => document.getElementById('title').textContent = 'Unknown');

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
    reverse: false,
    blocked: []
  }, prefs => {
    document.getElementById('css').textContent = prefs.css;
    document.getElementById('message').textContent = prefs.message;

    resolve(prefs);
  }))
]).then(a => a[1]).then(prefs => {
  if (prefs.title && href) {
    title();
  }
  // https://github.com/ray-lothian/Block-Site/issues/6
  if (prefs.close && window.top === window) {
    const title = document.title;
    window.setInterval(() => {
      document.title = title + ` (${prefs.close})`;
      prefs.close -= 1;
      if (prefs.close === -1) {
        post({
          method: 'close-page'
        });
        window.close();
      }
    }, 1000);
  }
  //
  document.getElementById('exception').textContent = chrome.i18n.getMessage(
    prefs.reverse ? 'blocked_add_to_whitelist' : 'blocked_remove_blocking'
  );
  document.getElementById('exception').addEventListener('click', e => {
    e.stopPropagation();

    if (chrome.extension.inIncognitoContext) {
      return alert(chrome.i18n.getMessage('bg_msg_29'));
    }

    const next = () => {
      const url = document.getElementById('url');
      if (prefs.reverse === false) {
        chrome.storage.local.get({
          reverse: false,
          blocked: []
        }, prefs => {
          if (prefs.reverse === false) {
            post({
              method: 'convert',
              hosts: prefs.blocked
            }, resp => {
              const len = prefs.blocked.length;
              prefs.blocked = [...prefs.blocked].filter((s, i) => {
                try {
                  const r = new RegExp(resp[i], 'i');
                  return r.test(url) === false;
                }
                catch (e) {
                  return true;
                }
              });
              document.title = `Removed ${len - prefs.blocked.length} rule(s)`;

              chrome.storage.local.set(prefs, () => {
                setTimeout(() => url.click(), 1000);
              });
            });
          }
        });
      }
      else {
        const hostnames = [document.getElementById('domain').textContent];
        if (document.getElementById('sub-domain').textContent) {
          hostnames.push('*.' + document.getElementById('domain').textContent);
        }
        document.title = `Added ${hostnames.length} new rule(s)`;
        chrome.storage.local.set({
          blocked: [...prefs.blocked, ...hostnames]
        }, () => {
          setTimeout(() => url.click(), 1000);
        });
      }
    };
    const password = document.querySelector('[type=password]');
    if (prefs.password || prefs.sha256) {
      post({
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

// focus
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('input[type=password]').focus();
});
