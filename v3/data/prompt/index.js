/* global tld */

'use strict';

const STORES = ['chrome.google.com', 'microsoftedge.microsoft.com', 'addons.mozilla.org', 'addons.opera.com'];
const args = new URLSearchParams(location.search);
const extra = JSON.parse(args.get('extra') || '{}');

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
        let v = d;
        const ds = [d];
        // referrer
        if (extra.referrer) {
          const domain = tld.getDomain(extra.referrer);
          if (domain && ds.includes(domain) === false) {
            v += ' [' + chrome.i18n.getMessage('pp_msg_1').replace('##', domain) + ']';
          }
        }
        document.getElementById('password').value = ds.join(', ');
        document.getElementById('message').textContent = args.get('message').replace('##', v);

        for (const d of ds) {
          if (STORES.includes(d)) {
            setTimeout(() => alert(chrome.i18n.getMessage('bg_msg_21')), 2000);
          }
        }
      };

      const domain = tld.getDomain(args.get('value'));

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
  try {
    port.postMessage({
      method: 'prompt-resolved'
    });
  }
  catch (e) {}
  window.close();
});
document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const password = document.getElementById('password').value;

  const next = () => {
    try {
      port.postMessage({
        method: 'prompt-resolved',
        password
      });
    }
    catch (e) {}
    window.close();
  };

  if (args.get('command') === 'convert-to-domain') {
    chrome.storage.local.get({
      blocked: [],
      notes: {}
    }, prefs => {
      for (const rule of password.split(/\s*,\s*/)) {
        if (prefs.blocked.includes(rule) === false) {
          prefs.blocked.push(rule);
          prefs.notes[rule] = {
            date: Date.now(),
            origin: 'prompt',
            count: 0
          };
        }
      }
      chrome.storage.local.set(prefs, () => {
        next();
      });
    });
  }
  else {
    next();
  }
});

document.getElementById('password').addEventListener('input', e => {
  document.getElementById('ok').disabled = e.target.value === '';
});

window.addEventListener('blur', () => setTimeout(() => port.postMessage({
  method: 'bring-to-front'
})), 1000);
window.onbeforeunload = () => port.postMessage({
  method: 'prompt-resolved'
});

document.addEventListener('keyup', e => {
  if (e.code === 'Escape') {
    window.close();
  }
});

// close all other prompts since we do not support multiple at the moment
chrome.runtime.sendMessage({
  method: 'close-prompts'
});
chrome.runtime.onMessage.addListener(request => {
  if (request.method === 'close-prompts') {
    window.close();
  }
});
