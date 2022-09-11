/* global tld */

'use strict';

const STORES = ['chrome.google.com', 'microsoftedge.microsoft.com', 'addons.mozilla.org', 'addons.opera.com'];
const args = new URLSearchParams(location.search);

document.getElementById('message').textContent = args.get('message') || 'NA';

const port = chrome.runtime.connect({
  name: 'prompt'
});

if (args.get('hidden') === 'false') {
  document.getElementById('password').type = 'text';
}
if (args.get('value')) {
  document.getElementById('password').value = args.get('value');
  document.getElementById('ok').disabled = false;
}
if (args.get('command') === 'convert-to-domain') {
  const s = document.createElement('script');
  s.src = '/data/blocked/tld.js';
  s.onload = () => {
    try {
      const next = d => {
        document.getElementById('message').textContent = args.get('message').replace('##', d);
        document.getElementById('password').value = d;

        if (STORES.includes(d)) {
          setTimeout(() => alert(chrome.i18n.getMessage('bg_msg_21')), 2000);
        }
      };

      const domain = tld.getDomain(location.hostname);
      if (domain) {
        return next(domain);
      }
      const o = new URL(args.get('value'));
      next(o.hostname);
    }
    catch (e) {
      alert('Error: ' + e.message);
    }
    return [location.hostname];
  };
  document.body.append(s);
}

document.getElementById('cancel').addEventListener('click', () => {
  port.postMessage({
    method: 'prompt-resolved'
  });
  window.close();
});
document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  port.postMessage({
    method: 'prompt-resolved',
    password: document.getElementById('password').value
  });
  window.close();
});

document.getElementById('password').addEventListener('input', e => {
  document.getElementById('ok').disabled = e.target.value === '';
});

window.addEventListener('blur', () => port.postMessage({
  method: 'bring-to-front'
}));
window.onbeforeunload = () => port.postMessage({
  method: 'prompt-resolved'
});

document.addEventListener('keyup', e => {
  if (e.code === 'Escape') {
    window.close();
  }
});
